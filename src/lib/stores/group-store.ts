"use client";

import { create } from "zustand";
import { bus } from "../event-bus";
import { uuid } from "../uuid";
import { pullAndMergeGroups, schedulePushGroups } from "./group-sync";

export type GroupChat = {
  id: string;
  name: string;
  agents: string[]; // agentIds
  responseMode: "parallel" | "sequential";
  contextSharing: boolean;
  createdAt: number;
};

export type GroupMessage = {
  id: string;
  groupId: string;
  role: "user" | "agent" | "system";
  agentId?: string;
  content: string;
  timestamp: number;
  targetAgents: string[];
  runIds: string[]; // one per targeted agent
};

type GroupStore = {
  groups: GroupChat[];
  messages: Map<string, GroupMessage[]>; // groupId → messages
  activeGroupId: string | null;

  // Actions
  loadGroups: () => void;
  createGroup: (name: string, agents: string[], mode?: "parallel" | "sequential") => GroupChat;
  updateGroup: (id: string, patch: Partial<Omit<GroupChat, "id" | "createdAt">>) => void;
  deleteGroup: (id: string) => void;
  setActiveGroup: (id: string | null) => void;
  addMessage: (msg: GroupMessage) => void;
  getGroupMessages: (groupId: string) => GroupMessage[];
  clearGroupMessages: (groupId: string) => void;
  persistGroups: () => void;
  syncFromGateway: () => Promise<void>;
  _pushToGateway: () => void;
};

const STORAGE_KEY = "claw-console:groups";
const MESSAGES_KEY = "claw-console:group-messages";

export const useGroupStore = create<GroupStore>((set, get) => ({
  groups: [],
  messages: new Map(),
  activeGroupId: null,

  loadGroups() {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) set({ groups: JSON.parse(raw) });
      const msgRaw = localStorage.getItem(MESSAGES_KEY);
      if (msgRaw) {
        const entries: [string, GroupMessage[]][] = JSON.parse(msgRaw);
        set({ messages: new Map(entries) });
      }
    } catch {
      // corrupted storage
    }
  },

  createGroup(name, agents, mode = "parallel") {
    const group: GroupChat = {
      id: uuid(),
      name,
      agents,
      responseMode: mode,
      contextSharing: false,
      createdAt: Date.now(),
    };
    set((state) => ({ groups: [...state.groups, group] }));
    get().persistGroups();
    get()._pushToGateway();
    return group;
  },

  updateGroup(id, patch) {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === id ? { ...g, ...patch } : g
      ),
    }));
    get().persistGroups();
    get()._pushToGateway();
  },

  deleteGroup(id) {
    set((state) => {
      const messages = new Map(state.messages);
      messages.delete(id);
      return {
        groups: state.groups.filter((g) => g.id !== id),
        messages,
        activeGroupId: state.activeGroupId === id ? null : state.activeGroupId,
      };
    });
    get().persistGroups();
    get()._pushToGateway();
  },

  setActiveGroup(id) {
    set({ activeGroupId: id });
  },

  addMessage(msg) {
    set((state) => {
      const messages = new Map(state.messages);
      const existing = messages.get(msg.groupId) ?? [];
      messages.set(msg.groupId, [...existing, msg]);
      return { messages };
    });
    // Persist async
    setTimeout(() => get().persistGroups(), 100);
  },

  getGroupMessages(groupId) {
    return get().messages.get(groupId) ?? [];
  },

  clearGroupMessages(groupId) {
    set((state) => {
      const messages = new Map(state.messages);
      messages.delete(groupId);
      return { messages };
    });
    get().persistGroups();
  },

  persistGroups() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(get().groups));
      const entries = Array.from(get().messages.entries());
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(entries));
    } catch {
      // storage full
    }
  },

  async syncFromGateway() {
    // Lazy import to avoid circular dependency at module load time
    const { useGatewayStore } = await import("./gateway-store");
    const { rpc } = useGatewayStore.getState();
    const localGroups = get().groups;
    const result = await pullAndMergeGroups(rpc, localGroups);
    if (result) {
      set({ groups: result.merged });
      get().persistGroups();
    }
  },

  _pushToGateway() {
    // Lazy import to avoid circular dependency at module load time
    import("./gateway-store").then(({ useGatewayStore }) => {
      const { connectionState, rpc } = useGatewayStore.getState();
      if (connectionState !== "connected") return;
      schedulePushGroups(rpc, get().groups);
    });
  },
}));

// ---------------------------------------------------------------------------
// Bus subscriptions — prune deleted agents from all groups
// ---------------------------------------------------------------------------
bus.on("agent:deleted", ({ agentId }) => {
  const { groups, updateGroup } = useGroupStore.getState();
  for (const group of groups) {
    if (group.agents.includes(agentId)) {
      updateGroup(group.id, {
        agents: group.agents.filter((id) => id !== agentId),
      });
    }
  }
});
