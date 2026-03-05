/**
 * Event tracker for orchestrator mode.
 *
 * Thin layer: subscribes to bus chat events, normalizes them,
 * and forwards to the orchestrator store.
 *
 * Worker/PR tracking is heuristic v1 — best-effort, not ground truth.
 */

import { bus } from "../event-bus";
import type { GatewayEventFrame } from "../gateway/types";
import { extractText } from "../gateway/types";
import { detectPrCreation } from "./response-parser";

// ---------------------------------------------------------------------------
// Normalized event types
// ---------------------------------------------------------------------------

export type NormalizedWorkerEvent =
  | { type: "lead_delta"; runId: string; sessionKey: string; delta: string }
  | { type: "lead_final"; runId: string; sessionKey: string; text: string }
  | { type: "lead_error"; runId: string; sessionKey: string; error: string }
  | { type: "worker_streaming"; sessionKey: string; delta: string }
  | { type: "worker_complete"; sessionKey: string; text: string }
  | { type: "worker_error"; sessionKey: string; error: string }
  | {
      type: "pr_detected";
      sessionKey: string;
      prNumber: number;
      title: string;
    };

type ChatEventPayload = {
  runId?: string;
  sessionKey?: string;
  seq?: number;
  state?: "delta" | "final" | "aborted" | "error";
  message?: unknown;
  errorMessage?: string;
};

function extractMessageText(payload: ChatEventPayload): string {
  const msg = payload.message as { content?: unknown } | undefined;
  if (!msg) return "";
  // Try message.content first (standard gateway format), fall back to message itself
  if (msg.content !== undefined) return extractText(msg.content);
  return extractText(msg);
}

// ---------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------

/**
 * Start tracking orchestrator events.
 *
 * @param leadSessionKey - The lead agent's session key (to distinguish lead vs worker events)
 * @param onEvent - Callback for normalized events
 * @returns Unsubscribe function
 */
export function startTracking(
  leadSessionKey: string,
  onEvent: (evt: NormalizedWorkerEvent) => void,
): () => void {
  const unsub = bus.on("chat:event", ({ evt }: { evt: GatewayEventFrame }) => {
    if (evt.event !== "chat") return;

    const payload = evt.payload as ChatEventPayload | undefined;
    if (!payload?.sessionKey || !payload.state) return;

    const { sessionKey, state, runId } = payload;
    const isLead = sessionKey === leadSessionKey;

    if (state === "delta") {
      const delta = extractMessageText(payload);
      if (!delta) return;

      if (isLead) {
        onEvent({
          type: "lead_delta",
          runId: runId ?? "",
          sessionKey,
          delta,
        });
      } else {
        onEvent({ type: "worker_streaming", sessionKey, delta });
      }
    } else if (state === "final") {
      const text = extractMessageText(payload);

      if (isLead) {
        onEvent({
          type: "lead_final",
          runId: runId ?? "",
          sessionKey,
          text,
        });
      } else {
        onEvent({ type: "worker_complete", sessionKey, text });

        // Heuristic v1: detect PR creation in worker output
        const pr = detectPrCreation(text);
        if (pr) {
          onEvent({
            type: "pr_detected",
            sessionKey,
            prNumber: pr.prNumber,
            title: pr.title,
          });
        }
      }
    } else if (state === "error" || state === "aborted") {
      const error =
        payload.errorMessage ?? extractMessageText(payload) ?? "Unknown error";

      if (isLead) {
        onEvent({
          type: "lead_error",
          runId: runId ?? "",
          sessionKey,
          error,
        });
      } else {
        onEvent({ type: "worker_error", sessionKey, error });
      }
    }
  });

  return unsub;
}
