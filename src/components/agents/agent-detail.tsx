"use client";

import { useGatewayStore } from "@/lib/stores/gateway-store";
import { useRouter } from "@/lib/router";
import { AgentSessions } from "./agent-sessions";
import { AgentFiles } from "./agent-files";
import { AgentSkills } from "./agent-skills";
import { AgentChannels } from "./agent-channels";
import { AgentCron } from "./agent-cron";
import { AgentOverview } from "./agent-overview";
import { AgentTools } from "./agent-tools";

const TABS = [
  { key: "overview", label: "OVERVIEW" },
  { key: "sessions", label: "SESSIONS" },
  { key: "files", label: "FILES" },
  { key: "tools", label: "TOOLS" },
  { key: "skills", label: "SKILLS" },
  { key: "channels", label: "CHANNELS" },
  { key: "cron", label: "CRON" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function AgentDetail() {
  const { params, navigate } = useRouter();
  const agents = useGatewayStore((s) => s.agents);
  const agentId = params.agentId;
  const tab = (params.tab as TabKey) || "overview";

  const agent = agents.find((a) => a.agentId === agentId);

  if (!agent) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-dim">AGENT NOT FOUND</p>
      </div>
    );
  }

  return (
    <div>
      {/* Agent Header */}
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={() => navigate("/")}
          className="border border-border-interactive px-2 py-1 font-mono text-xs text-fg-muted hover:text-fg hover:border-border-hover transition-all"
        >
          {"<"} BACK
        </button>
        <div className="w-px h-6 bg-border-default" />
        <span className="font-mono text-[10px] text-fg-dim uppercase tracking-wider">AG</span>
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-fg">{agent.name}</h2>
          <p className="font-mono text-[10px] text-fg-dim">{agent.agentId}</p>
        </div>
        {/* Indicator */}
        <span className="ml-2 font-mono text-xs text-fg">{"●"}</span>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex gap-1 border-b border-border-muted pb-px">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() =>
              navigate(
                t.key === "overview"
                  ? `/agents/${agentId}`
                  : `/agents/${agentId}/${t.key}`
              )
            }
            className={`px-3 py-2 font-mono text-[11px] uppercase tracking-[0.1em] transition-all ${
              tab === t.key
                ? "bg-accent text-accent-fg font-bold"
                : "text-fg-muted hover:text-fg hover:bg-hover"
            }`}
          >
            {tab === t.key ? `[${t.label}]` : t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "overview" && <AgentOverview agentId={agentId!} />}
      {tab === "sessions" && <AgentSessions agentId={agentId!} />}
      {tab === "files" && <AgentFiles agentId={agentId!} />}
      {tab === "tools" && <AgentTools agentId={agentId!} />}
      {tab === "skills" && <AgentSkills agentId={agentId!} />}
      {tab === "channels" && <AgentChannels />}
      {tab === "cron" && <AgentCron agentId={agentId!} />}
    </div>
  );
}
