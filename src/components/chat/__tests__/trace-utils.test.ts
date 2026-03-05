import { describe, it, expect } from "vitest";
import { resolveAgentId, toTraceEntry, formatElapsed } from "../trace-utils";

// ---------------------------------------------------------------------------
// resolveAgentId
// ---------------------------------------------------------------------------

describe("resolveAgentId", () => {
  it("prefers explicit data.agentId", () => {
    expect(
      resolveAgentId({
        runId: "r1",
        seq: 1,
        stream: "lifecycle",
        ts: 1000,
        data: { agentId: "bot-alpha" },
        sessionKey: "agent:bot-beta:claw-console:group:g1",
      }),
    ).toBe("bot-alpha");
  });

  it("falls back to data.agent.id", () => {
    expect(
      resolveAgentId({
        runId: "r1",
        seq: 1,
        stream: "tool",
        ts: 1000,
        data: { agent: { id: "bot-gamma" } },
        sessionKey: "agent:bot-beta:claw-console:group:g1",
      }),
    ).toBe("bot-gamma");
  });

  it("parses agentId from sessionKey", () => {
    expect(
      resolveAgentId({
        runId: "r1",
        seq: 1,
        stream: "lifecycle",
        ts: 1000,
        data: {},
        sessionKey: "agent:bot-delta:claw-console:group:g1",
      }),
    ).toBe("bot-delta");
  });

  it("returns __unknown__ with sessionKey when unresolvable", () => {
    expect(
      resolveAgentId({
        runId: "r1",
        seq: 1,
        stream: "lifecycle",
        ts: 1000,
        data: {},
        sessionKey: "weird-key",
      }),
    ).toBe("__unknown__:weird-key");
  });

  it("returns __unknown__ with runId when no sessionKey", () => {
    expect(
      resolveAgentId({
        runId: "r1",
        seq: 1,
        stream: "lifecycle",
        ts: 1000,
        data: {},
      }),
    ).toBe("__unknown__:r1");
  });
});

// ---------------------------------------------------------------------------
// toTraceEntry
// ---------------------------------------------------------------------------

describe("toTraceEntry", () => {
  it("summarizes lifecycle start", () => {
    const entry = toTraceEntry(
      { runId: "r1", seq: 1, stream: "lifecycle", ts: 1000, data: { phase: "start" } },
      "agent-1",
    );
    expect(entry.summary).toBe("RUN STARTED");
    expect(entry.id).toBe("r1:1");
    expect(entry.agentId).toBe("agent-1");
    expect(entry.phase).toBe("start");
  });

  it("summarizes lifecycle end", () => {
    const entry = toTraceEntry(
      { runId: "r1", seq: 2, stream: "lifecycle", ts: 2000, data: { phase: "end" } },
      "agent-1",
    );
    expect(entry.summary).toBe("RUN COMPLETED");
  });

  it("summarizes lifecycle error", () => {
    const entry = toTraceEntry(
      { runId: "r1", seq: 2, stream: "lifecycle", ts: 2000, data: { phase: "error", error: "timeout" } },
      "agent-1",
    );
    expect(entry.summary).toBe("RUN ERROR: timeout");
  });

  it("summarizes tool start with name", () => {
    const entry = toTraceEntry(
      { runId: "r1", seq: 3, stream: "tool", ts: 3000, data: { phase: "start", name: "web_search", toolCallId: "tc-1", args: { q: "test" } } },
      "agent-1",
    );
    expect(entry.summary).toBe("TOOL CALL: web_search");
  });

  it("summarizes tool result", () => {
    const entry = toTraceEntry(
      { runId: "r1", seq: 4, stream: "tool", ts: 4000, data: { phase: "result", name: "read", toolCallId: "tc-1", isError: false } },
      "agent-1",
    );
    expect(entry.summary).toBe("TOOL RESULT: read");
  });

  it("summarizes tool error", () => {
    const entry = toTraceEntry(
      { runId: "r1", seq: 4, stream: "tool", ts: 4000, data: { phase: "result", name: "exec", toolCallId: "tc-1", isError: true } },
      "agent-1",
    );
    expect(entry.summary).toBe("TOOL ERROR: exec");
  });

  it("summarizes assistant stream", () => {
    const entry = toTraceEntry(
      { runId: "r1", seq: 5, stream: "assistant", ts: 5000, data: { text: "Hello" } },
      "agent-1",
    );
    expect(entry.summary).toBe("GENERATING RESPONSE...");
  });

  it("summarizes thinking stream", () => {
    const entry = toTraceEntry(
      { runId: "r1", seq: 6, stream: "thinking", ts: 6000, data: { text: "hmm" } },
      "agent-1",
    );
    expect(entry.summary).toBe("THINKING...");
  });

  it("summarizes compaction start", () => {
    const entry = toTraceEntry(
      { runId: "r1", seq: 7, stream: "compaction", ts: 7000, data: { phase: "start" } },
      "agent-1",
    );
    expect(entry.summary).toBe("COMPACTING CONTEXT...");
  });

  it("summarizes unknown stream", () => {
    const entry = toTraceEntry(
      { runId: "r1", seq: 8, stream: "custom", ts: 8000, data: {} },
      "agent-1",
    );
    expect(entry.summary).toBe("CUSTOM");
  });
});

// ---------------------------------------------------------------------------
// formatElapsed
// ---------------------------------------------------------------------------

describe("formatElapsed", () => {
  it("formats milliseconds", () => {
    expect(formatElapsed(0, 500)).toBe("500ms");
  });

  it("formats seconds", () => {
    expect(formatElapsed(0, 2500)).toBe("2.5s");
  });

  it("formats minutes", () => {
    expect(formatElapsed(0, 90000)).toBe("1.5m");
  });

  it("formats zero", () => {
    expect(formatElapsed(1000, 1000)).toBe("0ms");
  });
});
