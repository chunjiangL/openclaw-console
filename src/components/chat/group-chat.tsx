"use client";

import { useGatewayStore } from "@/lib/stores/gateway-store";
import { useChatStore, onRunComplete, type AgentRun } from "@/lib/stores/chat-store";
import { useGroupStore, type GroupMessage } from "@/lib/stores/group-store";
import { useTraceStore } from "@/lib/stores/trace-store";
import { useRouter } from "@/lib/router";
import { useState, useEffect, useRef, useCallback } from "react";
import { Spinner } from "@/components/ui/spinner";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import { TraceTimeline } from "./trace-timeline";
import { uuid } from "@/lib/uuid";
import {
  buildSessionKey as _buildSessionKey,
  matchesGroup,
  getRecentAgentReplies as _getRecentAgentReplies,
  MAX_INJECT_LENGTH,
} from "./group-chat-utils";

export function GroupChat() {
  const { params } = useRouter();
  const groupId = params.groupId;
  const rpc = useGatewayStore((s) => s.rpc);
  const agents = useGatewayStore((s) => s.agents);
  const connectionState = useGatewayStore((s) => s.connectionState);
  const startRun = useChatStore((s) => s.startRun);
  const runs = useChatStore((s) => s.runs);
  const groups = useGroupStore((s) => s.groups);
  const addMessage = useGroupStore((s) => s.addMessage);
  const getGroupMessages = useGroupStore((s) => s.getGroupMessages);
  const updateGroup = useGroupStore((s) => s.updateGroup);
  const clearGroupMessages = useGroupStore((s) => s.clearGroupMessages);

  const group = groups.find((g) => g.id === groupId);
  const messages = groupId ? getGroupMessages(groupId) : [];

  const [input, setInput] = useState("");
  const [mentionSearch, setMentionSearch] = useState<string | null>(null);
  const [mentions, setMentions] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterSender, setFilterSender] = useState<string>("all"); // "all" | "user" | agentId
  const [filterType, setFilterType] = useState<string>("all"); // "all" | "links" | "errors"
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("chat"); // "chat" | agentId
  const traceEnabled = useTraceStore((s) => s.enabled);
  const setTraceEnabled = useTraceStore((s) => s.setEnabled);
  const traceMap = useTraceStore((s) => s.traces);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, runs]);

  // Reactively persist completed runs that haven't been saved to group messages yet.
  // This replaces the fragile onRunComplete callback approach — works regardless of
  // timing, component re-renders, or closure staleness.
  useEffect(() => {
    if (!groupId) return;
    const completedRuns = Array.from(runs.values()).filter(
      (r) =>
        matchesGroup(r.sessionKey, groupId) &&
        (r.status === "done" || r.status === "error" || r.status === "aborted") &&
        !messages.some((m) => m.role === "agent" && m.runIds?.includes(r.runId))
    );

    for (const run of completedRuns) {
      const content =
        run.status === "done"
          ? (run.finalMessage?.content ?? run.streamedText)
          : run.status === "error"
            ? `[ERROR] ${run.errorMessage ?? "Unknown error"}`
            : "[ABORTED]";

      useGroupStore.getState().addMessage({
        id: uuid(),
        groupId,
        role: "agent",
        agentId: run.agentId,
        content,
        timestamp: run.completedAt ?? Date.now(),
        targetAgents: [],
        runIds: [run.runId],
      });
    }
  }, [groupId, runs, messages]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    filterSender !== "all" ||
    filterType !== "all" ||
    filterDateFrom !== "" ||
    filterDateTo !== "";

  const filteredMessages = hasActiveFilters
    ? messages.filter((m) => {
        // Text search
        if (searchQuery.trim() && !m.content.toLowerCase().includes(searchQuery.toLowerCase())) return false;
        // Sender filter
        if (filterSender === "user" && m.role !== "user") return false;
        if (filterSender !== "all" && filterSender !== "user" && m.agentId !== filterSender) return false;
        // Content type filter
        if (filterType === "links" && !/https?:\/\//.test(m.content)) return false;
        if (filterType === "errors" && !/\[error\]/i.test(m.content)) return false;
        // Date range
        if (filterDateFrom) {
          const from = new Date(filterDateFrom).getTime();
          if (m.timestamp < from) return false;
        }
        if (filterDateTo) {
          const to = new Date(filterDateTo).getTime() + 86400000; // end of day
          if (m.timestamp >= to) return false;
        }
        return true;
      })
    : messages;

  const clearFilters = () => {
    setSearchQuery("");
    setFilterSender("all");
    setFilterType("all");
    setFilterDateFrom("");
    setFilterDateTo("");
  };

  const handleClearHistory = () => {
    if (!groupId) return;
    if (!confirm("Clear all chat history for this group? This cannot be undone.")) return;
    clearGroupMessages(groupId);
  };

  const groupAgents = group
    ? agents.filter((a) => group.agents.includes(a.agentId))
    : [];

  const buildSessionKey = (agentId: string) =>
    _buildSessionKey(agentId, groupId!);

  const getRecentAgentReplies = useCallback(
    (excludeMessageId?: string) =>
      _getRecentAgentReplies(messages, agents, excludeMessageId),
    [messages, agents]
  );

  const injectContext = async (
    agentId: string,
    replies: string[]
  ) => {
    for (const reply of replies) {
      await rpc("chat.inject", {
        sessionKey: buildSessionKey(agentId),
        message: reply,
        label: "context-share",
      });
    }
  };

  const sendToAgent = async (
    agentId: string,
    text: string,
    userMessageId: string
  ): Promise<AgentRun | null> => {
    const sessionKey = buildSessionKey(agentId);
    const idempotencyKey = uuid();

    try {
      const result = await rpc<{ runId: string; status: string }>(
        "chat.send",
        { sessionKey, message: text, idempotencyKey }
      );

      startRun({
        runId: result.runId,
        agentId,
        sessionKey,
        userMessageId,
      });

      return {
        runId: result.runId,
        agentId,
        sessionKey,
        userMessageId,
        status: "queued",
        streamedText: "",
        startedAt: Date.now(),
      };
    } catch (err) {
      console.error(`Send to ${agentId} failed:`, err);
      return null;
    }
  };

  const waitForRun = (runId: string): Promise<AgentRun> => {
    return new Promise((resolve) => {
      onRunComplete(runId, resolve);
    });
  };

  const handleSend = async () => {
    if (!input.trim() || !group || sending) return;
    setSending(true);

    const targetAgents =
      mentions.length > 0
        ? mentions
        : group.agents;

    const userMsg: GroupMessage = {
      id: uuid(),
      groupId: group.id,
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
      targetAgents,
      runIds: [],
    };

    addMessage(userMsg);
    const text = input.trim();
    setInput("");
    setMentions([]);

    try {
      if (group.responseMode === "parallel") {
        const promises = targetAgents.map(async (agentId) => {
          if (group.contextSharing) {
            const replies = getRecentAgentReplies(userMsg.id);
            await injectContext(agentId, replies);
          }
          const run = await sendToAgent(agentId, text, userMsg.id);
          return run;
        });

        const results = await Promise.allSettled(promises);
        const runIds = results
          .filter(
            (r): r is PromiseFulfilledResult<AgentRun | null> =>
              r.status === "fulfilled" && r.value !== null
          )
          .map((r) => r.value!.runId);

        userMsg.runIds = runIds;
      } else {
        const runIds: string[] = [];
        const completedReplies: string[] = [];

        for (const agentId of targetAgents) {
          if (group.contextSharing) {
            const priorReplies = getRecentAgentReplies(userMsg.id);
            await injectContext(agentId, [
              ...priorReplies,
              ...completedReplies,
            ]);
          }

          const run = await sendToAgent(agentId, text, userMsg.id);
          if (!run) continue;

          runIds.push(run.runId);
          const finishedRun = await waitForRun(run.runId);

          if (group.contextSharing) {
            const agentObj = agents.find((a) => a.agentId === agentId);
            const name = agentObj?.name ?? agentId;

            if (finishedRun.status === "done") {
              const content =
                finishedRun.finalMessage?.content ?? finishedRun.streamedText;
              const truncated =
                content.length > MAX_INJECT_LENGTH
                  ? content.slice(0, MAX_INJECT_LENGTH) + "..."
                  : content;
              completedReplies.push(`[${name} replied]:\n${truncated}`);
            } else if (finishedRun?.status === "error") {
              completedReplies.push(`[${name} ERROR]: ${finishedRun.errorMessage ?? "Unknown error"}`);
            }
          }
        }

        userMsg.runIds = runIds;
      }
    } finally {
      setSending(false);
    }
  };

  const abortAll = async () => {
    if (!group) return;
    for (const agentId of group.agents) {
      try {
        await rpc("chat.abort", { sessionKey: buildSessionKey(agentId) });
      } catch {
        // continue
      }
    }
  };

  const handleInputChange = (value: string) => {
    setInput(value);
    const lastAt = value.lastIndexOf("@");
    if (lastAt !== -1) {
      const afterAt = value.slice(lastAt + 1);
      if (!afterAt.includes(" ")) {
        setMentionSearch(afterAt.toLowerCase());
        return;
      }
    }
    setMentionSearch(null);
  };

  const addMention = (agentId: string) => {
    const lastAt = input.lastIndexOf("@");
    const newInput = lastAt >= 0 ? input.slice(0, lastAt) : input;
    setInput(newInput);
    if (agentId === "all") {
      setMentions(group?.agents ?? []);
    } else if (!mentions.includes(agentId)) {
      setMentions([...mentions, agentId]);
    }
    setMentionSearch(null);
    inputRef.current?.focus();
  };

  const activeGroupRuns = Array.from(runs.values()).filter(
    (r) =>
      groupId &&
      matchesGroup(r.sessionKey, groupId!) &&
      (r.status === "queued" || r.status === "streaming")
  );

  if (!group) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-dim">GROUP NOT FOUND</p>
      </div>
    );
  }

  if (connectionState !== "connected") {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-dim">CONNECT TO GATEWAY FIRST</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Group Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <h2 className="text-sm font-bold uppercase tracking-wide text-fg shrink-0">{group.name}</h2>
          <div className="hidden md:block w-px h-4 bg-border-default" />
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-dim truncate">
            {groupAgents.map((a) => a.name).join(" / ")}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClearHistory}
            disabled={messages.length === 0}
            className="border border-border-interactive px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg hover:border-border-hover transition-all disabled:opacity-30"
          >
            [CLEAR]
          </button>
          <GroupSettings group={group} onUpdate={updateGroup} agents={agents} />
        </div>
      </div>

      {/* Search + Filters */}
      <div className="mb-2">
        <div className="flex items-center border border-border-interactive bg-surface focus-within:border-border-focus transition-colors">
          <span className="pl-3 font-mono text-[10px] text-fg-ghost">SEARCH</span>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="FILTER MESSAGES..."
            className="flex-1 bg-transparent px-2 py-1.5 font-mono text-xs text-fg focus:outline-none"
          />
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              showFilters || hasActiveFilters ? "text-fg" : "text-fg-ghost hover:text-fg-dim"
            }`}
          >
            {hasActiveFilters ? "[FILTERS ON]" : "[FILTERS]"}
          </button>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="pr-3 font-mono text-[10px] text-fg-dim hover:text-fg transition-colors"
            >
              [X]
            </button>
          )}
        </div>

        {showFilters && (
          <div className="mt-1 border border-border-interactive bg-surface p-3">
            <div className="flex flex-wrap gap-3">
              {/* Sender */}
              <div>
                <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.15em] text-fg-dim">FROM</label>
                <select
                  value={filterSender}
                  onChange={(e) => setFilterSender(e.target.value)}
                  className="border border-border-interactive bg-surface px-2 py-1 font-mono text-[10px] text-fg focus:outline-none focus:border-border-focus"
                >
                  <option value="all">EVERYONE</option>
                  <option value="user">YOU</option>
                  {groupAgents.map((a) => (
                    <option key={a.agentId} value={a.agentId}>{a.name}</option>
                  ))}
                </select>
              </div>

              {/* Content type */}
              <div>
                <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.15em] text-fg-dim">TYPE</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="border border-border-interactive bg-surface px-2 py-1 font-mono text-[10px] text-fg focus:outline-none focus:border-border-focus"
                >
                  <option value="all">ALL</option>
                  <option value="links">HAS LINKS</option>
                  <option value="errors">ERRORS</option>
                </select>
              </div>

              {/* Date from */}
              <div>
                <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.15em] text-fg-dim">FROM DATE</label>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="border border-border-interactive bg-surface px-2 py-1 font-mono text-[10px] text-fg focus:outline-none focus:border-border-focus"
                />
              </div>

              {/* Date to */}
              <div>
                <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.15em] text-fg-dim">TO DATE</label>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="border border-border-interactive bg-surface px-2 py-1 font-mono text-[10px] text-fg focus:outline-none focus:border-border-focus"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="mb-2 flex items-center border-b border-border-default">
        <button
          onClick={() => setActiveTab("chat")}
          className={`px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            activeTab === "chat"
              ? "text-fg border-b-2 border-border-solid"
              : "text-fg-ghost hover:text-fg-dim"
          }`}
        >
          [CHAT]
        </button>
        {traceEnabled &&
          group.agents
            .filter((id) => {
              const t = traceMap.get(id);
              return t && t.entries.length > 0;
            })
            .map((id) => {
              const a = agents.find((x) => x.agentId === id);
              return (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                    activeTab === id
                      ? "text-fg border-b-2 border-border-solid"
                      : "text-fg-ghost hover:text-fg-dim"
                  }`}
                >
                  [TRACE: {a?.name ?? id}]
                </button>
              );
            })}
        <div className="flex-1" />
        <button
          onClick={() => setTraceEnabled(!traceEnabled)}
          className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-ghost hover:text-fg-dim transition-colors"
        >
          {traceEnabled ? "[TRACE ON]" : "[TRACE OFF]"}
        </button>
      </div>

      {/* Content area */}
      {activeTab !== "chat" && traceEnabled ? (
        <div className="flex-1 overflow-y-auto border border-border-default bg-surface p-4">
          <TraceTimeline agentId={activeTab} />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto border border-border-default bg-surface p-4">
        {hasActiveFilters && (
          <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
            {filteredMessages.length} OF {messages.length} MESSAGES
          </div>
        )}
        {filteredMessages.map((msg) => {
          if (msg.role === "user") {
            return (
              <div key={msg.id} className="mb-3 flex justify-start">
                <div className="flex items-start gap-2 max-w-[90%] sm:max-w-[75%]">
                  <UserAvatar size={20} className="mt-1 shrink-0 text-fg-dim" />
                  <div>
                    <span className="font-mono text-[9px] text-fg-dim uppercase tracking-wider">YOU</span>
                    {/* Mention pills */}
                    {msg.targetAgents.length > 0 &&
                      msg.targetAgents.length < (group.agents.length) && (
                        <div className="mb-1 mt-0.5 flex flex-wrap gap-1">
                          {msg.targetAgents.map((id) => {
                            const a = agents.find((x) => x.agentId === id);
                            return (
                              <span
                                key={id}
                                className="border border-border-pill px-1.5 py-0.5 font-mono text-[8px] text-fg uppercase tracking-wider"
                              >
                                @{a?.name ?? id}
                              </span>
                            );
                          })}
                        </div>
                      )}
                    <div className="border border-border-interactive bg-active px-3 py-2 mt-0.5">
                      <p className="font-mono text-sm text-fg whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // Agent message
          const agent = agents.find((a) => a.agentId === msg.agentId);
          return (
            <div key={msg.id} className="mb-3 flex justify-start">
              <div className="flex items-start gap-2 max-w-[90%] sm:max-w-[75%]">
                <AgentAvatar seed={msg.agentId ?? "ai"} size={20} className="mt-1 shrink-0" />
                <div>
                  <span className="font-mono text-[9px] text-fg-dim uppercase tracking-wider">
                    {agent?.name ?? msg.agentId ?? "AI"}
                  </span>
                  <div className="border border-border-default px-3 py-2 mt-0.5">
                    <p className="font-mono text-sm text-fg-faint whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Active streaming runs */}
        {activeGroupRuns.map((run) => {
          const agent = agents.find((a) => a.agentId === run.agentId);
          return (
            <div key={run.runId} className="mb-3 flex justify-start">
              <div className="flex items-start gap-2 max-w-[90%] sm:max-w-[75%]">
                <AgentAvatar seed={run.agentId} size={20} className="mt-1 shrink-0" />
                <div>
                  <span className="font-mono text-[9px] text-fg-dim uppercase tracking-wider">
                    {agent?.name ?? run.agentId}
                  </span>
                  <div className="border border-border-default px-3 py-2 mt-0.5">
                    {run.status === "queued" ? (
                      <Spinner />
                    ) : (
                      <p className="font-mono text-sm text-fg-faint whitespace-pre-wrap">
                        {run.streamedText}
                        <span className="inline-block w-2 h-4 bg-fg ml-0.5" style={{ animation: "blink 1s step-end infinite" }} />
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {/* Completed runs not yet in messages */}
        {Array.from(runs.values())
          .filter(
            (r) =>
              groupId &&
              matchesGroup(r.sessionKey, groupId!) &&
              r.status === "done" &&
              !messages.some((m) => m.role === "agent" && m.runIds?.includes(r.runId))
          )
          .map((run) => {
            const agent = agents.find((a) => a.agentId === run.agentId);
            return (
              <div key={run.runId} className="mb-3 flex justify-start">
                <div className="flex items-start gap-2 max-w-[90%] sm:max-w-[75%]">
                  <AgentAvatar seed={run.agentId} size={20} className="mt-1 shrink-0" />
                  <div>
                    <span className="font-mono text-[9px] text-fg-dim uppercase tracking-wider">
                      {agent?.name ?? run.agentId}
                    </span>
                    <div className="border border-border-default px-3 py-2 mt-0.5">
                      <p className="font-mono text-sm text-fg-faint whitespace-pre-wrap">
                        {run.finalMessage?.content ?? run.streamedText}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

        {/* Error runs not yet in messages */}
        {Array.from(runs.values())
          .filter(
            (r) =>
              groupId &&
              matchesGroup(r.sessionKey, groupId!) &&
              r.status === "error" &&
              !messages.some((m) => m.role === "agent" && m.runIds?.includes(r.runId))
          )
          .map((run) => {
            const agent = agents.find((a) => a.agentId === run.agentId);
            return (
              <div key={run.runId} className="mb-3 flex justify-start">
                <div className="flex items-start gap-2 max-w-[90%] sm:max-w-[75%]">
                  <AgentAvatar seed={run.agentId} size={20} className="mt-1 shrink-0" />
                  <div>
                    <span className="font-mono text-[9px] text-fg-dim uppercase tracking-wider">
                      {agent?.name ?? run.agentId}
                    </span>
                    <span className="ml-2 font-mono text-[10px] text-fg-subtle uppercase tracking-wider">[ERR]</span>
                    <div className="border border-border-default px-3 py-2 mt-0.5">
                      <p className="font-mono text-sm text-fg-subtle whitespace-pre-wrap">
                        {run.errorMessage}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

        <div ref={messagesEndRef} />
      </div>
      )}

      {/* Mention pills */}
      {mentions.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {mentions.map((id) => {
            const a = agents.find((x) => x.agentId === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 border border-border-pill px-2 py-0.5 font-mono text-[10px] text-fg uppercase tracking-wider"
              >
                @{a?.name ?? id}
                <button
                  onClick={() => setMentions(mentions.filter((m) => m !== id))}
                  className="text-fg-dim hover:text-fg transition-colors ml-1"
                >
                  x
                </button>
              </span>
            );
          })}
          <button
            onClick={() => setMentions([])}
            className="font-mono text-[10px] uppercase tracking-wider text-fg-ghost hover:text-fg-subtle transition-colors"
          >
            CLEAR
          </button>
        </div>
      )}

      {/* @mention autocomplete */}
      {mentionSearch !== null && (
        <div className="mt-1 border border-border-interactive bg-surface p-1">
          <button
            onClick={() => addMention("all")}
            className="flex w-full items-center px-2 py-1.5 font-mono text-xs uppercase tracking-wider text-fg-muted hover:text-fg hover:bg-hover transition-all"
          >
            @ALL — ALL AGENTS
          </button>
          {groupAgents
            .filter((a) =>
              a.name.toLowerCase().includes(mentionSearch)
            )
            .map((a) => (
              <button
                key={a.agentId}
                onClick={() => addMention(a.agentId)}
                className="flex w-full items-center gap-2 px-2 py-1.5 font-mono text-xs uppercase tracking-wider text-fg-muted hover:text-fg hover:bg-hover transition-all"
              >
                                @{a.name}
              </button>
            ))}
        </div>
      )}

      {/* Input */}
      <div className="mt-3 flex gap-2">
        <div data-focus-container className="flex-1 flex items-center border border-border-interactive bg-surface focus-within:border-border-focus transition-colors">
          <span className="pl-3 font-mono text-[10px] text-fg-ghost">&gt;</span>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => handleInputChange(e.target.value)}
            placeholder="TYPE MESSAGE... (@ TO MENTION)"
            rows={2}
            className="flex-1 bg-transparent px-2 py-2 font-mono text-sm text-fg focus:outline-none resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
              if (e.key === "Escape") {
                setMentionSearch(null);
              }
            }}
            disabled={sending}
          />
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg disabled:opacity-30"
          >
            {sending ? "..." : "[SEND]"}
          </button>
          {activeGroupRuns.length > 0 && (
            <button
              onClick={abortAll}
              className="border border-border-interactive px-4 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-subtle hover:bg-active transition-all"
            >
              [ABORT]
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Group Settings inline component
function GroupSettings({
  group,
  onUpdate,
  agents,
}: {
  group: { id: string; responseMode: string; contextSharing: boolean; agents: string[] };
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
  agents: { agentId: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="border border-border-interactive px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg hover:border-border-hover transition-all"
      >
        [CHAT CONFIG]
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-64 border border-border-interactive bg-surface p-3">
          <div className="space-y-3">
            <div>
              <label className="mb-1 block font-mono text-[10px] uppercase tracking-[0.15em] text-fg-muted">
                RESPONSE MODE
              </label>
              <select
                value={group.responseMode}
                onChange={(e) =>
                  onUpdate(group.id, { responseMode: e.target.value })
                }
                className="w-full border border-border-interactive bg-surface px-2 py-1.5 font-mono text-xs text-fg focus:outline-none focus:border-border-focus"
              >
                <option value="parallel">PARALLEL</option>
                <option value="sequential">SEQUENTIAL</option>
              </select>
            </div>
            <div className="flex items-center justify-between">
              <label className="font-mono text-[10px] uppercase tracking-[0.15em] text-fg-muted">
                CONTEXT SHARING
              </label>
              <button
                onClick={() =>
                  onUpdate(group.id, { contextSharing: !group.contextSharing })
                }
                className={`px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-all ${
                  group.contextSharing
                    ? "bg-accent text-accent-fg"
                    : "border border-border-interactive text-fg-muted"
                }`}
              >
                {group.contextSharing ? "[ON]" : "[OFF]"}
              </button>
            </div>
            <div>
              <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.15em] text-fg-muted">
                AGENTS IN GROUP
              </label>
              <div className="space-y-1">
                {agents.map((a) => {
                  const isIn = group.agents.includes(a.agentId);
                  return (
                    <button
                      key={a.agentId}
                      onClick={() => {
                        const newAgents = isIn
                          ? group.agents.filter((id: string) => id !== a.agentId)
                          : [...group.agents, a.agentId];
                        onUpdate(group.id, { agents: newAgents });
                      }}
                      className={`flex w-full items-center gap-2 px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-all ${
                        isIn
                          ? "text-fg bg-hover"
                          : "text-fg-dim hover:text-fg-subtle"
                      }`}
                    >
                      <span className="font-mono text-xs">
                        {isIn ? "●" : "○"}
                      </span>
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
