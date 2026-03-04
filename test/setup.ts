import { afterEach, vi } from "vitest";

// Polyfill localStorage for jsdom (vitest's jsdom may not provide full Storage)
if (typeof globalThis.localStorage === "undefined" || typeof globalThis.localStorage.getItem !== "function") {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null,
  } as Storage;
}

import { useChatStore } from "@/lib/stores/chat-store";
import { useGroupStore } from "@/lib/stores/group-store";
import { useGatewayStore } from "@/lib/stores/gateway-store";

afterEach(() => {
  // Reset Zustand stores to initial state (official testing pattern)
  useChatStore.setState({ runs: new Map(), messages: new Map() });
  useGroupStore.setState({
    groups: [],
    messages: new Map(),
    activeGroupId: null,
  });
  useGatewayStore.setState({
    agents: [],
    defaultAgentId: null,
    connectionState: "disconnected",
    client: null,
    hello: null,
    lastError: null,
    lastConnectedAt: null,
    health: null,
  });

  // Clear persisted storage to prevent cross-test pollution
  localStorage.clear();
  vi.restoreAllMocks();
});
