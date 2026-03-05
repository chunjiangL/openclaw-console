"use client";

import {
  useOrchestratorStore,
  type OrchestratorPhase,
  type ChatMessage,
} from "@/lib/stores/orchestrator-store";
import { useGatewayStore } from "@/lib/stores/gateway-store";
import { TaskPanel } from "./task-panel";
import { WorkerCards } from "./worker-cards";
import { PrStatus } from "./pr-status";
import { ProgressBar } from "./progress-bar";
import { useState, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Phase badge
// ---------------------------------------------------------------------------

function PhaseBadge({ phase }: { phase: OrchestratorPhase }) {
  const style: Record<OrchestratorPhase, string> = {
    idle: "border-border-muted text-fg-ghost",
    planning: "border-border-interactive text-fg-subtle",
    awaiting_approval: "border-border-interactive text-fg",
    executing: "border-border-solid text-fg",
    reviewing: "border-border-interactive text-fg-subtle",
    complete: "border-border-solid text-fg",
    error: "border-border-interactive text-fg-subtle",
  };
  const label: Record<OrchestratorPhase, string> = {
    idle: "IDLE",
    planning: "PLANNING",
    awaiting_approval: "APPROVAL",
    executing: "EXECUTING",
    reviewing: "REVIEWING",
    complete: "COMPLETE",
    error: "ERROR",
  };
  return (
    <span
      className={`border px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider ${style[phase]}`}
    >
      {label[phase]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Custom terminal-style dropdown
// ---------------------------------------------------------------------------

function TerminalSelect({
  value,
  options,
  onChange,
  placeholder = "-- SELECT --",
}: {
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const selected = options.find((o) => o.id === value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between border border-border-interactive bg-surface px-2 py-1.5 font-mono text-xs text-fg hover:border-border-hover focus:outline-none focus:border-border-focus transition-colors"
      >
        <span className={selected ? "text-fg" : "text-fg-ghost"}>
          {selected ? selected.label : placeholder}
        </span>
        <span className="text-fg-ghost text-[10px] ml-2">
          {open ? "\u25B4" : "\u25BE"}
        </span>
      </button>
      {open && (
        <div className="absolute z-50 mt-px w-full border border-border-interactive bg-surface">
          {options.map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                onChange(opt.id);
                setOpen(false);
              }}
              className={`flex w-full items-center px-2 py-1.5 font-mono text-xs transition-all hover:bg-hover ${
                opt.id === value ? "text-fg bg-active" : "text-fg-muted"
              }`}
            >
              <span className="mr-2 text-[10px]">
                {opt.id === value ? "\u25CF" : "\u25CB"}
              </span>
              {opt.label}
            </button>
          ))}
          {options.length === 0 && (
            <div className="px-2 py-1.5 font-mono text-[10px] text-fg-ghost uppercase tracking-wider">
              NO AGENTS AVAILABLE
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat message display
// ---------------------------------------------------------------------------

function ChatBubble({ msg }: { msg: ChatMessage }) {
  return (
    <div
      className={`mb-2 ${msg.role === "user" ? "text-right" : "text-left"}`}
    >
      <div className="font-mono text-[9px] uppercase tracking-wider text-fg-ghost mb-0.5">
        {msg.role === "user" ? "YOU" : "LEAD AGENT"}
      </div>
      <div
        className={`inline-block max-w-[85%] px-3 py-2 font-mono text-xs text-left whitespace-pre-wrap ${
          msg.role === "user"
            ? "border border-border-interactive text-fg-dim"
            : "border border-border-default text-fg"
        }`}
      >
        {msg.content}
      </div>
    </div>
  );
}

function StreamingIndicator({ text }: { text: string }) {
  if (!text) {
    return (
      <div className="mb-2">
        <div className="font-mono text-[9px] uppercase tracking-wider text-fg-ghost mb-0.5">
          LEAD AGENT
        </div>
        <div className="inline-block px-3 py-2 border border-border-muted font-mono text-xs text-fg-ghost">
          {"\u2588"} THINKING...
        </div>
      </div>
    );
  }
  return (
    <div className="mb-2">
      <div className="font-mono text-[9px] uppercase tracking-wider text-fg-ghost mb-0.5">
        LEAD AGENT
      </div>
      <div className="inline-block max-w-[85%] px-3 py-2 border border-border-muted font-mono text-xs text-fg whitespace-pre-wrap">
        {text}
        <span className="animate-pulse">{"\u2588"}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chat input
// ---------------------------------------------------------------------------

function ChatInput() {
  const [text, setText] = useState("");
  const sendMessage = useOrchestratorStore((s) => s.sendMessage);
  const isStreaming = useOrchestratorStore((s) => s.isStreaming);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || isStreaming) return;
    sendMessage(text.trim());
    setText("");
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={isStreaming ? "WAITING FOR RESPONSE..." : "TYPE A MESSAGE..."}
        disabled={isStreaming}
        className="flex-1 border border-border-interactive bg-surface px-3 py-2 font-mono text-xs text-fg focus:outline-none focus:border-border-focus disabled:opacity-40"
      />
      <button
        type="submit"
        disabled={isStreaming || !text.trim()}
        className="bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg hover:bg-accent-hover transition-all disabled:opacity-30"
      >
        [SEND]
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function OrchestratorPage() {
  const phase = useOrchestratorStore((s) => s.phase);
  const session = useOrchestratorStore((s) => s.session);
  const chatMessages = useOrchestratorStore((s) => s.chatMessages);
  const latestLeadDraftText = useOrchestratorStore(
    (s) => s.latestLeadDraftText,
  );
  const isStreaming = useOrchestratorStore((s) => s.isStreaming);
  const parsedTasks = useOrchestratorStore((s) => s.parsedTasks);
  const approvedTasks = useOrchestratorStore((s) => s.approvedTasks);
  const parseError = useOrchestratorStore((s) => s.parseError);
  const updateSessionField = useOrchestratorStore(
    (s) => s.updateSessionField,
  );
  const setLeadAgent = useOrchestratorStore((s) => s.setLeadAgent);
  const setWorkerAgents = useOrchestratorStore((s) => s.setWorkerAgents);
  const startSession = useOrchestratorStore((s) => s.startSession);
  const approveBreakdown = useOrchestratorStore((s) => s.approveBreakdown);
  const resetSession = useOrchestratorStore((s) => s.resetSession);
  const gatewayAgents = useGatewayStore((s) => s.agents);

  const [goalText, setGoalText] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length, latestLeadDraftText]);

  // Build agent list from gateway
  const allAgents: { id: string; label: string }[] = gatewayAgents.map(
    (a) => ({ id: a.agentId, label: a.name }),
  );

  const tasks = approvedTasks.length > 0 ? approvedTasks : parsedTasks;
  const doneCount = tasks.filter((t) => t.status === "done").length;
  const overallPercent = tasks.length
    ? Math.round((doneCount / tasks.length) * 100)
    : 0;

  const toggleWorker = (agentId: string) => {
    const current = session.workerAgentIds;
    if (current.includes(agentId)) {
      setWorkerAgents(current.filter((id) => id !== agentId));
    } else {
      setWorkerAgents([...current, agentId]);
    }
  };

  const handleStart = () => {
    if (!goalText.trim()) return;
    startSession(goalText.trim());
    setGoalText("");
  };

  const isConfigPhase = phase === "idle";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="mb-4">
        <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-lg font-bold uppercase tracking-wide text-fg">
              TEAM MODE
            </h2>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-dim">
              {"\u2593"} MULTI-AGENT COORDINATION
            </p>
          </div>
          <div className="flex items-center gap-3">
            <PhaseBadge phase={phase} />
            {tasks.length > 0 && <ProgressBar percent={overallPercent} />}
            {phase !== "idle" && (
              <button
                onClick={resetSession}
                className="border border-border-muted px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-fg-ghost hover:text-fg hover:border-border-hover transition-all"
              >
                [RESET]
              </button>
            )}
          </div>
        </div>
        <div className="h-px bg-divider-bright" />
      </div>

      {/* Config fields — only editable in idle phase */}
      {isConfigPhase && (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.15em] text-fg-dim">
                LEAD AGENT
              </label>
              <TerminalSelect
                value={session.leadAgentId}
                options={allAgents}
                onChange={setLeadAgent}
                placeholder="-- SELECT LEAD --"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.15em] text-fg-dim">
                REPOSITORY
              </label>
              <input
                value={session.repo}
                onChange={(e) => updateSessionField("repo", e.target.value)}
                placeholder="OWNER/REPO"
                className="w-full border border-border-interactive bg-surface px-2 py-1.5 font-mono text-xs text-fg focus:outline-none focus:border-border-focus"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.15em] text-fg-dim">
                BASE BRANCH
              </label>
              <input
                value={session.baseBranch}
                onChange={(e) =>
                  updateSessionField("baseBranch", e.target.value)
                }
                placeholder="main"
                className="w-full border border-border-interactive bg-surface px-2 py-1.5 font-mono text-xs text-fg focus:outline-none focus:border-border-focus"
              />
            </div>
          </div>

          {/* Worker agent toggles */}
          <div className="mb-4">
            <label className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.15em] text-fg-dim">
              WORKER AGENTS
            </label>
            <div className="flex flex-wrap gap-1.5">
              {allAgents
                .filter((a) => a.id !== session.leadAgentId)
                .map((a) => {
                  const selected = session.workerAgentIds.includes(a.id);
                  return (
                    <button
                      key={a.id}
                      onClick={() => toggleWorker(a.id)}
                      className={`border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-all ${
                        selected
                          ? "border-border-solid text-fg bg-active"
                          : "border-border-muted text-fg-ghost hover:text-fg-dim hover:border-border-hover"
                      }`}
                    >
                      {selected ? "\u25CF" : "\u25CB"} {a.label}
                    </button>
                  );
                })}
              {allAgents.length <= 1 && (
                <span className="font-mono text-[10px] text-fg-ghost uppercase tracking-wider">
                  NO WORKERS AVAILABLE
                </span>
              )}
            </div>
          </div>

          <div className="h-px bg-divider mb-4" />

          {/* Goal input */}
          <div className="mb-4">
            <label className="mb-1 block font-mono text-[9px] uppercase tracking-[0.15em] text-fg-dim">
              GOAL
            </label>
            <div className="flex gap-2">
              <textarea
                value={goalText}
                onChange={(e) => setGoalText(e.target.value)}
                placeholder="DESCRIBE THE TASK FOR YOUR TEAM..."
                rows={3}
                className="flex-1 border border-border-interactive bg-surface px-3 py-2 font-mono text-xs text-fg focus:outline-none focus:border-border-focus resize-none"
              />
              <button
                onClick={handleStart}
                disabled={
                  !goalText.trim() ||
                  !session.leadAgentId
                }
                className="self-end bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg hover:bg-accent-hover transition-all disabled:opacity-30"
              >
                [START]
              </button>
            </div>
          </div>
        </>
      )}

      {/* Chat + task panel — visible when session is active */}
      {!isConfigPhase && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Session info bar */}
          <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
            <span>LEAD: {session.leadAgentId}</span>
            <span className="text-fg-ghost">|</span>
            <span>REPO: {session.repo}</span>
            <span className="text-fg-ghost">|</span>
            <span>BASE: {session.baseBranch}</span>
          </div>

          {/* Chat area */}
          <div className="flex-1 overflow-y-auto border border-border-default p-4 mb-3 min-h-[200px] max-h-[400px]">
            {chatMessages.map((msg, i) => (
              <ChatBubble key={i} msg={msg} />
            ))}
            {isStreaming && (
              <StreamingIndicator text={latestLeadDraftText} />
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Parse error */}
          {parseError && phase === "planning" && (
            <div className="mb-3 border border-border-muted px-3 py-2 font-mono text-[10px] text-fg-ghost uppercase tracking-wider">
              WAITING FOR TASK BREAKDOWN — AGENT DID NOT PRODUCE A JSON PLAN YET. SEND A FOLLOW-UP TO GUIDE IT.
            </div>
          )}

          {/* Approval buttons */}
          {phase === "awaiting_approval" && parsedTasks.length > 0 && (
            <div className="mb-3 flex items-center gap-2">
              <button
                onClick={approveBreakdown}
                className="bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg hover:bg-accent-hover transition-all"
              >
                [APPROVE PLAN]
              </button>
              <span className="font-mono text-[10px] text-fg-ghost uppercase tracking-wider">
                {parsedTasks.length} TASKS PROPOSED
              </span>
            </div>
          )}

          {/* Task panel */}
          {tasks.length > 0 && <TaskPanel />}

          {/* Workers + PRs — during execution */}
          {(phase === "executing" ||
            phase === "reviewing" ||
            phase === "complete") && (
            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <WorkerCards />
              <PrStatus />
            </div>
          )}

          {/* Chat input — available in all active phases */}
          <div className="mt-3">
            <ChatInput />
          </div>
        </div>
      )}

      {/* Complete summary */}
      {phase === "complete" && (
        <div className="mt-4 border border-border-solid p-4 text-center">
          <div className="font-mono text-xs uppercase tracking-wider text-fg mb-2">
            SESSION COMPLETE
          </div>
          <div className="font-mono text-[10px] text-fg-dim">
            {approvedTasks.length} TASKS COMPLETED
          </div>
        </div>
      )}
    </div>
  );
}
