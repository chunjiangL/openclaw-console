"use client";

import { useState, useEffect } from "react";
import { useGatewayStore } from "@/lib/stores/gateway-store";

export function ConnectionDialog({ onClose }: { onClose?: () => void }) {
  const connect = useGatewayStore((s) => s.connect);
  const connectionState = useGatewayStore((s) => s.connectionState);

  const [url, setUrl] = useState(() => {
    const saved = localStorage.getItem("claw-console:url");
    if (saved) return saved;
    const host = typeof window !== "undefined" ? window.location.hostname : "";
    if (host === "localhost" || host === "127.0.0.1") return "http://localhost:18789";
    if (host.endsWith(".ts.net")) return `https://${host}`;
    return "";
  });

  // If URL is empty, try server-side discovery
  useEffect(() => {
    if (url) return;
    fetch("/api/gateway-info")
      .then((res) => res.json())
      .then((data) => {
        if (data.url) setUrl(data.url);
      })
      .catch(() => {});
  }, []);
  const [token, setToken] = useState(
    () => localStorage.getItem("claw-console:token") || ""
  );

  const handleConnect = () => {
    connect(url, token.trim());
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4">
      <div className="w-full max-w-md border border-border-interactive bg-surface p-4 sm:p-6 relative max-h-[90vh] overflow-y-auto">
        {/* Unicode box-drawing corners */}
        <span className="absolute top-1 left-2 font-mono text-fg-ghost text-xs">{"╔"}</span>
        <span className="absolute top-1 right-2 font-mono text-fg-ghost text-xs">{"╗"}</span>
        <span className="absolute bottom-1 left-2 font-mono text-fg-ghost text-xs">{"╚"}</span>
        <span className="absolute bottom-1 right-2 font-mono text-fg-ghost text-xs">{"╝"}</span>

        {/* Title */}
        <h2 className="mb-1 text-sm font-bold uppercase tracking-[0.15em] text-fg">
          GATEWAY CONNECTION
        </h2>
        <div className="h-px bg-divider mb-5" />

        <div className="space-y-4">
          <div>
            <label className="mb-1 block font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted">
              GATEWAY URL
            </label>
            <div data-focus-container className="flex items-center border border-border-interactive bg-surface focus-within:border-border-focus transition-colors">
              <span className="pl-3 font-mono text-[10px] text-fg-ghost">&gt;</span>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="http://localhost:18789"
                className="w-full bg-transparent px-2 py-2.5 font-mono text-sm text-fg focus:outline-none"
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block font-mono text-[10px] tracking-[0.2em] uppercase text-fg-muted">
              AUTH TOKEN
            </label>
            <div data-focus-container className="flex items-center border border-border-interactive bg-surface focus-within:border-border-focus transition-colors">
              <span className="pl-3 font-mono text-[10px] text-fg-ghost">&gt;</span>
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="PASTE TOKEN HERE"
                autoComplete="off"
                className="w-full bg-transparent px-2 py-2.5 font-mono text-sm text-fg focus:outline-none"
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end pt-2">
            {onClose && (
              <button
                onClick={onClose}
                className="border border-border-interactive px-5 py-2 font-mono text-xs uppercase tracking-wider text-fg-muted hover:bg-active hover:text-fg transition-all"
              >
                CANCEL
              </button>
            )}
            <button
              onClick={handleConnect}
              disabled={!url || connectionState === "connecting"}
              className="bg-accent px-5 py-2 font-mono text-xs font-bold uppercase tracking-wider text-accent-fg hover:bg-accent-hover transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {connectionState === "connecting" ? "CONNECTING..." : "CONNECT"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
