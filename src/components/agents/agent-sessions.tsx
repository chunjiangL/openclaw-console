"use client";

import { useGatewayStore } from "@/lib/stores/gateway-store";
import { useEffect, useState } from "react";
import type { GatewaySessionRow, SessionsListResult } from "@/lib/gateway/types";

export function AgentSessions({ agentId }: { agentId: string }) {
  const rpc = useGatewayStore((s) => s.rpc);
  const [sessions, setSessions] = useState<GatewaySessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const result = await rpc<SessionsListResult>("sessions.list", { agentId });
      setSessions(result.sessions);
    } catch (err) {
      console.error("Failed to load sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReset = async (key: string) => {
    if (!confirm("Clear context? This archives the transcript and resets the session.")) return;
    try {
      await rpc("sessions.reset", { key });
      await fetchSessions();
    } catch (err) {
      alert(String(err));
    }
  };

  const handleCompact = async (key: string) => {
    if (!confirm("Compress context? This trims the transcript to the last 400 lines.")) return;
    try {
      await rpc("sessions.compact", { key, maxLines: 400 });
      await fetchSessions();
    } catch (err) {
      alert(String(err));
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm("Delete this session? This cannot be undone.")) return;
    try {
      await rpc("sessions.delete", { key });
      await fetchSessions();
    } catch (err) {
      alert(String(err));
    }
  };

  if (loading) {
    return <div className="font-mono text-xs uppercase tracking-[0.2em] text-fg-dim">LOADING SESSIONS...</div>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-fg">SESSIONS</h3>
        <button
          onClick={fetchSessions}
          className="border border-border-interactive px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg hover:border-border-hover transition-all"
        >
          REFRESH
        </button>
      </div>

      {sessions.length === 0 ? (
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-dim">NO SESSIONS FOUND</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-divider">
                <th className="pb-2 pr-4 text-left font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted">KEY</th>
                <th className="pb-2 pr-4 text-left font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted">LABEL</th>
                <th className="pb-2 pr-4 text-left font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted">MODEL</th>
                <th className="pb-2 pr-4 text-left font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted">TOKENS</th>
                <th className="pb-2 pr-4 text-left font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted">UPDATED</th>
                <th className="pb-2 text-left font-mono text-[10px] tracking-[0.15em] uppercase text-fg-muted">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => {
                const isRecent =
                  s.updatedAtMs && Date.now() - s.updatedAtMs < 5 * 60 * 1000;
                return (
                  <tr
                    key={s.key}
                    className="border-b border-border-muted hover:bg-hover transition-colors"
                  >
                    <td className="py-2 pr-4">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs truncate max-w-[200px] inline-block text-fg-faint">
                          {s.key}
                        </span>
                        {isRecent && (
                          <span className="font-mono text-[10px] text-fg">{"●"}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs text-fg-subtle">{s.label || "—"}</td>
                    <td className="py-2 pr-4 font-mono text-[10px] text-fg-dim">{s.model || "—"}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-fg-subtle">
                      {s.totalTokens?.toLocaleString() ?? "—"}
                    </td>
                    <td className="py-2 pr-4 font-mono text-[10px] text-fg-dim">
                      {s.updatedAt ? new Date(s.updatedAt).toLocaleString() : "—"}
                    </td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleReset(s.key)}
                          className="border border-border-default px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-fg-dim hover:text-fg hover:border-border-active transition-all"
                          title="Clear context"
                        >
                          CLEAR
                        </button>
                        <button
                          onClick={() => handleCompact(s.key)}
                          className="border border-border-default px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-fg-dim hover:text-fg hover:border-border-active transition-all"
                          title="Compress context"
                        >
                          COMPACT
                        </button>
                        <button
                          onClick={() => handleDelete(s.key)}
                          className="border border-border-default px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-fg-dim hover:text-fg hover:border-border-active transition-all"
                          title="Delete session"
                        >
                          DELETE
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
