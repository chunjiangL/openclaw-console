"use client";

import { create } from "zustand";
import {
  GatewayClient,
  type ConnectionState,
  type GatewayClientOptions,
} from "../gateway/client";
import type {
  GatewayHelloOk,
  GatewayEventFrame,
  RawAgentsListResult,
  GatewayAgentRow,
  HealthSnapshot,
} from "../gateway/types";
import { bus, type AgentTracePayload } from "../event-bus";
import { useGroupStore } from "./group-store";

type GatewayStore = {
  // Connection
  connectionState: ConnectionState;
  client: GatewayClient | null;
  hello: GatewayHelloOk | null;
  lastError: string | null;
  lastConnectedAt: number | null;

  // Persisted connection config
  gatewayUrl: string;
  gatewayToken: string;

  // Cached data
  agents: GatewayAgentRow[];
  defaultAgentId: string | null;
  health: HealthSnapshot | null;

  // Actions
  connect: (url: string, token: string) => void;
  disconnect: () => void;
  loadAgents: () => Promise<void>;
  refreshHealth: () => Promise<void>;
  rpc: <T = unknown>(method: string, params?: unknown) => Promise<T>;
};

export const useGatewayStore = create<GatewayStore>((set, get) => {
  let healthInterval: ReturnType<typeof setInterval> | null = null;

  function startHealthPolling() {
    stopHealthPolling();
    healthInterval = setInterval(() => {
      get().refreshHealth().catch(() => {});
    }, 30_000);
  }

  function stopHealthPolling() {
    if (healthInterval) {
      clearInterval(healthInterval);
      healthInterval = null;
    }
  }

  return {
    connectionState: "disconnected",
    client: null,
    hello: null,
    lastError: null,
    lastConnectedAt: null,
    gatewayUrl: "",
    gatewayToken: "",
    agents: [],
    defaultAgentId: null,
    health: null,

    connect(url: string, token: string) {
      const prev = get().client;
      if (prev) prev.stop();

      // Persist
      if (typeof window !== "undefined") {
        localStorage.setItem("claw-console:url", url);
        localStorage.setItem("claw-console:token", token);
      }
      set({ gatewayUrl: url, gatewayToken: token, lastError: null });

      const wsUrl = url.replace(/^http/, "ws").replace(/\/$/, "");

      const opts: GatewayClientOptions = {
        url: wsUrl,
        token: token || undefined,
        onStateChange(state) {
          set({ connectionState: state });
        },
        onError(err) {
          set({ lastError: err.message });
        },
        onHello(hello) {
          set({ hello, lastConnectedAt: Date.now() });
          // Load agents and start health polling on connect
          get().loadAgents().catch(() => {});
          get().refreshHealth().catch(() => {});
          startHealthPolling();
          // Sync group chats from gateway
          useGroupStore.getState().syncFromGateway().catch(() => {});
        },
        onEvent(evt: GatewayEventFrame) {
          handleEvent(evt, get);
        },
        onClose() {
          stopHealthPolling();
        },
      };

      const client = new GatewayClient(opts);
      set({ client });
      client.start();
    },

    disconnect() {
      const { client } = get();
      if (client) client.stop();
      stopHealthPolling();
      set({
        client: null,
        connectionState: "disconnected",
        hello: null,
        agents: [],
        defaultAgentId: null,
        health: null,
      });
    },

    async loadAgents() {
      const { client } = get();
      if (!client?.connected) return;
      try {
        const oldAgents = get().agents;
        const result = await client.request<RawAgentsListResult>("agents.list");
        const newAgents: GatewayAgentRow[] = result.agents.map((raw) => ({
          agentId: raw.id,
          name: raw.name || raw.identity?.name || raw.id,
          emoji: raw.identity?.emoji,
          avatar: raw.identity?.avatarUrl || raw.identity?.avatar,
          workspace: undefined,
        }));
        set({
          agents: newAgents,
          defaultAgentId: result.defaultId,
        });

        // Emit granular domain events by diffing old vs new
        emitAgentDiffs(oldAgents, newAgents);
      } catch (err) {
        set({ lastError: String(err) });
      }
    },

    async refreshHealth() {
      const { client } = get();
      if (!client?.connected) return;
      try {
        const result = await client.request<HealthSnapshot>("health");
        set({ health: result });
      } catch {
        // silent
      }
    },

    async rpc<T = unknown>(method: string, params?: unknown): Promise<T> {
      const { client } = get();
      if (!client?.connected) throw new Error("Not connected");
      return client.request<T>(method, params);
    },
  };
});

/** Diff old vs new agent lists and emit granular bus events. */
function emitAgentDiffs(
  oldAgents: GatewayAgentRow[],
  newAgents: GatewayAgentRow[]
) {
  const oldMap = new Map(oldAgents.map((a) => [a.agentId, a]));
  const newMap = new Map(newAgents.map((a) => [a.agentId, a]));

  // Deleted
  for (const [id] of oldMap) {
    if (!newMap.has(id)) {
      bus.emit("agent:deleted", { agentId: id });
    }
  }

  // Created
  for (const [id, agent] of newMap) {
    if (!oldMap.has(id)) {
      bus.emit("agent:created", { agent });
    }
  }

  // Renamed
  for (const [id, newAgent] of newMap) {
    const old = oldMap.get(id);
    if (old && old.name !== newAgent.name) {
      bus.emit("agent:renamed", {
        agentId: id,
        oldName: old.name,
        newName: newAgent.name,
      });
    }
  }

  // Always emit refreshed so subscribers can react to any change
  bus.emit("agents:refreshed", { agents: newAgents });
}

function handleEvent(
  evt: GatewayEventFrame,
  get: () => GatewayStore,
) {
  switch (evt.event) {
    case "agent": {
      const payload = evt.payload as Record<string, unknown> | undefined;
      if (payload?.runId && payload?.stream) {
        // Agent execution trace event — route to trace store via bus
        bus.emit("trace:event", { payload: payload as AgentTracePayload });
      } else {
        // Agent list change (create/delete/rename) — refresh
        get().loadAgents().catch(() => {});
      }
      break;
    }
    case "chat": {
      // Route through bus — no direct cross-store import
      bus.emit("chat:event", { evt });
      break;
    }
  }
}
