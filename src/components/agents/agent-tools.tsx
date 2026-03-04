"use client";

import { useGatewayStore } from "@/lib/stores/gateway-store";
import { useEffect, useState, useMemo, useCallback } from "react";

// ---------------------------------------------------------------------------
// Tool definitions — mirrors openclaw's TOOL_SECTIONS
// ---------------------------------------------------------------------------
type ToolDef = { id: string; label: string; description: string };
type ToolSection = { id: string; label: string; tools: ToolDef[] };

const TOOL_SECTIONS: ToolSection[] = [
  {
    id: "fs",
    label: "FILES",
    tools: [
      { id: "read", label: "READ", description: "Read file contents" },
      { id: "write", label: "WRITE", description: "Create or overwrite files" },
      { id: "edit", label: "EDIT", description: "Make precise edits" },
      { id: "apply_patch", label: "APPLY_PATCH", description: "Patch files (OpenAI)" },
    ],
  },
  {
    id: "runtime",
    label: "RUNTIME",
    tools: [
      { id: "exec", label: "EXEC", description: "Run shell commands" },
      { id: "process", label: "PROCESS", description: "Manage background processes" },
    ],
  },
  {
    id: "web",
    label: "WEB",
    tools: [
      { id: "web_search", label: "WEB_SEARCH", description: "Search the web" },
      { id: "web_fetch", label: "WEB_FETCH", description: "Fetch web content" },
    ],
  },
  {
    id: "memory",
    label: "MEMORY",
    tools: [
      { id: "memory_search", label: "MEMORY_SEARCH", description: "Semantic search" },
      { id: "memory_get", label: "MEMORY_GET", description: "Read memory files" },
    ],
  },
  {
    id: "sessions",
    label: "SESSIONS",
    tools: [
      { id: "sessions_list", label: "SESSIONS_LIST", description: "List sessions" },
      { id: "sessions_history", label: "SESSIONS_HISTORY", description: "Session history" },
      { id: "sessions_send", label: "SESSIONS_SEND", description: "Send to session" },
      { id: "sessions_spawn", label: "SESSIONS_SPAWN", description: "Spawn sub-agent" },
      { id: "session_status", label: "SESSION_STATUS", description: "Session status" },
    ],
  },
  {
    id: "ui",
    label: "UI",
    tools: [
      { id: "browser", label: "BROWSER", description: "Control web browser" },
      { id: "canvas", label: "CANVAS", description: "Control canvases" },
    ],
  },
  {
    id: "messaging",
    label: "MESSAGING",
    tools: [{ id: "message", label: "MESSAGE", description: "Send messages" }],
  },
  {
    id: "automation",
    label: "AUTOMATION",
    tools: [
      { id: "cron", label: "CRON", description: "Schedule tasks" },
      { id: "gateway", label: "GATEWAY", description: "Gateway control" },
    ],
  },
  {
    id: "nodes",
    label: "NODES",
    tools: [{ id: "nodes", label: "NODES", description: "Nodes + devices" }],
  },
  {
    id: "agents",
    label: "AGENTS",
    tools: [{ id: "agents_list", label: "AGENTS_LIST", description: "List agents" }],
  },
  {
    id: "media",
    label: "MEDIA",
    tools: [{ id: "image", label: "IMAGE", description: "Image understanding" }],
  },
];

const ALL_TOOL_IDS = TOOL_SECTIONS.flatMap((s) => s.tools.map((t) => t.id));

const PROFILES: { id: string; label: string }[] = [
  { id: "minimal", label: "MINIMAL" },
  { id: "coding", label: "CODING" },
  { id: "messaging", label: "MESSAGING" },
  { id: "full", label: "FULL" },
];

// ---------------------------------------------------------------------------
// Profile-based tool resolution (simplified client-side version)
// ---------------------------------------------------------------------------
const PROFILE_ALLOW: Record<string, string[]> = {
  minimal: ["read", "web_search", "web_fetch", "memory_search", "memory_get", "image"],
  coding: ["read", "write", "edit", "apply_patch", "exec", "process", "web_search", "web_fetch", "memory_search", "memory_get", "image"],
  messaging: ["read", "write", "edit", "exec", "process", "web_search", "web_fetch", "memory_search", "memory_get", "message", "image", "sessions_list", "sessions_history", "sessions_send", "sessions_spawn", "session_status"],
  full: ALL_TOOL_IDS,
};

function isAllowedByProfile(toolId: string, profile: string, alsoAllow: string[], deny: string[]): boolean {
  if (deny.includes(toolId)) return false;
  const profileAllow = PROFILE_ALLOW[profile] ?? ALL_TOOL_IDS;
  return profileAllow.includes(toolId) || alsoAllow.includes(toolId);
}

// ---------------------------------------------------------------------------
// Config types
// ---------------------------------------------------------------------------
type AgentConfigEntry = {
  id: string;
  name?: string;
  workspace?: string;
  tools?: {
    profile?: string;
    allow?: string[];
    alsoAllow?: string[];
    deny?: string[];
  };
};

type ConfigSnapshot = {
  agents?: {
    list?: AgentConfigEntry[];
  };
  tools?: {
    profile?: string;
    allow?: string[];
    alsoAllow?: string[];
    deny?: string[];
  };
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function AgentTools({ agentId }: { agentId: string }) {
  const rpc = useGatewayStore((s) => s.rpc);
  const [config, setConfig] = useState<ConfigSnapshot | null>(null);
  const [configRaw, setConfigRaw] = useState<string>("");
  const [configHash, setConfigHash] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Working copy of overrides
  const [localAlsoAllow, setLocalAlsoAllow] = useState<string[]>([]);
  const [localDeny, setLocalDeny] = useState<string[]>([]);
  const [localProfile, setLocalProfile] = useState<string>("full");

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const result = await rpc<{ config: Record<string, unknown>; raw: string; hash: string }>(
        "config.get",
        {}
      );
      const cfg = result.config as ConfigSnapshot;
      setConfig(cfg);
      setConfigRaw(result.raw);
      setConfigHash(result.hash);

      // Extract agent-specific tool config
      const agentEntry = cfg?.agents?.list?.find((a) => a.id === agentId);
      const agentTools = agentEntry?.tools ?? {};
      const globalTools = cfg?.tools ?? {};
      const profile = agentTools.profile ?? globalTools.profile ?? "full";
      const alsoAllow = agentTools.alsoAllow ?? [];
      const deny = agentTools.deny ?? [];

      setLocalProfile(profile);
      setLocalAlsoAllow([...alsoAllow]);
      setLocalDeny([...deny]);
      setDirty(false);
    } catch (err) {
      console.error("Failed to load config:", err);
    } finally {
      setLoading(false);
    }
  }, [agentId, rpc]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const hasExplicitAllow = useMemo(() => {
    if (!config) return false;
    const agentEntry = config.agents?.list?.find((a) => a.id === agentId);
    return Array.isArray(agentEntry?.tools?.allow) && agentEntry.tools.allow.length > 0;
  }, [config, agentId]);

  const enabledCount = useMemo(() => {
    return ALL_TOOL_IDS.filter((id) =>
      isAllowedByProfile(id, localProfile, localAlsoAllow, localDeny)
    ).length;
  }, [localProfile, localAlsoAllow, localDeny]);

  const toggleTool = (toolId: string, enabled: boolean) => {
    const profileAllow = PROFILE_ALLOW[localProfile] ?? ALL_TOOL_IDS;
    const baseAllowed = profileAllow.includes(toolId);

    const nextAlsoAllow = new Set(localAlsoAllow);
    const nextDeny = new Set(localDeny);

    if (enabled) {
      nextDeny.delete(toolId);
      if (!baseAllowed) nextAlsoAllow.add(toolId);
    } else {
      nextAlsoAllow.delete(toolId);
      nextDeny.add(toolId);
    }

    setLocalAlsoAllow([...nextAlsoAllow]);
    setLocalDeny([...nextDeny]);
    setDirty(true);
  };

  const setProfile = (profileId: string) => {
    setLocalProfile(profileId);
    setLocalAlsoAllow([]);
    setLocalDeny([]);
    setDirty(true);
  };

  const enableAll = () => {
    setLocalAlsoAllow([...ALL_TOOL_IDS]);
    setLocalDeny([]);
    setDirty(true);
  };

  const disableAll = () => {
    setLocalAlsoAllow([]);
    setLocalDeny([...ALL_TOOL_IDS]);
    setDirty(true);
  };

  const saveConfig = async () => {
    if (!config) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      // Parse the raw config, update the agent's tools section, serialize back
      const parsed = JSON.parse(configRaw);
      if (!parsed.agents) parsed.agents = {};
      if (!Array.isArray(parsed.agents.list)) parsed.agents.list = [];

      let agentEntry = parsed.agents.list.find((a: { id: string }) => a.id === agentId);
      if (!agentEntry) {
        agentEntry = { id: agentId };
        parsed.agents.list.push(agentEntry);
      }
      if (!agentEntry.tools) agentEntry.tools = {};

      agentEntry.tools.profile = localProfile;
      agentEntry.tools.alsoAllow = localAlsoAllow.length > 0 ? localAlsoAllow : undefined;
      agentEntry.tools.deny = localDeny.length > 0 ? localDeny : undefined;

      // Clean up empty tools object
      if (!agentEntry.tools.profile && !agentEntry.tools.alsoAllow && !agentEntry.tools.deny && !agentEntry.tools.allow) {
        delete agentEntry.tools;
      }

      const newRaw = JSON.stringify(parsed, null, 2);
      await rpc("config.set", { raw: newRaw, baseHash: configHash });
      setSaveMessage("SAVED");
      setTimeout(() => setSaveMessage(null), 2000);
      await loadConfig();
    } catch (err) {
      setSaveMessage(`ERROR: ${String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="font-mono text-sm uppercase tracking-[0.15em] text-fg">
        LOADING TOOLS...
      </div>
    );
  }

  if (!config) {
    return (
      <div className="border border-border-solid p-6 text-center">
        <p className="font-mono text-sm uppercase tracking-[0.15em] text-fg">
          FAILED TO LOAD CONFIG
        </p>
        <button
          onClick={loadConfig}
          className="mt-3 border border-border-solid px-4 py-1.5 font-mono text-xs uppercase tracking-wider text-fg hover:bg-active transition-all"
        >
          RETRY
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-bold uppercase tracking-wide text-fg">TOOLS</h3>
          <span className="font-mono text-xs text-fg-faint">
            {enabledCount}/{ALL_TOOL_IDS.length} ENABLED
          </span>
          {dirty && (
            <span className="bg-accent text-accent-fg px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider">
              UNSAVED
            </span>
          )}
          {saveMessage && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-fg-faint">
              {saveMessage}
            </span>
          )}
        </div>
        <div className="flex gap-1">
          <button
            onClick={enableAll}
            disabled={hasExplicitAllow}
            className="border border-border-solid px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-fg hover:bg-active transition-all disabled:opacity-30"
          >
            ALL ON
          </button>
          <button
            onClick={disableAll}
            disabled={hasExplicitAllow}
            className="border border-border-solid px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-fg hover:bg-active transition-all disabled:opacity-30"
          >
            ALL OFF
          </button>
          <button
            onClick={loadConfig}
            className="border border-border-solid px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-fg hover:bg-active transition-all"
          >
            RELOAD
          </button>
          <button
            onClick={saveConfig}
            disabled={!dirty || saving}
            className="bg-accent px-4 py-1.5 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg hover:bg-accent-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          >
            {saving ? "SAVING..." : "SAVE"}
          </button>
        </div>
      </div>

      {/* Explicit allow warning */}
      {hasExplicitAllow && (
        <div className="mb-4 border border-border-solid p-3">
          <p className="font-mono text-xs uppercase tracking-wider text-fg">
            THIS AGENT USES AN EXPLICIT ALLOWLIST. MANAGE TOOLS IN THE CONFIG TAB.
          </p>
        </div>
      )}

      {/* Profile presets */}
      <div className="mb-5">
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-fg-faint">
          PROFILE PRESET
        </p>
        <div className="flex gap-1">
          {PROFILES.map((p) => (
            <button
              key={p.id}
              onClick={() => setProfile(p.id)}
              disabled={hasExplicitAllow}
              className={`px-4 py-1.5 font-mono text-xs uppercase tracking-wider transition-all disabled:opacity-30 ${
                localProfile === p.id
                  ? "bg-accent text-accent-fg font-bold"
                  : "border border-border-solid text-fg hover:bg-active"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tool grid by section */}
      <div className="space-y-4">
        {TOOL_SECTIONS.map((section) => (
          <div key={section.id} className="border border-border-solid">
            <div className="border-b border-border-solid px-3 py-2 bg-surface-alt">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-fg">
                {section.label}
              </span>
            </div>
            <div>
              {section.tools.map((tool) => {
                const allowed = isAllowedByProfile(tool.id, localProfile, localAlsoAllow, localDeny);
                return (
                  <div
                    key={tool.id}
                    className="flex items-center justify-between px-3 py-2.5 border-b border-border-muted last:border-b-0"
                  >
                    <div>
                      <span className="font-mono text-xs font-bold uppercase tracking-wide text-fg">
                        {tool.label}
                      </span>
                      <span className="ml-3 font-mono text-[11px] text-fg-faint">
                        {tool.description}
                      </span>
                    </div>
                    <button
                      onClick={() => toggleTool(tool.id, !allowed)}
                      disabled={hasExplicitAllow}
                      className={`shrink-0 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                        allowed
                          ? "bg-accent text-accent-fg"
                          : "border border-border-solid text-fg hover:bg-active"
                      }`}
                    >
                      {allowed ? "[ON]" : "[OFF]"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
