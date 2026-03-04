import { describe, it, expect } from "vitest";
import { useChatStore } from "../chat-store";
import type { GatewayEventFrame } from "../../gateway/types";

function makeChatEvent(payload: Record<string, unknown>): GatewayEventFrame {
  return { type: "event", event: "chat", payload };
}

describe("useChatStore", () => {
  describe("startRun", () => {
    it("creates a run with queued status and empty streamedText", () => {
      const runId = useChatStore.getState().startRun({
        runId: "run-1",
        agentId: "agent-a",
        sessionKey: "session-1",
        userMessageId: "msg-1",
      });

      expect(runId).toBe("run-1");
      const run = useChatStore.getState().runs.get("run-1");
      expect(run).toBeDefined();
      expect(run!.status).toBe("queued");
      expect(run!.streamedText).toBe("");
      expect(run!.startedAt).toBeGreaterThan(0);
    });
  });

  describe("handleChatEvent", () => {
    it("ignores non-chat events", () => {
      useChatStore.getState().startRun({
        runId: "run-1",
        agentId: "a",
        sessionKey: "s",
        userMessageId: "m",
      });
      useChatStore.getState().handleChatEvent({
        type: "event",
        event: "presence",
        payload: { runId: "run-1", state: "delta", delta: { text: "nope" } },
      });
      expect(useChatStore.getState().runs.get("run-1")!.streamedText).toBe("");
    });

    it("ignores events for unknown runIds", () => {
      const before = new Map(useChatStore.getState().runs);
      useChatStore.getState().handleChatEvent(
        makeChatEvent({ runId: "unknown", state: "delta", delta: { text: "x" } })
      );
      expect(useChatStore.getState().runs).toEqual(before);
    });

    it("handles delta events — appends text and sets streaming", () => {
      useChatStore.getState().startRun({
        runId: "run-1",
        agentId: "a",
        sessionKey: "s",
        userMessageId: "m",
      });

      useChatStore.getState().handleChatEvent(
        makeChatEvent({ runId: "run-1", state: "delta", delta: { text: "hello " } })
      );
      useChatStore.getState().handleChatEvent(
        makeChatEvent({ runId: "run-1", state: "delta", delta: { text: "world" } })
      );

      const run = useChatStore.getState().runs.get("run-1")!;
      expect(run.status).toBe("streaming");
      expect(run.streamedText).toBe("hello world");
    });

    it("handles delta with message.content object (normalizes via extractText)", () => {
      useChatStore.getState().startRun({
        runId: "run-1",
        agentId: "a",
        sessionKey: "s",
        userMessageId: "m",
      });

      useChatStore.getState().handleChatEvent(
        makeChatEvent({
          runId: "run-1",
          state: "delta",
          message: { content: [{ type: "text", text: "normalized" }] },
        })
      );

      expect(useChatStore.getState().runs.get("run-1")!.streamedText).toBe("normalized");
    });

    it("handles final events — sets done and normalizes content", () => {
      useChatStore.getState().startRun({
        runId: "run-1",
        agentId: "a",
        sessionKey: "s",
        userMessageId: "m",
      });

      useChatStore.getState().handleChatEvent(
        makeChatEvent({
          runId: "run-1",
          state: "final",
          message: {
            id: "msg-final",
            role: "assistant",
            content: [{ type: "text", text: "final answer" }],
          },
        })
      );

      const run = useChatStore.getState().runs.get("run-1")!;
      expect(run.status).toBe("done");
      expect(run.completedAt).toBeGreaterThan(0);
      expect(run.finalMessage?.content).toBe("final answer");
    });

    it("handles error events", () => {
      useChatStore.getState().startRun({
        runId: "run-1",
        agentId: "a",
        sessionKey: "s",
        userMessageId: "m",
      });

      useChatStore.getState().handleChatEvent(
        makeChatEvent({ runId: "run-1", state: "error", errorMessage: "timeout" })
      );

      const run = useChatStore.getState().runs.get("run-1")!;
      expect(run.status).toBe("error");
      expect(run.errorMessage).toBe("timeout");
      expect(run.completedAt).toBeGreaterThan(0);
    });

    it("handles aborted events", () => {
      useChatStore.getState().startRun({
        runId: "run-1",
        agentId: "a",
        sessionKey: "s",
        userMessageId: "m",
      });

      useChatStore.getState().handleChatEvent(
        makeChatEvent({ runId: "run-1", state: "aborted" })
      );

      const run = useChatStore.getState().runs.get("run-1")!;
      expect(run.status).toBe("aborted");
      expect(run.completedAt).toBeGreaterThan(0);
    });
  });

  describe("getActiveRuns", () => {
    it("returns only queued and streaming runs", () => {
      const { startRun, handleChatEvent, getActiveRuns } = useChatStore.getState();
      startRun({ runId: "r1", agentId: "a", sessionKey: "s1", userMessageId: "m" });
      startRun({ runId: "r2", agentId: "a", sessionKey: "s1", userMessageId: "m" });
      startRun({ runId: "r3", agentId: "a", sessionKey: "s2", userMessageId: "m" });

      // r2 streaming
      handleChatEvent(makeChatEvent({ runId: "r2", state: "delta", delta: { text: "x" } }));
      // r3 done
      handleChatEvent(makeChatEvent({ runId: "r3", state: "final", message: { id: "x", role: "assistant", content: "done" } }));

      const active = useChatStore.getState().getActiveRuns();
      expect(active).toHaveLength(2);
      expect(active.map((r) => r.runId).sort()).toEqual(["r1", "r2"]);
    });

    it("filters by sessionKey when provided", () => {
      const { startRun } = useChatStore.getState();
      startRun({ runId: "r1", agentId: "a", sessionKey: "s1", userMessageId: "m" });
      startRun({ runId: "r2", agentId: "a", sessionKey: "s2", userMessageId: "m" });

      const active = useChatStore.getState().getActiveRuns("s1");
      expect(active).toHaveLength(1);
      expect(active[0].runId).toBe("r1");
    });
  });
});
