"use client";

import { useGatewayStore } from "@/lib/stores/gateway-store";
import { useEffect, useState } from "react";
import type { CronJob } from "@/lib/gateway/types";

export function AgentCron({ agentId }: { agentId: string }) {
  const rpc = useGatewayStore((s) => s.rpc);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCron, setNewCron] = useState("0 * * * *");
  const [newMessage, setNewMessage] = useState("");

  const fetchCron = async () => {
    setLoading(true);
    try {
      const result = await rpc<{ jobs: CronJob[] }>("cron.list");
      setJobs(result.jobs.filter((j) => j.agentId === agentId));
    } catch (err) {
      console.error("Failed to load cron:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCron();
  }, [agentId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreate = async () => {
    try {
      await rpc("cron.add", {
        agentId,
        label: newLabel.trim() || undefined,
        schedule: { cron: newCron.trim() },
        payload: { message: newMessage.trim() },
      });
      setShowCreate(false);
      setNewLabel("");
      setNewCron("0 * * * *");
      setNewMessage("");
      await fetchCron();
    } catch (err) {
      alert(String(err));
    }
  };

  const handleRun = async (jobId: string) => {
    try {
      await rpc("cron.run", { jobId, mode: "now" });
    } catch (err) {
      alert(String(err));
    }
  };

  const handleRemove = async (jobId: string) => {
    if (!confirm("Remove this cron job?")) return;
    try {
      await rpc("cron.remove", { jobId });
      await fetchCron();
    } catch (err) {
      alert(String(err));
    }
  };

  const handleToggle = async (jobId: string, enabled: boolean) => {
    try {
      await rpc("cron.update", { jobId, enabled });
      setJobs((prev) =>
        prev.map((j) => (j.id === jobId ? { ...j, enabled } : j))
      );
    } catch (err) {
      alert(String(err));
      await fetchCron();
    }
  };

  if (loading) {
    return <div className="font-mono text-xs uppercase tracking-[0.2em] text-fg-dim">LOADING CRON JOBS...</div>;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-fg">CRON JOBS</h3>
        <div className="flex gap-2">
          <button
            onClick={fetchCron}
            className="border border-border-interactive px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg hover:border-border-hover transition-all"
          >
            REFRESH
          </button>
          <button
            onClick={() => setShowCreate(true)}
            className="bg-accent px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-accent-fg"
          >
            + ADD JOB
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="mb-4 border border-border-default p-4">
          <h4 className="mb-3 font-mono text-[10px] tracking-[0.15em] uppercase text-fg">NEW CRON JOB</h4>
          <div className="h-px bg-divider-dim mb-3" />
          <div className="space-y-2">
            <input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="LABEL (OPTIONAL)"
              className="w-full border border-border-interactive bg-surface px-3 py-2 font-mono text-xs text-fg focus:outline-none focus:border-border-focus"
            />
            <input
              type="text"
              value={newCron}
              onChange={(e) => setNewCron(e.target.value)}
              placeholder="0 * * * *"
              className="w-full border border-border-interactive bg-surface px-3 py-2 font-mono text-xs text-fg focus:outline-none focus:border-border-focus"
            />
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="MESSAGE TO SEND..."
              rows={2}
              className="w-full border border-border-interactive bg-surface px-3 py-2 font-mono text-xs text-fg focus:outline-none focus:border-border-focus resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                className="bg-accent px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-accent-fg"
              >
                CREATE
              </button>
              <button
                onClick={() => setShowCreate(false)}
                className="border border-border-interactive px-4 py-2 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg transition-all"
              >
                CANCEL
              </button>
            </div>
          </div>
        </div>
      )}

      {jobs.length === 0 ? (
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-dim">NO CRON JOBS FOR THIS AGENT</p>
      ) : (
        <div className="space-y-2">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="flex items-center justify-between border border-border-default p-3 hover:border-border-active transition-all"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs">
                    {job.enabled ? "●" : "○"}
                  </span>
                  <span className="font-mono text-xs uppercase tracking-wide text-fg">
                    {job.label || job.id}
                  </span>
                  {!job.enabled && (
                    <span className="border border-border-interactive px-1.5 py-0.5 font-mono text-[8px] text-fg-dim uppercase tracking-wider">
                      DISABLED
                    </span>
                  )}
                </div>
                <p className="mt-1 ml-4 font-mono text-[10px] text-fg-dim">
                  {job.schedule.cron || job.schedule.interval || job.schedule.at || "—"}
                </p>
                {job.state?.nextRunAt && (
                  <p className="ml-4 font-mono text-[10px] text-fg-ghost">
                    NEXT: {new Date(job.state.nextRunAt).toLocaleString()}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleRun(job.id)}
                  className="border border-border-default px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-fg-dim hover:text-fg hover:border-border-active transition-all"
                >
                  RUN NOW
                </button>
                <button
                  onClick={() => handleToggle(job.id, !job.enabled)}
                  className={`px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wider transition-all ${
                    job.enabled
                      ? "bg-accent text-accent-fg"
                      : "border border-border-interactive text-fg-muted"
                  }`}
                >
                  {job.enabled ? "[ON]" : "[OFF]"}
                </button>
                <button
                  onClick={() => handleRemove(job.id)}
                  className="border border-border-default px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-fg-dim hover:text-fg transition-all"
                >
                  REMOVE
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
