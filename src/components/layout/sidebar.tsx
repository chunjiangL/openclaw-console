"use client";

import { useGatewayStore } from "@/lib/stores/gateway-store";
import { useGroupStore } from "@/lib/stores/group-store";
import { useRouter } from "@/lib/router";
import { useState } from "react";

export function Sidebar() {
  const agents = useGatewayStore((s) => s.agents);
  const defaultAgentId = useGatewayStore((s) => s.defaultAgentId);
  const connectionState = useGatewayStore((s) => s.connectionState);
  const groups = useGroupStore((s) => s.groups);
  const createGroup = useGroupStore((s) => s.createGroup);
  const { currentPath, navigate } = useRouter();

  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  const handleCreateGroup = () => {
    if (!newGroupName.trim()) return;
    const agentIds = agents.map((a) => a.agentId);
    const group = createGroup(newGroupName.trim(), agentIds);
    setNewGroupName("");
    setShowCreateGroup(false);
    navigate(`/chat/group/${group.id}`);
  };

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border-default bg-surface relative">
      {/* Title */}
      <div className="p-4 pb-2 border-b border-border-default">
        <div className="flex items-center gap-2">
          <LobsterIcon />
          <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-fg whitespace-nowrap">
            {"░░ CLAW CONSOLE ░░"}
          </span>
        </div>
        <div className="h-px bg-divider-bright mt-2" />
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 pt-3">
        {/* Dashboard */}
        <button
          onClick={() => navigate("/")}
          className={`mb-3 flex w-full items-center px-3 py-2 text-xs uppercase tracking-[0.15em] transition-all ${
            currentPath === "/"
              ? "text-fg border-l-2 border-border-solid bg-active"
              : "text-fg-muted hover:text-fg hover:bg-hover"
          }`}
        >
          <span className="mr-2 text-[10px] opacity-40">&gt;</span>
          DASHBOARD
        </button>

        {/* Agents Section */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between px-3">
            <span className="text-[10px] tracking-[0.25em] uppercase text-fg-muted">
              {"▓"} AGENTS
            </span>
            <span className="text-[10px] text-fg-dim font-mono">
              {agents.length}
            </span>
          </div>
          <div className="h-px bg-divider-dim mx-3 mb-2" />
          {connectionState !== "connected" ? (
            <div className="px-3 text-[10px] uppercase tracking-wider text-fg-ghost">
              NOT CONNECTED
            </div>
          ) : agents.length === 0 ? (
            <div className="px-3 text-[10px] uppercase tracking-wider text-fg-ghost">
              NO AGENTS
            </div>
          ) : (
            agents.map((agent) => {
              const isActive = currentPath === `/agents/${agent.agentId}`;
              return (
                <button
                  key={agent.agentId}
                  onClick={() => navigate(`/agents/${agent.agentId}`)}
                  className={`flex w-full items-start px-3 py-2.5 text-xs transition-all ${
                    isActive
                      ? "text-fg border-l-2 border-border-solid bg-active"
                      : "text-fg-muted hover:text-fg hover:bg-hover"
                  }`}
                >
                  <span className="mr-2 text-[10px] shrink-0 mt-0.5">
                    {isActive ? "●" : "○"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center">
                      <span className="truncate font-mono text-xs">
                        {agent.name}
                      </span>
                      {agent.agentId === defaultAgentId && (
                        <span className="ml-auto text-[9px] text-fg-dim tracking-wider shrink-0">DEF</span>
                      )}
                    </div>
                    {(() => {
                      const agentGroups = groups.filter((g) => g.agents.includes(agent.agentId));
                      return agentGroups.length > 0 ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {agentGroups.map((g) => (
                            <span
                              key={g.id}
                              className="bg-accent px-1.5 py-px font-mono text-[8px] text-accent-fg uppercase tracking-wider"
                            >
                              {g.name}
                            </span>
                          ))}
                        </div>
                      ) : null;
                    })()}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Group Chats Section */}
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between px-3">
            <span className="text-[10px] tracking-[0.25em] uppercase text-fg-muted">
              {"▓"} GROUP CHATS
            </span>
            <button
              onClick={() => setShowCreateGroup(true)}
              className="text-[10px] text-fg-dim hover:text-fg transition-colors"
              title="Create group chat"
            >
              [+]
            </button>
          </div>
          <div className="h-px bg-divider-dim mx-3 mb-2" />
          {showCreateGroup && (
            <div className="mx-2 mb-2 flex gap-1">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="GROUP NAME..."
                className="flex-1 border border-border-interactive bg-surface px-2 py-1 text-[10px] text-fg uppercase tracking-wider focus:outline-none focus:border-border-focus"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateGroup();
                  if (e.key === "Escape") setShowCreateGroup(false);
                }}
                autoFocus
              />
              <button
                onClick={handleCreateGroup}
                className="bg-accent px-2 py-1 text-[10px] text-accent-fg font-bold uppercase"
              >
                ADD
              </button>
            </div>
          )}
          {groups.map((group) => {
            const isActive = currentPath === `/chat/group/${group.id}`;
            return (
              <button
                key={group.id}
                onClick={() => navigate(`/chat/group/${group.id}`)}
                className={`flex w-full items-center px-3 py-1.5 text-xs transition-all ${
                  isActive
                    ? "text-fg border-l-2 border-border-solid bg-active"
                    : "text-fg-muted hover:text-fg hover:bg-hover"
                }`}
              >
                <span className="mr-2 text-[10px] opacity-40">#</span>
                <span className="truncate font-mono text-xs">{group.name}</span>
                <span className="ml-auto text-[9px] text-fg-dim">{group.agents.length}</span>
              </button>
            );
          })}
        </div>

        {/* Chat Test */}
        <div className="mb-4">
          <div className="mb-2 px-3">
            <span className="text-[10px] tracking-[0.25em] uppercase text-fg-muted">
              {"▓"} DEBUG
            </span>
          </div>
          <div className="h-px bg-divider-dim mx-3 mb-2" />
          <button
            onClick={() => navigate("/chat/test")}
            className={`flex w-full items-center px-3 py-1.5 text-xs transition-all ${
              currentPath === "/chat/test"
                ? "text-fg border-l-2 border-border-solid bg-active"
                : "text-fg-muted hover:text-fg hover:bg-hover"
            }`}
          >
            <span className="mr-2 text-[10px] opacity-40">&gt;</span>
            <span className="font-mono text-xs">CHAT TEST</span>
          </button>
        </div>
      </nav>

      {/* Bottom decoration */}
      <div className="h-px bg-divider" />
    </aside>
  );
}

/**
 * Monochrome 16x16 pixel art lobster — based on openclaw's pixel-lobster.svg.
 * All filled pixels rendered as currentColor (black in day, white at night).
 * Eyes are inverted (bg-color) for contrast.
 */
function LobsterIcon() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 16 16"
      className="shrink-0"
      role="img"
      aria-label="OpenClaw lobster"
    >
      {/* outline */}
      <g fill="currentColor">
        <rect x="1" y="5" width="1" height="3"/>
        <rect x="2" y="4" width="1" height="1"/>
        <rect x="2" y="8" width="1" height="1"/>
        <rect x="3" y="3" width="1" height="1"/>
        <rect x="3" y="9" width="1" height="1"/>
        <rect x="4" y="2" width="1" height="1"/>
        <rect x="4" y="10" width="1" height="1"/>
        <rect x="5" y="2" width="6" height="1"/>
        <rect x="11" y="2" width="1" height="1"/>
        <rect x="12" y="3" width="1" height="1"/>
        <rect x="12" y="9" width="1" height="1"/>
        <rect x="13" y="4" width="1" height="1"/>
        <rect x="13" y="8" width="1" height="1"/>
        <rect x="14" y="5" width="1" height="3"/>
        <rect x="5" y="11" width="6" height="1"/>
        <rect x="4" y="12" width="1" height="1"/>
        <rect x="11" y="12" width="1" height="1"/>
        <rect x="3" y="13" width="1" height="1"/>
        <rect x="12" y="13" width="1" height="1"/>
        <rect x="5" y="14" width="6" height="1"/>
      </g>
      {/* body */}
      <g fill="currentColor">
        <rect x="5" y="3" width="6" height="1"/>
        <rect x="4" y="4" width="8" height="1"/>
        <rect x="3" y="5" width="10" height="1"/>
        <rect x="3" y="6" width="10" height="1"/>
        <rect x="3" y="7" width="10" height="1"/>
        <rect x="4" y="8" width="8" height="1"/>
        <rect x="5" y="9" width="6" height="1"/>
        <rect x="5" y="12" width="6" height="1"/>
        <rect x="6" y="13" width="4" height="1"/>
      </g>
      {/* claws */}
      <g fill="currentColor">
        <rect x="1" y="6" width="2" height="1"/>
        <rect x="2" y="5" width="1" height="1"/>
        <rect x="2" y="7" width="1" height="1"/>
        <rect x="13" y="6" width="2" height="1"/>
        <rect x="13" y="5" width="1" height="1"/>
        <rect x="13" y="7" width="1" height="1"/>
      </g>
      {/* eyes — inverted color for visibility */}
      <g fill="var(--surface)">
        <rect x="6" y="5" width="1" height="1"/>
        <rect x="9" y="5" width="1" height="1"/>
      </g>
    </svg>
  );
}
