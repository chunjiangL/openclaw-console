/** Pure utility functions for group chat — extracted for testability. */

export const MAX_INJECT_LENGTH = 2000;
export const MAX_PRIOR_INJECTIONS = 3;

/** Build a deterministic session key for an agent within a group. */
export function buildSessionKey(agentId: string, groupId: string): string {
  return `agent:${agentId}:claw-console:group:${groupId}`;
}

/** Check if a session key belongs to a specific group (exact suffix match). */
export function matchesGroup(sessionKey: string, groupId: string): boolean {
  return sessionKey.endsWith(`:group:${groupId}`);
}

/** Extract recent agent replies formatted for context injection. */
export function getRecentAgentReplies(
  messages: Array<{ id: string; role: string; agentId?: string; content: string }>,
  agents: Array<{ agentId: string; name: string }>,
  excludeMessageId?: string,
): string[] {
  return messages
    .filter((m) => m.role === "agent" && m.id !== excludeMessageId)
    .slice(-MAX_PRIOR_INJECTIONS)
    .map((m) => {
      const agent = agents.find((a) => a.agentId === m.agentId);
      const name = agent?.name ?? m.agentId ?? "Agent";
      const text =
        m.content.length > MAX_INJECT_LENGTH
          ? m.content.slice(0, MAX_INJECT_LENGTH) + "..."
          : m.content;
      return `[${name} replied]:\n${text}`;
    });
}
