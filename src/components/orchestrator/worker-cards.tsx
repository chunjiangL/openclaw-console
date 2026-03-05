"use client";

import {
  useOrchestratorStore,
  type OrchestratorTask,
} from "@/lib/stores/orchestrator-store";

export function WorkerCards() {
  const approvedTasks = useOrchestratorStore((s) => s.approvedTasks);
  const session = useOrchestratorStore((s) => s.session);

  // Group tasks by assigned worker
  const workerMap = new Map<string, OrchestratorTask[]>();
  for (const task of approvedTasks) {
    const worker = task.assignedWorker || "unassigned";
    const existing = workerMap.get(worker) ?? [];
    existing.push(task);
    workerMap.set(worker, existing);
  }

  const workers = Array.from(workerMap.entries()).map(([agentId, tasks]) => ({
    agentId,
    tasks,
    doneCount: tasks.filter((t) => t.status === "done").length,
    inProgress: tasks.some((t) => t.status === "in_progress"),
  }));

  return (
    <div>
      <div className="mb-2 flex items-center px-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-fg-muted">
          {"\u2593"} WORKERS
        </span>
        <span className="ml-auto font-mono text-[10px] text-fg-dim">
          {session.workerAgentIds.length}
        </span>
      </div>

      <div className="space-y-2">
        {workers.map((worker) => (
          <div
            key={worker.agentId}
            className="border border-border-default p-3 hover:border-border-hover transition-all"
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs">
                  {worker.inProgress ? "\u25D0" : worker.doneCount === worker.tasks.length ? "\u25CF" : "\u25CB"}
                </span>
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-fg">
                  {worker.agentId}
                </span>
              </div>
              <span className="font-mono text-[9px] text-fg-dim">
                {worker.doneCount}/{worker.tasks.length}
              </span>
            </div>

            {/* Task list */}
            {worker.tasks.map((task) => (
              <div
                key={task.id}
                className="mb-1 font-mono text-[10px] uppercase tracking-wider text-fg-dim truncate"
              >
                {task.status === "done"
                  ? "\u25CF"
                  : task.status === "in_progress"
                    ? "\u25D0"
                    : "\u25CB"}{" "}
                {task.title}
                {task.branch && (
                  <span className="text-fg-ghost ml-2">{task.branch}</span>
                )}
              </div>
            ))}
          </div>
        ))}

        {workers.length === 0 && (
          <div className="border border-border-default p-4 text-center font-mono text-[10px] uppercase tracking-wider text-fg-ghost">
            NO WORKERS ACTIVE
          </div>
        )}
      </div>
    </div>
  );
}
