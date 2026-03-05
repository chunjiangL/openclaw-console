/**
 * RPC bridge for orchestrator ↔ lead agent communication.
 *
 * Session protocol:
 * - First message: bootstrap prompt + user goal (sendBootstrapAndGoal)
 * - All subsequent: plain text only (sendFollowUp / sendApproval)
 * - Same sessionKey throughout the entire session
 */

import { uuid } from "../uuid";

type RpcFn = <T = unknown>(method: string, params?: unknown) => Promise<T>;

type ChatSendResult = {
  runId: string;
  status: string;
};

/**
 * Build the session key for the lead agent's orchestrator session.
 */
export function buildLeadSessionKey(
  leadAgentId: string,
  sessionId: string,
): string {
  return `agent:${leadAgentId}:claw-console:team:${sessionId}`;
}

/**
 * Send the first message: bootstrap system prompt + user goal.
 * Only called once per session.
 */
export async function sendBootstrapAndGoal(
  rpc: RpcFn,
  sessionKey: string,
  bootstrapPrompt: string,
  goal: string,
): Promise<string> {
  const message = `${bootstrapPrompt}\n\n---\n\n## User Goal\n\n${goal}`;
  const idempotencyKey = uuid();

  const result = await rpc<ChatSendResult>("chat.send", {
    sessionKey,
    message,
    idempotencyKey,
  });

  return result.runId;
}

/**
 * Send a plain follow-up message to the lead agent.
 * Never includes the bootstrap prompt.
 */
export async function sendFollowUp(
  rpc: RpcFn,
  sessionKey: string,
  message: string,
): Promise<string> {
  const idempotencyKey = uuid();

  const result = await rpc<ChatSendResult>("chat.send", {
    sessionKey,
    message,
    idempotencyKey,
  });

  return result.runId;
}

/**
 * Send approval message. Triggers Phase 2 (execution).
 */
export async function sendApproval(
  rpc: RpcFn,
  sessionKey: string,
): Promise<string> {
  return sendFollowUp(
    rpc,
    sessionKey,
    "Approved. Execute the plan now. Spawn workers for each task, respecting dependency order.",
  );
}

/**
 * Send revision feedback. Lead agent should update the plan.
 */
export async function sendRevision(
  rpc: RpcFn,
  sessionKey: string,
  feedback: string,
): Promise<string> {
  return sendFollowUp(
    rpc,
    sessionKey,
    `Revise the plan based on this feedback:\n\n${feedback}`,
  );
}
