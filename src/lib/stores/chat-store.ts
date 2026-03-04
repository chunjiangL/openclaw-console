"use client";

import { create } from "zustand";
import { extractText } from "../gateway/types";
import type { ChatMessage, GatewayEventFrame } from "../gateway/types";
import { bus } from "../event-bus";

export type AgentRunStatus =
  | "queued"
  | "streaming"
  | "done"
  | "error"
  | "aborted"
  | "timed_out";

export type AgentRun = {
  runId: string;
  agentId: string;
  sessionKey: string;
  userMessageId: string;
  status: AgentRunStatus;
  streamedText: string;
  finalMessage?: ChatMessage;
  errorMessage?: string;
  startedAt: number;
  completedAt?: number;
};

type ChatStore = {
  // Active runs keyed by runId
  runs: Map<string, AgentRun>;

  // Messages per session (keyed by sessionKey)
  messages: Map<string, ChatMessage[]>;

  // Actions
  startRun: (run: Omit<AgentRun, "status" | "streamedText" | "startedAt">) => string;
  handleChatEvent: (evt: GatewayEventFrame) => void;
  setMessages: (sessionKey: string, msgs: ChatMessage[]) => void;
  clearSession: (sessionKey: string) => void;
  getRun: (runId: string) => AgentRun | undefined;
  getActiveRuns: (sessionKey?: string) => AgentRun[];
};

/** Listeners notified when a run reaches a terminal state. */
const runCompletionListeners = new Map<string, Array<(run: AgentRun) => void>>();

export const useChatStore = create<ChatStore>((set, get) => ({
  runs: new Map(),
  messages: new Map(),

  startRun(partial) {
    const run: AgentRun = {
      ...partial,
      status: "queued",
      streamedText: "",
      startedAt: Date.now(),
    };
    set((state) => {
      const runs = new Map(state.runs);
      runs.set(run.runId, run);
      return { runs };
    });
    return run.runId;
  },

  handleChatEvent(evt) {
    if (evt.event !== "chat") return;
    const payload = evt.payload as {
      runId?: string;
      sessionKey?: string;
      seq?: number;
      state?: string;
      message?: ChatMessage;
      errorMessage?: string;
      delta?: { text?: string };
    };
    if (!payload?.runId) return;

    const { runId } = payload;

    let completedRun: AgentRun | null = null;

    set((state) => {
      const runs = new Map(state.runs);
      const run = runs.get(runId);
      if (!run) return state; // not our run

      const updated = { ...run };

      switch (payload.state) {
        case "delta":
          updated.status = "streaming";
          if (payload.delta?.text) {
            updated.streamedText += payload.delta.text;
          } else if (payload.message?.content) {
            updated.streamedText = extractText(payload.message.content);
          }
          break;
        case "final":
          updated.status = "done";
          updated.completedAt = Date.now();
          if (payload.message) {
            updated.finalMessage = {
              ...payload.message,
              content: extractText(payload.message.content),
            };
          }
          break;
        case "error":
          updated.status = "error";
          updated.completedAt = Date.now();
          updated.errorMessage = payload.errorMessage ?? "Unknown error";
          break;
        case "aborted":
          updated.status = "aborted";
          updated.completedAt = Date.now();
          break;
      }

      runs.set(runId, updated);

      // Mark for listener notification AFTER state commits
      if (updated.status === "done" || updated.status === "error" || updated.status === "aborted" || updated.status === "timed_out") {
        completedRun = updated;
      }

      return { runs };
    });

    // Fire completion listeners AFTER set() so getState() returns new state
    if (completedRun) {
      const listeners = runCompletionListeners.get(runId);
      if (listeners) {
        runCompletionListeners.delete(runId);
        for (const cb of listeners) cb(completedRun);
      }
    }
  },

  setMessages(sessionKey, msgs) {
    set((state) => {
      const messages = new Map(state.messages);
      messages.set(sessionKey, msgs);
      return { messages };
    });
  },

  clearSession(sessionKey) {
    set((state) => {
      const messages = new Map(state.messages);
      messages.delete(sessionKey);
      return { messages };
    });
  },

  getRun(runId) {
    return get().runs.get(runId);
  },

  getActiveRuns(sessionKey) {
    const runs = Array.from(get().runs.values());
    const active = runs.filter(
      (r) => r.status === "queued" || r.status === "streaming"
    );
    if (sessionKey) return active.filter((r) => r.sessionKey === sessionKey);
    return active;
  },
}));

/**
 * Register a callback for when a run reaches a terminal state.
 * If the run is already complete, fires immediately.
 * Returns an unsubscribe function.
 */
export function onRunComplete(runId: string, callback: (run: AgentRun) => void): () => void {
  const existing = useChatStore.getState().runs.get(runId);
  if (existing && (existing.status === "done" || existing.status === "error" || existing.status === "aborted" || existing.status === "timed_out")) {
    callback(existing);
    return () => {};
  }
  const listeners = runCompletionListeners.get(runId) ?? [];
  listeners.push(callback);
  runCompletionListeners.set(runId, listeners);
  return () => {
    const current = runCompletionListeners.get(runId);
    if (current) {
      const idx = current.indexOf(callback);
      if (idx >= 0) current.splice(idx, 1);
      if (current.length === 0) runCompletionListeners.delete(runId);
    }
  };
}

// ---------------------------------------------------------------------------
// Bus subscriptions
// ---------------------------------------------------------------------------

// Handle chat events routed through bus (replaces direct cross-store import)
bus.on("chat:event", ({ evt }) => {
  useChatStore.getState().handleChatEvent(evt);
});

// Clean up orphaned runs when an agent is deleted
bus.on("agent:deleted", ({ agentId }) => {
  const { runs } = useChatStore.getState();
  const orphanedIds: string[] = [];
  for (const [runId, run] of runs) {
    if (run.agentId === agentId) orphanedIds.push(runId);
  }
  if (orphanedIds.length === 0) return;
  useChatStore.setState((state) => {
    const newRuns = new Map(state.runs);
    for (const id of orphanedIds) newRuns.delete(id);
    return { runs: newRuns };
  });
});
