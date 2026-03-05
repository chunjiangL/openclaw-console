"use client";

import {
  useOrchestratorStore,
  type TaskStatus,
  type OrchestratorTask,
} from "@/lib/stores/orchestrator-store";
import { ProgressBar } from "./progress-bar";

function statusIcon(status: TaskStatus): string {
  switch (status) {
    case "done":
      return "\u25CF"; // ●
    case "in_progress":
      return "\u25D0"; // ◐
    case "pending":
      return "\u25CB"; // ○
    case "blocked":
      return "\u25CB"; // ○
  }
}

function statusColor(status: TaskStatus): string {
  switch (status) {
    case "done":
      return "text-fg";
    case "in_progress":
      return "text-fg-subtle";
    case "pending":
      return "text-fg-dim";
    case "blocked":
      return "text-fg-ghost";
  }
}

function badgeStyle(status: TaskStatus): string {
  switch (status) {
    case "done":
      return "border-border-solid text-fg";
    case "in_progress":
      return "border-border-interactive text-fg-subtle";
    case "blocked":
      return "border-border-muted text-fg-ghost";
    default:
      return "border-border-muted text-fg-dim";
  }
}

function badgeLabel(status: TaskStatus): string {
  return status === "in_progress" ? "IN PROG" : status.toUpperCase();
}

export function TaskPanel() {
  const phase = useOrchestratorStore((s) => s.phase);
  const parsedTasks = useOrchestratorStore((s) => s.parsedTasks);
  const approvedTasks = useOrchestratorStore((s) => s.approvedTasks);
  const expandedTaskIds = useOrchestratorStore((s) => s.expandedTaskIds);
  const toggleTaskExpand = useOrchestratorStore((s) => s.toggleTaskExpand);

  // Show approved tasks during execution, parsed tasks during planning/approval
  const tasks: OrchestratorTask[] =
    approvedTasks.length > 0 ? approvedTasks : parsedTasks;

  const doneCount = tasks.filter((t: OrchestratorTask) => t.status === "done").length;
  const overallPercent = tasks.length
    ? Math.round((doneCount / tasks.length) * 100)
    : 0;

  return (
    <div className="border border-border-default">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border-default px-4 py-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-fg-muted">
          {"\u2593"} TASK BREAKDOWN
        </span>
        <div className="flex items-center gap-3">
          {phase === "awaiting_approval" && (
            <span className="font-mono text-[9px] uppercase tracking-wider text-fg-subtle">
              AWAITING APPROVAL
            </span>
          )}
          <ProgressBar percent={overallPercent} />
        </div>
      </div>

      {/* Rows */}
      {tasks.map((task: OrchestratorTask) => {
        const isExpanded = expandedTaskIds.has(task.id);

        return (
          <div
            key={task.id}
            className="border-b border-border-muted last:border-b-0"
          >
            <button
              onClick={() => toggleTaskExpand(task.id)}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-hover transition-all"
            >
              {/* Status icon */}
              <span
                className={`font-mono text-xs shrink-0 ${statusColor(task.status)}`}
              >
                {statusIcon(task.status)}
              </span>

              {/* Title */}
              <span className="flex-1 font-mono text-xs uppercase tracking-wider text-fg truncate min-w-0">
                {task.title}
              </span>

              {/* Worker */}
              <span className="hidden sm:inline font-mono text-[10px] text-fg-dim uppercase tracking-wider shrink-0">
                {task.assignedWorker || "\u2014"}
              </span>

              {/* Branch */}
              {task.branch && (
                <span className="hidden md:inline font-mono text-[10px] text-fg-ghost shrink-0">
                  {task.branch}
                </span>
              )}

              {/* Badge */}
              <span
                className={`border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider shrink-0 ${badgeStyle(task.status)}`}
              >
                {badgeLabel(task.status)}
              </span>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-border-muted px-4 py-3">
                <p className="font-mono text-xs text-fg-dim mb-2">
                  {task.description}
                </p>

                {task.dependencies.length > 0 && (
                  <div className="font-mono text-[10px] text-fg-ghost uppercase tracking-wider mb-1">
                    DEPENDS ON:{" "}
                    {task.dependencies
                      .map((depId: string) => {
                        const dep = tasks.find((t: OrchestratorTask) => t.id === depId);
                        return dep ? dep.title : depId;
                      })
                      .join(", ")}
                  </div>
                )}

                {task.prNumber && (
                  <div className="font-mono text-[10px] text-fg-dim uppercase tracking-wider">
                    PR #{task.prNumber}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {tasks.length === 0 && (
        <div className="px-4 py-6 text-center font-mono text-[10px] uppercase tracking-wider text-fg-ghost">
          NO TASKS
        </div>
      )}
    </div>
  );
}
