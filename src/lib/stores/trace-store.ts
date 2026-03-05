"use client";

import { create } from "zustand";
import { bus } from "../event-bus";
import { resolveAgentId, toTraceEntry, type TraceEntry } from "../../components/chat/trace-utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AgentTrace = {
  agentId: string;
  currentRunId: string;
  entries: TraceEntry[];
  seenIds: Set<string>;
};

type TraceStore = {
  traces: Map<string, AgentTrace>; // agentId → current trace
  enabled: boolean;

  setEnabled: (v: boolean) => void;
  pushEntry: (agentId: string, runId: string, entry: TraceEntry) => void;
  clearAll: () => void;
  getTrace: (agentId: string) => AgentTrace | undefined;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_ENTRIES_PER_AGENT = 500;
const STORAGE_KEY = "claw-console:trace-enabled";

function loadEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useTraceStore = create<TraceStore>((set, get) => ({
  traces: new Map(),
  enabled: loadEnabled(),

  setEnabled(v) {
    set({ enabled: v });
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(v));
    }
  },

  pushEntry(agentId, runId, entry) {
    if (!get().enabled) return;

    set((state) => {
      const traces = new Map(state.traces);
      let trace = traces.get(agentId);

      // Run rotation: only lifecycle.start can rotate to a new run
      const isLifecycleStart =
        entry.stream === "lifecycle" && entry.phase === "start";

      if (!trace) {
        // First event for this agent
        trace = {
          agentId,
          currentRunId: runId,
          entries: [],
          seenIds: new Set(),
        };
      } else if (runId !== trace.currentRunId) {
        if (isLifecycleStart) {
          // New run — wipe old trace
          trace = {
            agentId,
            currentRunId: runId,
            entries: [],
            seenIds: new Set(),
          };
        } else {
          // Stale/out-of-order event for old run — ignore silently
          return state;
        }
      }

      // Dedup guard
      if (trace.seenIds.has(entry.id)) return state;

      // Clone for immutability
      const entries = [...trace.entries];
      const seenIds = new Set(trace.seenIds);
      seenIds.add(entry.id);

      // Collapse consecutive same-stream events to prevent flooding:
      // - assistant deltas (per-token streaming)
      // - tool.update events (partial results from long-running tools like exec)
      const lastEntry = entries[entries.length - 1];
      const shouldCollapse =
        lastEntry?.runId === runId &&
        lastEntry.stream === entry.stream &&
        (
          entry.stream === "assistant" ||
          (entry.stream === "tool" && entry.phase === "update" && lastEntry.phase === "update")
        );

      if (shouldCollapse) {
        entries[entries.length - 1] = {
          ...lastEntry,
          ts: entry.ts,
          seq: entry.seq,
          id: entry.id,
          detail: entry.detail,
        };
      } else {
        entries.push(entry);
      }

      // Cap entries
      if (entries.length > MAX_ENTRIES_PER_AGENT) {
        entries.splice(0, entries.length - MAX_ENTRIES_PER_AGENT);
      }

      traces.set(agentId, { agentId, currentRunId: runId, entries, seenIds });
      return { traces };
    });
  },

  clearAll() {
    set({ traces: new Map() });
  },

  getTrace(agentId) {
    return get().traces.get(agentId);
  },
}));

// ---------------------------------------------------------------------------
// Bus subscription — route trace events into the store
// ---------------------------------------------------------------------------

bus.on("trace:event", ({ payload }) => {
  const store = useTraceStore.getState();
  if (!store.enabled) return;

  // Only capture events from claw-console sessions.
  // Ignore heartbeat, cron, and other-client runs.
  if (!payload.sessionKey || !payload.sessionKey.includes("claw-console")) return;

  const agentId = resolveAgentId(payload);
  const entry = toTraceEntry(payload, agentId);
  store.pushEntry(agentId, payload.runId, entry);
});
