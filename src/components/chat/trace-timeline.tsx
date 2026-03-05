"use client";

import { useState } from "react";
import { useTraceStore } from "@/lib/stores/trace-store";
import { formatElapsed, type TraceEntry } from "./trace-utils";

type TraceTimelineProps = {
  agentId: string;
};

export function TraceTimeline({ agentId }: TraceTimelineProps) {
  const trace = useTraceStore((s) => s.traces.get(agentId));
  const entries = trace?.entries ?? [];

  if (entries.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-fg-ghost">
          NO TRACE DATA -- SEND A MESSAGE TO START
        </p>
      </div>
    );
  }

  // Compute total run duration
  const firstTs = entries[0]?.ts;
  const lastTs = entries[entries.length - 1]?.ts;
  const totalDuration = firstTs && lastTs ? formatElapsed(firstTs, lastTs) : null;

  return (
    <div>
      {/* Run summary header */}
      <div className="mb-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-fg-dim">
        <span>RUN: {trace?.currentRunId?.slice(0, 8)}</span>
        {totalDuration && (
          <>
            <span className="text-fg-ghost">|</span>
            <span>DURATION: {totalDuration}</span>
          </>
        )}
        <span className="text-fg-ghost">|</span>
        <span>{entries.length} EVENTS</span>
      </div>

      <div className="space-y-0">
        {entries.map((entry, idx) => {
          const prev = idx > 0 ? entries[idx - 1] : null;
          const elapsed = prev ? formatElapsed(prev.ts, entry.ts) : null;
          return (
            <TraceRow key={entry.id} entry={entry} elapsed={elapsed} />
          );
        })}
      </div>
    </div>
  );
}

/** Extract inline preview text from entry detail based on stream type. */
function getInlinePreview(entry: TraceEntry): string | null {
  const data = entry.detail as Record<string, unknown> | null;
  if (!data) return null;

  switch (entry.stream) {
    case "tool": {
      if (entry.phase === "start") {
        // Show key args
        const args = data.args as Record<string, unknown> | undefined;
        if (!args || Object.keys(args).length === 0) return null;
        const pairs = Object.entries(args)
          .slice(0, 3)
          .map(([k, v]) => {
            const val = typeof v === "string" ? v : JSON.stringify(v);
            return `${k}=${trunc(val, 40)}`;
          });
        return pairs.join(", ");
      }
      if (entry.phase === "result" || entry.phase === "end") {
        // Show result preview or error
        if (data.isError) {
          const result = data.result;
          return `ERROR: ${trunc(String(result ?? "unknown"), 80)}`;
        }
        const result = data.result;
        if (result == null) return "(no result data)";
        const str = typeof result === "string" ? result : JSON.stringify(result);
        return trunc(str, 120);
      }
      if (entry.phase === "update") {
        const partial = data.partialResult;
        if (partial == null) return null;
        const str = typeof partial === "string" ? partial : JSON.stringify(partial);
        return trunc(str, 80);
      }
      return null;
    }
    case "thinking": {
      const text = (data.text as string) ?? (data.delta as string);
      if (!text) return null;
      return trunc(text, 120);
    }
    case "assistant": {
      const text = data.text as string;
      if (!text) return null;
      return trunc(text, 80);
    }
    case "lifecycle": {
      const parts: string[] = [];
      if (data.stopReason) parts.push(`stop: ${data.stopReason}`);
      if (data.error) parts.push(`${trunc(String(data.error), 60)}`);
      if (data.aborted) parts.push("aborted");
      return parts.length > 0 ? parts.join(" | ") : null;
    }
    case "compaction": {
      if (data.willRetry) return "will retry";
      return null;
    }
    default:
      return null;
  }
}

function trunc(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "..." : s;
}

function TraceRow({
  entry,
  elapsed,
}: {
  entry: TraceEntry;
  elapsed: string | null;
}) {
  const [expanded, setExpanded] = useState(false);

  const streamIcon = (() => {
    switch (entry.stream) {
      case "lifecycle":
        return entry.phase === "start" ? ">" : entry.phase === "error" ? "!" : ".";
      case "tool":
        return entry.phase === "start" ? "#" : entry.phase === "result" || entry.phase === "end" ? "=" : "~";
      case "assistant": return "*";
      case "thinking": return "?";
      case "compaction": return "%";
      case "error": return "!";
      default: return "-";
    }
  })();

  const streamColor = (() => {
    switch (entry.stream) {
      case "tool":
        if (entry.phase === "start") return "text-fg";
        if ((entry.detail as Record<string, unknown>)?.isError) return "text-fg-subtle";
        return "text-fg-faint";
      case "lifecycle":
        return entry.phase === "error" ? "text-fg-subtle" : "text-fg-dim";
      case "assistant":
        return "text-fg-muted";
      case "thinking":
        return "text-fg-ghost";
      case "error":
        return "text-fg-subtle";
      default:
        return "text-fg-dim";
    }
  })();

  const hasDetail =
    entry.detail != null &&
    typeof entry.detail === "object" &&
    Object.keys(entry.detail as object).length > 0;

  const inlinePreview = getInlinePreview(entry);
  const timestamp = new Date(entry.ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="border-l-2 border-border-default pl-3 py-0.5 hover:bg-hover transition-colors">
      {/* Elapsed badge */}
      {elapsed && elapsed !== "0ms" && (
        <div className="font-mono text-[8px] text-fg-ghost uppercase tracking-wider mb-0.5">
          +{elapsed}
        </div>
      )}

      {/* Main row */}
      <button
        onClick={() => hasDetail && setExpanded(!expanded)}
        disabled={!hasDetail}
        className={`flex items-start gap-2 w-full text-left ${
          hasDetail ? "cursor-pointer" : "cursor-default"
        } px-1 py-0.5`}
      >
        {/* Timestamp */}
        <span className="font-mono text-[8px] text-fg-ghost w-14 shrink-0 mt-0.5">
          {timestamp}
        </span>

        {/* Stream icon */}
        <span className={`font-mono text-[10px] ${streamColor} w-3 shrink-0`}>
          {streamIcon}
        </span>

        {/* Stream label */}
        <span
          className={`font-mono text-[9px] uppercase tracking-wider ${streamColor} w-16 shrink-0`}
        >
          {entry.stream}
        </span>

        {/* Summary + expand indicator */}
        <span className={`font-mono text-[10px] uppercase tracking-wider ${streamColor}`}>
          {entry.summary}
          {hasDetail && (
            <span className="text-fg-ghost ml-1">{expanded ? "[-]" : "[+]"}</span>
          )}
        </span>
      </button>

      {/* Inline preview — always visible for tool args, thinking text, etc. */}
      {inlinePreview && !expanded && (
        <div className="ml-[7.5rem] px-1 py-0.5">
          <p className="font-mono text-[10px] text-fg-dim break-all">
            {inlinePreview}
          </p>
        </div>
      )}

      {/* Full expanded detail */}
      {expanded && hasDetail && (
        <div className="ml-[7.5rem] mt-1 mb-2 border border-border-default bg-surface-alt p-2 overflow-x-auto">
          <pre className="font-mono text-[10px] text-fg-faint whitespace-pre-wrap break-all">
            {JSON.stringify(entry.detail, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
