/**
 * Typed event bus for cross-store communication.
 *
 * Stores emit domain events after mutations; other stores subscribe
 * to events they care about. No cross-store imports needed.
 *
 * Usage:
 *   bus.emit("agent:deleted", { agentId: "abc" });
 *   bus.on("agent:deleted", ({ agentId }) => pruneAgent(agentId));
 */

import type { GatewayAgentRow, GatewayEventFrame } from "./gateway/types";

// ---------------------------------------------------------------------------
// Event type map — add new events here
// ---------------------------------------------------------------------------
export type BusEvents = {
  "agent:deleted": { agentId: string };
  "agent:created": { agent: GatewayAgentRow };
  "agent:renamed": { agentId: string; oldName: string; newName: string };
  "agents:refreshed": { agents: GatewayAgentRow[] };
  "chat:event": { evt: GatewayEventFrame };
};

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------
type EventName = keyof BusEvents;
type Listener<E extends EventName> = (payload: BusEvents[E]) => void;

const listeners = new Map<EventName, Set<Listener<never>>>();

function on<E extends EventName>(event: E, fn: Listener<E>): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn as Listener<never>);
  return () => {
    listeners.get(event)?.delete(fn as Listener<never>);
  };
}

function off<E extends EventName>(event: E, fn: Listener<E>): void {
  listeners.get(event)?.delete(fn as Listener<never>);
}

function emit<E extends EventName>(event: E, payload: BusEvents[E]): void {
  const fns = listeners.get(event);
  if (!fns) return;
  for (const fn of fns) {
    try {
      (fn as Listener<E>)(payload);
    } catch (err) {
      console.error(`[bus] Error in "${event}" listener:`, err);
    }
  }
}

export const bus = { on, off, emit };
