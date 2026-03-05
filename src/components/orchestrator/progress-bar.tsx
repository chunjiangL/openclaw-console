"use client";

export function ProgressBar({
  percent,
  width = 10,
}: {
  percent: number;
  width?: number;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const filled = Math.round((clamped / 100) * width);
  const empty = width - filled;
  return (
    <span className="font-mono text-[10px] text-fg-dim">
      [<span className="text-fg">{"\u2593".repeat(filled)}</span>
      <span className="text-fg-ghost">{"\u2591".repeat(empty)}</span>]
      {" "}{clamped}%
    </span>
  );
}
