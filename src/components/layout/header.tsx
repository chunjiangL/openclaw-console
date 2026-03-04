"use client";

import { useGatewayStore } from "@/lib/stores/gateway-store";
import { useState, useRef, useEffect } from "react";
import { useTheme } from "next-themes";
import { ConnectionDialog } from "./connection-dialog";
import { THEMES } from "./theme-provider";

const stateConfig: Record<string, { indicator: string; label: string; dim?: boolean }> = {
  connected: { indicator: "●", label: "ONLINE" },
  connecting: { indicator: "○", label: "CONNECTING", dim: true },
  handshake: { indicator: "○", label: "HANDSHAKE", dim: true },
  disconnected: { indicator: "○", label: "OFFLINE", dim: true },
};

export function Header() {
  const connectionState = useGatewayStore((s) => s.connectionState);
  const gatewayUrl = useGatewayStore((s) => s.gatewayUrl);
  const lastError = useGatewayStore((s) => s.lastError);
  const disconnect = useGatewayStore((s) => s.disconnect);
  const [showSettings, setShowSettings] = useState(false);
  const { theme, setTheme } = useTheme();
  const [themeMounted, setThemeMounted] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const themeRef = useRef<HTMLDivElement>(null);

  // Hydration guard for theme button
  useState(() => {
    setThemeMounted(true);
  });

  // Close dropdown on outside click
  useEffect(() => {
    if (!themeOpen) return;
    const handler = (e: MouseEvent) => {
      if (themeRef.current && !themeRef.current.contains(e.target as Node)) {
        setThemeOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [themeOpen]);

  const state = stateConfig[connectionState] ?? stateConfig.disconnected;
  const currentLabel = THEMES.find((t) => t.key === theme)?.label ?? "THEME";

  return (
    <>
      <header className="flex h-10 shrink-0 items-center justify-between border-b border-border-default bg-surface px-4">
        {/* Left: status bar items */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] tracking-wider text-fg-muted">SYS</span>
            <span className={`font-mono text-xs ${state.dim ? "text-fg-dim" : "text-fg"}`}>
              {state.indicator}
            </span>
            <span className={`font-mono text-[10px] tracking-[0.15em] uppercase ${state.dim ? "text-fg-dim" : "text-fg"}`}>
              {state.label}
            </span>
          </div>

          {gatewayUrl && (
            <>
              <div className="w-px h-4 bg-border-default" />
              <span className="font-mono text-[10px] text-fg-dim">
                {gatewayUrl.replace(/^https?:\/\//, "")}
              </span>
            </>
          )}

          {lastError && connectionState === "disconnected" && (
            <>
              <div className="w-px h-4 bg-divider" />
              <span className="font-mono text-[10px] text-fg-subtle max-w-[300px] truncate" title={lastError}>
                [ERR] {lastError}
              </span>
            </>
          )}
        </div>

        {/* Right: actions */}
        <div className="flex items-center gap-3">
          <div ref={themeRef} className="relative">
            <button
              onClick={() => setThemeOpen((v) => !v)}
              className="border border-border-interactive px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:bg-active hover:text-fg transition-all"
            >
              {themeMounted ? `[${currentLabel}]` : "[···]"}
            </button>
            {themeOpen && (
              <div className="absolute right-0 top-full mt-1 z-50 border border-border-interactive bg-surface min-w-[120px]">
                {THEMES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => { setTheme(t.key); setThemeOpen(false); }}
                    className={`block w-full px-3 py-1.5 text-left font-mono text-[10px] uppercase tracking-wider transition-all ${
                      theme === t.key
                        ? "bg-active text-fg"
                        : "text-fg-muted hover:bg-hover hover:text-fg"
                    }`}
                  >
                    {theme === t.key ? "● " : "○ "}{t.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="border border-border-interactive px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-subtle hover:bg-active hover:text-fg transition-all"
          >
            [CONFIG]
          </button>
          {connectionState !== "disconnected" && (
            <button
              onClick={disconnect}
              className="border border-border-interactive px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-dim hover:bg-active hover:text-fg transition-all"
            >
              [DISCONNECT]
            </button>
          )}
        </div>
      </header>
      {showSettings && (
        <ConnectionDialog onClose={() => setShowSettings(false)} />
      )}
    </>
  );
}
