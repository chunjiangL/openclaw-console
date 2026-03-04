"use client";

import { useGatewayStore } from "@/lib/stores/gateway-store";
import { useRouter } from "@/lib/router";
import { useState } from "react";

export function AgentList() {
  const agents = useGatewayStore((s) => s.agents);
  const defaultAgentId = useGatewayStore((s) => s.defaultAgentId);
  const connectionState = useGatewayStore((s) => s.connectionState);
  const rpc = useGatewayStore((s) => s.rpc);
  const loadAgents = useGatewayStore((s) => s.loadAgents);
  const { navigate } = useRouter();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWorkspace, setNewWorkspace] = useState("");
  const [creating, setCreating] = useState(false);

  if (connectionState !== "connected") {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-dim">
          CONNECT TO GATEWAY TO VIEW AGENTS
        </p>
      </div>
    );
  }

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await rpc("agents.create", {
        name: newName.trim(),
        workspace: newWorkspace.trim() || undefined,
      });
      await loadAgents();
      setShowCreate(false);
      setNewName("");
      setNewWorkspace("");
    } catch (err) {
      alert(String(err));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (agentId: string, name: string) => {
    if (!confirm(`Delete agent "${name}"? This will remove all agent files.`)) return;
    try {
      await rpc("agents.delete", { agentId, deleteFiles: true });
      await loadAgents();
    } catch (err) {
      alert(String(err));
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold uppercase tracking-wide text-fg">AGENTS</h2>
          <p className="font-mono text-[10px] tracking-[0.2em] uppercase text-fg-dim mt-1">
            {"▓"} REGISTERED UNITS
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg hover:bg-accent-hover transition-all"
        >
          + CREATE AGENT
        </button>
      </div>

      {/* Create Agent Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay">
          <div className="w-full max-w-md border border-border-interactive bg-surface p-6">
            <h3 className="mb-1 text-sm font-bold uppercase tracking-[0.15em] text-fg">
              CREATE AGENT
            </h3>
            <div className="h-px bg-divider mb-4" />
            <div className="space-y-3">
              <div>
                <label className="mb-1 block font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted">NAME</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="AGENT NAME"
                  className="w-full border border-border-interactive bg-surface px-3 py-2 font-mono text-sm text-fg focus:outline-none focus:border-border-focus"
                  autoFocus
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted">
                  WORKSPACE PATH <span className="text-fg-ghost">(OPTIONAL)</span>
                </label>
                <input
                  type="text"
                  value={newWorkspace}
                  onChange={(e) => setNewWorkspace(e.target.value)}
                  placeholder="/PATH/TO/WORKSPACE"
                  className="w-full border border-border-interactive bg-surface px-3 py-2 font-mono text-sm text-fg focus:outline-none focus:border-border-focus"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowCreate(false)}
                className="border border-border-interactive px-4 py-2 font-mono text-xs uppercase tracking-wider text-fg-muted hover:bg-active hover:text-fg transition-all"
              >
                CANCEL
              </button>
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="bg-accent px-4 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg hover:bg-accent-hover transition-all disabled:opacity-30"
              >
                {creating ? "CREATING..." : "CREATE"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Agent Grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <div
            key={agent.agentId}
            className="group relative cursor-pointer border border-border-default p-4 hover:border-border-hover transition-all"
            onClick={() => navigate(`/agents/${agent.agentId}`)}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-fg shrink-0">{"●"}</span>
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wide text-fg">{agent.name}</h3>
                  <p className="font-mono text-[10px] text-fg-dim">{agent.agentId}</p>
                </div>
              </div>
              {agent.agentId === defaultAgentId && (
                <span className="bg-active border border-border-interactive px-2 py-0.5 font-mono text-[9px] text-fg uppercase tracking-wider shrink-0">
                  DEFAULT
                </span>
              )}
            </div>
            {agent.workspace && (
              <p className="mt-2 truncate font-mono text-[10px] text-fg-ghost">
                {agent.workspace}
              </p>
            )}
            {/* Delete button */}
            {agent.agentId !== defaultAgentId && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(agent.agentId, agent.name);
                }}
                className="absolute right-2 bottom-2 hidden font-mono text-[10px] text-fg-dim hover:text-fg group-hover:block transition-all uppercase tracking-wider"
              >
                DELETE
              </button>
            )}
          </div>
        ))}
      </div>

      {agents.length === 0 && (
        <div className="border border-dashed border-border-interactive p-8 text-center">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-dim">NO AGENTS REGISTERED</p>
        </div>
      )}
    </div>
  );
}
