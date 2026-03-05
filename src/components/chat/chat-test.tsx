"use client";

import { useGatewayStore } from "@/lib/stores/gateway-store";
import { useChatStore } from "@/lib/stores/chat-store";
import { useTraceStore } from "@/lib/stores/trace-store";
import { useState, useEffect, useRef } from "react";
import { Spinner } from "@/components/ui/spinner";
import { AgentAvatar } from "@/components/ui/agent-avatar";
import { UserAvatar } from "@/components/ui/user-avatar";
import { TraceTimeline } from "./trace-timeline";
import { extractText } from "@/lib/gateway/types";
import { uuid } from "@/lib/uuid";
import type { ChatMessage, ChatHistoryResult } from "@/lib/gateway/types";

export function ChatTest() {
  const rpc = useGatewayStore((s) => s.rpc);
  const agents = useGatewayStore((s) => s.agents);
  const connectionState = useGatewayStore((s) => s.connectionState);
  const startRun = useChatStore((s) => s.startRun);
  const runs = useChatStore((s) => s.runs);

  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [sessionKey, setSessionKey] = useState("");
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [tab, setTab] = useState<"chat" | "trace">("chat");
  const traceEnabled = useTraceStore((s) => s.enabled);
  const setTraceEnabled = useTraceStore((s) => s.setEnabled);
  const traceData = useTraceStore((s) => s.traces.get(selectedAgentId));
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedAgentId) {
      setSessionKey(`agent:${selectedAgentId}:claw-console:test:${uuid().slice(0, 8)}`);
    }
  }, [selectedAgentId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, runs]);

  useEffect(() => {
    if (!selectedAgentId && agents.length > 0) {
      setSelectedAgentId(agents[0].agentId);
    }
  }, [agents, selectedAgentId]);

  const loadHistory = async () => {
    if (!sessionKey) return;
    try {
      const result = await rpc<ChatHistoryResult>("chat.history", { sessionKey, limit: 200 });
      setHistory(result.messages.map((m) => ({ ...m, content: extractText(m.content) })));
    } catch (err) {
      console.error("Failed to load history:", err);
    }
  };

  const sendMessage = async () => {
    if (!message.trim() || !sessionKey || sending) return;
    setSending(true);
    const idempotencyKey = uuid();

    try {
      const result = await rpc<{ runId: string; status: string }>("chat.send", {
        sessionKey,
        message: message.trim(),
        idempotencyKey,
      });

      startRun({
        runId: result.runId,
        agentId: selectedAgentId,
        sessionKey,
        userMessageId: idempotencyKey,
      });

      setHistory((prev) => [
        ...prev,
        { id: idempotencyKey, role: "user", content: message.trim(), timestamp: Date.now() },
      ]);
      setMessage("");
    } catch (err) {
      alert(`Send failed: ${String(err)}`);
    } finally {
      setSending(false);
    }
  };

  const abortChat = async () => {
    if (!sessionKey) return;
    try {
      await rpc("chat.abort", { sessionKey });
    } catch (err) {
      console.error("Abort failed:", err);
    }
  };

  const activeRuns = Array.from(runs.values()).filter(
    (r) => r.sessionKey === sessionKey && (r.status === "queued" || r.status === "streaming")
  );
  const completedRuns = Array.from(runs.values()).filter(
    (r) => r.sessionKey === sessionKey && r.status === "done"
  );

  if (connectionState !== "connected") {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-dim">CONNECT TO GATEWAY FIRST</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center gap-2 md:gap-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-fg">CHAT TEST</h2>
        <div className="hidden md:block w-px h-4 bg-border-default" />
        <select
          value={selectedAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
          className="border border-border-interactive bg-surface px-3 py-1.5 font-mono text-xs text-fg focus:outline-none focus:border-border-focus"
        >
          <option value="">SELECT AGENT...</option>
          {agents.map((a) => (
            <option key={a.agentId} value={a.agentId}>
              {a.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={sessionKey}
          onChange={(e) => setSessionKey(e.target.value)}
          placeholder="SESSION KEY"
          className="hidden sm:block flex-1 border border-border-interactive bg-surface px-3 py-1.5 font-mono text-[10px] text-fg-subtle focus:outline-none focus:border-border-focus"
        />
        <button
          onClick={loadHistory}
          className="border border-border-interactive px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg transition-all"
        >
          HISTORY
        </button>
      </div>

      {/* Tab bar */}
      <div className="mb-2 flex items-center border-b border-border-default">
        <button
          onClick={() => setTab("chat")}
          className={`px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            tab === "chat"
              ? "text-fg border-b-2 border-border-solid"
              : "text-fg-ghost hover:text-fg-dim"
          }`}
        >
          [CHAT]
        </button>
        {traceEnabled && traceData && traceData.entries.length > 0 && (
          <button
            onClick={() => setTab("trace")}
            className={`px-4 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
              tab === "trace"
                ? "text-fg border-b-2 border-border-solid"
                : "text-fg-ghost hover:text-fg-dim"
            }`}
          >
            [TRACE: {agents.find((a) => a.agentId === selectedAgentId)?.name ?? "?"}]
          </button>
        )}
        <div className="flex-1" />
        <button
          onClick={() => setTraceEnabled(!traceEnabled)}
          className="px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-ghost hover:text-fg-dim transition-colors"
        >
          {traceEnabled ? "[TRACE ON]" : "[TRACE OFF]"}
        </button>
      </div>

      {/* Content area */}
      {tab === "trace" && traceEnabled ? (
        <div className="flex-1 overflow-y-auto border border-border-default bg-surface p-4">
          <TraceTimeline agentId={selectedAgentId} />
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto border border-border-default bg-surface p-4">
        {history.map((msg) => (
          <div key={msg.id} className="mb-3">
            {msg.role === "user" ? (
              <div className="flex justify-start">
                <div className="flex items-start gap-2 max-w-[90%] sm:max-w-[75%]">
                  <UserAvatar size={20} className="mt-1 shrink-0 text-fg-dim" />
                  <div className="border border-border-interactive bg-active px-3 py-2">
                    <p className="font-mono text-sm text-fg whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-start">
                <div className="flex items-start gap-2 max-w-[90%] sm:max-w-[75%]">
                  <AgentAvatar seed={selectedAgentId} size={20} className="mt-1 shrink-0" />
                  <div className="border border-border-default px-3 py-2">
                    <p className="font-mono text-sm text-fg-faint whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Active streaming */}
        {activeRuns.map((run) => (
          <div key={run.runId} className="mb-3 flex justify-start">
            <div className="flex items-start gap-2 max-w-[90%] sm:max-w-[75%]">
              <AgentAvatar seed={selectedAgentId} size={20} className="mt-1 shrink-0" />
              <div className="border border-border-default px-3 py-2">
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
        ))}

        {/* Completed runs */}
        {completedRuns.map((run) => (
          <div key={run.runId} className="mb-3 flex justify-start">
            <div className="flex items-start gap-2 max-w-[90%] sm:max-w-[75%]">
              <AgentAvatar seed={selectedAgentId} size={20} className="mt-1 shrink-0" />
              <div className="border border-border-default px-3 py-2">
                <p className="font-mono text-sm text-fg-faint whitespace-pre-wrap">
                  {run.finalMessage?.content || run.streamedText}
                </p>
              </div>
            </div>
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>
      )}

      {/* Input */}
      <div className="mt-3 flex gap-2">
        <div data-focus-container className="flex-1 flex items-center border border-border-interactive bg-surface focus-within:border-border-focus transition-colors">
          <span className="pl-3 font-mono text-[10px] text-fg-ghost">&gt;</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="TYPE MESSAGE..."
            rows={2}
            className="flex-1 bg-transparent px-2 py-2 font-mono text-sm text-fg focus:outline-none resize-none"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            disabled={!selectedAgentId || !sessionKey}
          />
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={sendMessage}
            disabled={sending || !message.trim() || !selectedAgentId}
            className="bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg disabled:opacity-30"
          >
            [SEND]
          </button>
          {activeRuns.length > 0 && (
            <button
              onClick={abortChat}
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
