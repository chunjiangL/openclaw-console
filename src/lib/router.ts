"use client";

import { create } from "zustand";

type RouterStore = {
  currentPath: string;
  params: Record<string, string>;
  navigate: (path: string) => void;
};

function getInitialPath() {
  if (typeof window === "undefined") return "/";
  return window.location.pathname || "/";
}

export const useRouter = create<RouterStore>((set) => ({
  currentPath: getInitialPath(),
  params: extractParams(getInitialPath()),
  navigate(path) {
    const params = extractParams(path);
    set({ currentPath: path, params });
    // Update browser URL without reload
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", path);
    }
  },
}));

function extractParams(path: string): Record<string, string> {
  const params: Record<string, string> = {};

  // /agents/:agentId
  const agentMatch = path.match(/^\/agents\/([^/]+)/);
  if (agentMatch) params.agentId = agentMatch[1];

  // /agents/:agentId/:tab
  const tabMatch = path.match(/^\/agents\/[^/]+\/([^/]+)/);
  if (tabMatch) params.tab = tabMatch[1];

  // /chat/group/:groupId
  const groupMatch = path.match(/^\/chat\/group\/([^/]+)/);
  if (groupMatch) params.groupId = groupMatch[1];

  return params;
}

// Handle browser back/forward
if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    const path = window.location.pathname;
    useRouter.setState({
      currentPath: path,
      params: extractParams(path),
    });
  });
}
