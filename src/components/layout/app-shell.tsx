"use client";

import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { ConnectionDialog } from "./connection-dialog";
import { useGatewayStore } from "@/lib/stores/gateway-store";
import { useGroupStore } from "@/lib/stores/group-store";

// Auto-connect: detect gateway URL from current page origin
function resolveGatewayUrlSync(): string | null {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem("claw-console:url");
  if (saved) return saved;
  const host = window.location.hostname;
  const proto = window.location.protocol === "https:" ? "https" : "http";
  if (host === "localhost" || host === "127.0.0.1") {
    return `${proto}://${host}:18789`;
  }
  // Tailscale hostname (*.ts.net) — gateway proxied via tailscale serve
  if (host.endsWith(".ts.net")) {
    return `https://${host}`;
  }
  // Tailscale IP or other — needs server-side discovery
  return null;
}

async function resolveGatewayUrl(): Promise<string> {
  const sync = resolveGatewayUrlSync();
  if (sync) return sync;

  // Ask the server to discover the gateway URL (e.g. via tailscale status)
  try {
    const res = await fetch("/api/gateway-info");
    if (res.ok) {
      const data = await res.json();
      if (data.url) return data.url;
    }
  } catch {
    // Server unreachable — fall through
  }
  return "";
}

function resolveGatewayToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("claw-console:token") ?? "";
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const connectionState = useGatewayStore((s) => s.connectionState);
  const connect = useGatewayStore((s) => s.connect);
  const loadGroups = useGroupStore((s) => s.loadGroups);
  const startedRef = useRef(false);
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadGroups();
  }, [loadGroups]);

  // Auto-connect on mount, or show connection dialog if no URL resolved
  useEffect(() => {
    if (!mounted || startedRef.current) return;
    startedRef.current = true;

    resolveGatewayUrl().then((url) => {
      const token = resolveGatewayToken();
      if (url && token) {
        // Both URL and token saved — auto-connect
        connect(url, token);
      } else {
        // Missing URL or token — show dialog so user can fill in
        setShowSettings(true);
      }
    });
  }, [mounted, connect]);

  if (!mounted) {
    return (
      <div className="flex h-screen items-center justify-center bg-surface">
        <div className="text-center">
          <p className="font-mono text-sm uppercase tracking-[0.2em] text-fg">
            INITIALIZING...
          </p>
          <div className="mt-3 font-mono text-xs text-fg-dim tracking-widest">
            {"▓▓▓░░░░░"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface">
      {/* Desktop sidebar — always visible */}
      <div className="hidden md:flex">
        <Sidebar onNavigate={() => {}} />
      </div>

      {/* Mobile sidebar — overlay drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div className="absolute inset-0 bg-overlay" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-50 w-64 shrink-0">
            <Sidebar onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          onMenuToggle={() => setSidebarOpen((v) => !v)}
          onConfigOpen={() => setShowSettings(true)}
        />
        <main className="flex-1 overflow-auto p-3 md:p-6">{children}</main>
      </div>
      {showSettings && <ConnectionDialog onClose={() => setShowSettings(false)} />}
      {/* Scanline overlay */}
      <div
        className="pointer-events-none fixed inset-0 z-[100]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 4px, var(--scanline) 4px, var(--scanline) 5px)",
        }}
      />
    </div>
  );
}
