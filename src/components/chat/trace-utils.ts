/** Pure utility functions for agent execution traces — extracted for testability. */

export type TraceEntry = {
  id: string;        // "${runId}:${seq}"
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  summary: string;   // "TOOL CALL: web_search", "THINKING...", "RUN STARTED"
  detail?: unknown;  // Full data for expand view
  agentId: string;   // Resolved, always present
  phase?: string;
};

type TracePayload = {
  runId: string;
  seq: number;
  stream: string;
  ts: number;
  data: Record<string, unknown>;
  sessionKey?: string;
};

/**
 * Agent identity resolution — single source of truth.
 *
 * Priority:
 *   1. payload.data.agentId (explicit)
 *   2. payload.data.agent.id (nested object)
 *   3. Parse from sessionKey (format: agent:{agentId}:...)
 *   4. __unknown__:{sessionKey|runId} (never merge with known agents)
 */
export function resolveAgentId(payload: TracePayload): string {
  if (typeof payload.data.agentId === "string") return payload.data.agentId;

  const agent = payload.data.agent as Record<string, unknown> | undefined;
  if (agent && typeof agent.id === "string") return agent.id;

  if (payload.sessionKey) {
    const match = payload.sessionKey.match(/^agent:([^:]+):/);
    if (match) return match[1];
  }

  return `__unknown__:${payload.sessionKey ?? payload.runId}`;
}

/** Convert a raw agent event payload to a displayable TraceEntry. */
export function toTraceEntry(payload: TracePayload, agentId: string): TraceEntry {
  const id = `${payload.runId}:${payload.seq}`;
  const phase = typeof payload.data?.phase === "string" ? payload.data.phase : undefined;

  return {
    id,
    runId: payload.runId,
    seq: payload.seq,
    stream: payload.stream,
    ts: payload.ts,
    summary: summarize(payload.stream, payload.data),
    detail: payload.data,
    agentId,
    phase,
  };
}

function summarize(stream: string, data: Record<string, unknown>): string {
  switch (stream) {
    case "lifecycle": {
      const phase = data.phase as string | undefined;
      if (phase === "start") return "RUN STARTED";
      if (phase === "end") return data.aborted ? "RUN ABORTED" : "RUN COMPLETED";
      if (phase === "error") return `RUN ERROR: ${trunc(String(data.error ?? "unknown"), 60)}`;
      return `LIFECYCLE: ${phase ?? "?"}`;
    }
    case "tool": {
      const phase = data.phase as string | undefined;
      const name = (data.name as string) ?? "?";
      if (phase === "start") return `TOOL CALL: ${name}`;
      if (phase === "update") return `TOOL UPDATE: ${name}`;
      if (phase === "result" || phase === "end") {
        return (data.isError as boolean) ? `TOOL ERROR: ${name}` : `TOOL RESULT: ${name}`;
      }
      return `TOOL: ${phase ?? "?"} ${name}`;
    }
    case "assistant":
      return "GENERATING RESPONSE...";
    case "thinking":
      return "THINKING...";
    case "compaction": {
      const phase = data.phase as string | undefined;
      return phase === "start" ? "COMPACTING CONTEXT..." : "COMPACTION DONE";
    }
    case "error":
      return `SEQUENCE ERROR: ${data.reason ?? "gap"}`;
    default:
      return stream.toUpperCase();
  }
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

/** Format elapsed ms between two timestamps for display. */
export function formatElapsed(fromTs: number, toTs: number): string {
  const ms = toTs - fromTs;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
