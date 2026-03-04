import { describe, it, expect } from "vitest";
import {
  buildSessionKey,
  matchesGroup,
  getRecentAgentReplies,
  MAX_INJECT_LENGTH,
  MAX_PRIOR_INJECTIONS,
} from "../group-chat-utils";

describe("buildSessionKey", () => {
  it("produces the correct format", () => {
    expect(buildSessionKey("agent-abc", "group-123")).toBe(
      "agent:agent-abc:claw-console:group:group-123"
    );
  });

  it("handles special characters in IDs", () => {
    const key = buildSessionKey("a:b", "g:1");
    expect(key).toBe("agent:a:b:claw-console:group:g:1");
  });
});

describe("matchesGroup", () => {
  it("matches exact group ID", () => {
    const key = buildSessionKey("agent-1", "group-1");
    expect(matchesGroup(key, "group-1")).toBe(true);
  });

  it("does NOT match partial group IDs (group-1 vs group-10)", () => {
    const key = buildSessionKey("agent-1", "group-10");
    expect(matchesGroup(key, "group-1")).toBe(false);
  });

  it("does NOT match substring in middle of key", () => {
    const key = "agent:group-1:claw-console:group:other";
    expect(matchesGroup(key, "group-1")).toBe(false);
  });

  it("matches when group ID is a UUID", () => {
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const key = buildSessionKey("agent-1", uuid);
    expect(matchesGroup(key, uuid)).toBe(true);
  });
});

describe("getRecentAgentReplies", () => {
  const agents = [
    { agentId: "a1", name: "Alpha" },
    { agentId: "a2", name: "Beta" },
  ];

  it("returns only agent messages", () => {
    const messages = [
      { id: "m1", role: "user", content: "user msg" },
      { id: "m2", role: "agent", agentId: "a1", content: "agent reply" },
    ];
    const replies = getRecentAgentReplies(messages, agents);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("[Alpha replied]");
    expect(replies[0]).toContain("agent reply");
  });

  it("excludes message by excludeMessageId", () => {
    const messages = [
      { id: "m1", role: "agent", agentId: "a1", content: "first" },
      { id: "m2", role: "agent", agentId: "a2", content: "second" },
    ];
    const replies = getRecentAgentReplies(messages, agents, "m1");
    expect(replies).toHaveLength(1);
    expect(replies[0]).toContain("[Beta replied]");
  });

  it("limits to MAX_PRIOR_INJECTIONS replies", () => {
    const messages = Array.from({ length: MAX_PRIOR_INJECTIONS + 2 }, (_, i) => ({
      id: `m${i}`,
      role: "agent" as const,
      agentId: "a1",
      content: `reply ${i}`,
    }));
    const replies = getRecentAgentReplies(messages, agents);
    expect(replies).toHaveLength(MAX_PRIOR_INJECTIONS);
    // Should take the LAST N
    expect(replies[0]).toContain(`reply ${messages.length - MAX_PRIOR_INJECTIONS}`);
  });

  it("truncates long content at MAX_INJECT_LENGTH", () => {
    const longContent = "x".repeat(MAX_INJECT_LENGTH + 100);
    const messages = [{ id: "m1", role: "agent" as const, agentId: "a1", content: longContent }];
    const replies = getRecentAgentReplies(messages, agents);
    const textPart = replies[0].split(":\n")[1];
    expect(textPart).toHaveLength(MAX_INJECT_LENGTH + 3); // "..." = 3 chars
    expect(textPart.endsWith("...")).toBe(true);
  });

  it("does not truncate content at exactly MAX_INJECT_LENGTH", () => {
    const exactContent = "y".repeat(MAX_INJECT_LENGTH);
    const messages = [{ id: "m1", role: "agent" as const, agentId: "a1", content: exactContent }];
    const replies = getRecentAgentReplies(messages, agents);
    const textPart = replies[0].split(":\n")[1];
    expect(textPart).toHaveLength(MAX_INJECT_LENGTH);
    expect(textPart.endsWith("...")).toBe(false);
  });

  it("uses agentId as name fallback when agent not found", () => {
    const messages = [{ id: "m1", role: "agent" as const, agentId: "unknown-id", content: "hello" }];
    const replies = getRecentAgentReplies(messages, agents);
    expect(replies[0]).toContain("[unknown-id replied]");
  });

  it("uses 'Agent' as name fallback when agentId is missing", () => {
    const messages = [{ id: "m1", role: "agent" as const, content: "hello" }];
    const replies = getRecentAgentReplies(messages, agents);
    expect(replies[0]).toContain("[Agent replied]");
  });

  it("returns empty array when no agent messages", () => {
    const messages = [
      { id: "m1", role: "user" as const, content: "hey" },
      { id: "m2", role: "system" as const, content: "sys" },
    ];
    expect(getRecentAgentReplies(messages, agents)).toEqual([]);
  });
});
