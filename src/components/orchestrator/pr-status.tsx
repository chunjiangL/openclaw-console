"use client";

import {
  useOrchestratorStore,
  type PrStatusValue,
} from "@/lib/stores/orchestrator-store";

function prBadge(status: PrStatusValue) {
  const styles: Record<PrStatusValue, string> = {
    draft: "border border-border-muted text-fg-ghost",
    open: "border border-border-interactive text-fg-dim",
    review: "border border-border-interactive text-fg-subtle",
    merged: "bg-accent text-accent-fg border border-transparent",
    closed: "border border-border-muted text-fg-ghost",
  };
  return (
    <span
      className={`inline-block px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider ${styles[status]}`}
    >
      {status.toUpperCase()}
    </span>
  );
}

export function PrStatus() {
  const prs = useOrchestratorStore((s) => s.prs);

  return (
    <div>
      <div className="mb-2 flex items-center px-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-fg-muted">
          {"\u2593"} PULL REQUESTS
        </span>
        <span className="ml-auto font-mono text-[10px] text-fg-dim">
          {prs.length}
        </span>
      </div>

      <div className="border border-border-default">
        {/* Header */}
        <div className="flex items-center border-b border-border-default px-4 py-1.5">
          <span className="w-12 font-mono text-[9px] uppercase tracking-wider text-fg-ghost">
            #
          </span>
          <span className="flex-1 font-mono text-[9px] uppercase tracking-wider text-fg-ghost min-w-0">
            TITLE
          </span>
          <span className="w-16 font-mono text-[9px] uppercase tracking-wider text-fg-ghost text-center sm:w-20">
            STATUS
          </span>
          <span className="hidden sm:block w-20 font-mono text-[9px] uppercase tracking-wider text-fg-ghost text-right">
            BRANCH
          </span>
        </div>

        {/* Rows */}
        {prs.map((pr) => (
          <div
            key={pr.number}
            className="flex items-center border-b border-border-muted last:border-b-0 px-4 py-2 hover:bg-hover transition-all"
          >
            <span className="w-12 font-mono text-[10px] text-fg-dim">
              {pr.number}
            </span>
            <span className="flex-1 font-mono text-xs text-fg truncate min-w-0 mr-2">
              {pr.title}
            </span>
            <span className="w-16 text-center sm:w-20">
              {prBadge(pr.status)}
            </span>
            <span className="hidden sm:block w-20 font-mono text-[10px] text-fg-ghost text-right truncate">
              {pr.branch || "\u2014"}
            </span>
          </div>
        ))}

        {prs.length === 0 && (
          <div className="px-4 py-4 text-center font-mono text-[10px] uppercase tracking-wider text-fg-ghost">
            NO PULL REQUESTS
          </div>
        )}
      </div>
    </div>
  );
}
