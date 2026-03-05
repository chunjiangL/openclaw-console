import { describe, it, expect, beforeEach } from "vitest";
import { useTraceStore } from "../trace-store";
import type { TraceEntry } from "../../../components/chat/trace-utils";

function makeEntry(overrides: Partial<TraceEntry> & { runId: string; seq: number }): TraceEntry {
  return {
    id: `${overrides.runId}:${overrides.seq}`,
    runId: overrides.runId,
    seq: overrides.seq,
    stream: overrides.stream ?? "lifecycle",
    ts: overrides.ts ?? overrides.seq * 1000,
    summary: overrides.summary ?? "TEST",
    agentId: overrides.agentId ?? "agent-1",
    phase: overrides.phase,
    detail: overrides.detail,
  };
}

beforeEach(() => {
  useTraceStore.getState().clearAll();
  useTraceStore.getState().setEnabled(true);
});

describe("useTraceStore", () => {
  // -----------------------------------------------------------------------
  // Basic push + dedup
  // -----------------------------------------------------------------------

  it("pushEntry adds entries keyed by agentId", () => {
    const entry = makeEntry({ runId: "r1", seq: 1 });
    useTraceStore.getState().pushEntry("agent-1", "r1", entry);
    const trace = useTraceStore.getState().getTrace("agent-1");
    expect(trace?.entries).toHaveLength(1);
    expect(trace?.currentRunId).toBe("r1");
  });

  it("deduplicates by entry id", () => {
    const entry = makeEntry({ runId: "r1", seq: 1 });
    useTraceStore.getState().pushEntry("agent-1", "r1", entry);
    useTraceStore.getState().pushEntry("agent-1", "r1", entry);
    expect(useTraceStore.getState().getTrace("agent-1")?.entries).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // Enabled toggle
  // -----------------------------------------------------------------------

  it("ignores entries when disabled", () => {
    useTraceStore.getState().setEnabled(false);
    const entry = makeEntry({ runId: "r1", seq: 1 });
    useTraceStore.getState().pushEntry("agent-1", "r1", entry);
    expect(useTraceStore.getState().getTrace("agent-1")).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Run rotation — only lifecycle.start rotates
  // -----------------------------------------------------------------------

  it("lifecycle.start rotates to new run, clearing old entries", () => {
    // Old run
    useTraceStore.getState().pushEntry(
      "agent-1",
      "r1",
      makeEntry({ runId: "r1", seq: 1, stream: "lifecycle", phase: "start" }),
    );
    useTraceStore.getState().pushEntry(
      "agent-1",
      "r1",
      makeEntry({ runId: "r1", seq: 2, stream: "tool", phase: "start", summary: "TOOL CALL: exec" }),
    );
    expect(useTraceStore.getState().getTrace("agent-1")?.entries).toHaveLength(2);

    // New run — lifecycle.start
    useTraceStore.getState().pushEntry(
      "agent-1",
      "r2",
      makeEntry({ runId: "r2", seq: 1, stream: "lifecycle", phase: "start" }),
    );
    const trace = useTraceStore.getState().getTrace("agent-1");
    expect(trace?.currentRunId).toBe("r2");
    expect(trace?.entries).toHaveLength(1);
    expect(trace?.entries[0].runId).toBe("r2");
  });

  it("ignores stale events from old run (non-start)", () => {
    // Current run
    useTraceStore.getState().pushEntry(
      "agent-1",
      "r2",
      makeEntry({ runId: "r2", seq: 1, stream: "lifecycle", phase: "start" }),
    );

    // Late event from old run — should be ignored
    useTraceStore.getState().pushEntry(
      "agent-1",
      "r1",
      makeEntry({ runId: "r1", seq: 99, stream: "tool", summary: "STALE" }),
    );

    const trace = useTraceStore.getState().getTrace("agent-1");
    expect(trace?.entries).toHaveLength(1);
    expect(trace?.currentRunId).toBe("r2");
  });

  // -----------------------------------------------------------------------
  // Assistant delta collapse
  // -----------------------------------------------------------------------

  it("collapses consecutive assistant deltas into one entry", () => {
    useTraceStore.getState().pushEntry(
      "agent-1",
      "r1",
      makeEntry({ runId: "r1", seq: 1, stream: "lifecycle", phase: "start" }),
    );
    useTraceStore.getState().pushEntry(
      "agent-1",
      "r1",
      makeEntry({ runId: "r1", seq: 2, stream: "assistant", ts: 2000, detail: { text: "Hello" } }),
    );
    useTraceStore.getState().pushEntry(
      "agent-1",
      "r1",
      makeEntry({ runId: "r1", seq: 3, stream: "assistant", ts: 3000, detail: { text: " world" } }),
    );
    useTraceStore.getState().pushEntry(
      "agent-1",
      "r1",
      makeEntry({ runId: "r1", seq: 4, stream: "assistant", ts: 4000, detail: { text: "!" } }),
    );

    const trace = useTraceStore.getState().getTrace("agent-1");
    // 1 lifecycle + 1 collapsed assistant = 2
    expect(trace?.entries).toHaveLength(2);
    // Last assistant entry has latest ts
    expect(trace?.entries[1].ts).toBe(4000);
    expect(trace?.entries[1].stream).toBe("assistant");
  });

  it("does not collapse assistant after non-assistant", () => {
    useTraceStore.getState().pushEntry(
      "agent-1",
      "r1",
      makeEntry({ runId: "r1", seq: 1, stream: "assistant", ts: 1000 }),
    );
    useTraceStore.getState().pushEntry(
      "agent-1",
      "r1",
      makeEntry({ runId: "r1", seq: 2, stream: "tool", ts: 2000 }),
    );
    useTraceStore.getState().pushEntry(
      "agent-1",
      "r1",
      makeEntry({ runId: "r1", seq: 3, stream: "assistant", ts: 3000 }),
    );

    const trace = useTraceStore.getState().getTrace("agent-1");
    expect(trace?.entries).toHaveLength(3);
  });

  // -----------------------------------------------------------------------
  // Concurrent agents — independent traces
  // -----------------------------------------------------------------------

  it("maintains independent traces per agent", () => {
    useTraceStore.getState().pushEntry(
      "agent-a",
      "ra1",
      makeEntry({ runId: "ra1", seq: 1, agentId: "agent-a", stream: "lifecycle", phase: "start" }),
    );
    useTraceStore.getState().pushEntry(
      "agent-b",
      "rb1",
      makeEntry({ runId: "rb1", seq: 1, agentId: "agent-b", stream: "lifecycle", phase: "start" }),
    );

    const traceA = useTraceStore.getState().getTrace("agent-a");
    const traceB = useTraceStore.getState().getTrace("agent-b");
    expect(traceA?.currentRunId).toBe("ra1");
    expect(traceB?.currentRunId).toBe("rb1");
    expect(traceA?.entries).toHaveLength(1);
    expect(traceB?.entries).toHaveLength(1);
  });

  // -----------------------------------------------------------------------
  // clearAll
  // -----------------------------------------------------------------------

  it("clearAll wipes all traces", () => {
    useTraceStore.getState().pushEntry(
      "agent-1",
      "r1",
      makeEntry({ runId: "r1", seq: 1 }),
    );
    useTraceStore.getState().clearAll();
    expect(useTraceStore.getState().getTrace("agent-1")).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // seenIds reset on rotation
  // -----------------------------------------------------------------------

  it("seenIds reset allows same seq in new run", () => {
    useTraceStore.getState().pushEntry(
      "agent-1",
      "r1",
      makeEntry({ runId: "r1", seq: 1, stream: "lifecycle", phase: "start" }),
    );

    // New run with same seq number
    useTraceStore.getState().pushEntry(
      "agent-1",
      "r2",
      makeEntry({ runId: "r2", seq: 1, stream: "lifecycle", phase: "start" }),
    );

    const trace = useTraceStore.getState().getTrace("agent-1");
    expect(trace?.currentRunId).toBe("r2");
    expect(trace?.entries).toHaveLength(1);
    expect(trace?.entries[0].id).toBe("r2:1");
  });
});
