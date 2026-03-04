"use client";

import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { ConnectionDialog } from "./connection-dialog";
import { useGatewayStore } from "@/lib/stores/gateway-store";
import { useGroupStore } from "@/lib/stores/group-store";

export function AppShell({ children }: { children: React.ReactNode }) {
  const connectionState = useGatewayStore((s) => s.connectionState);
  const connect = useGatewayStore((s) => s.connect);
  const gatewayUrl = useGatewayStore((s) => s.gatewayUrl);
  const loadGroups = useGroupStore((s) => s.loadGroups);
  const startedRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    loadGroups();

    const savedUrl = localStorage.getItem("claw-console:url") ?? "";
    const savedToken = localStorage.getItem("claw-console:token") ?? "";
    if (savedUrl) {
      useGatewayStore.setState({ gatewayUrl: savedUrl, gatewayToken: savedToken });
    }
  }, [loadGroups]);

  useEffect(() => {
    if (!mounted || startedRef.current) return;
    const { gatewayUrl: url, gatewayToken: token } = useGatewayStore.getState();
    if (url) {
      startedRef.current = true;
      connect(url, token);
    }
  }, [mounted, connect]);

  // Agent-group sync is handled by the event bus:
  // gateway-store emits "agent:deleted" → group-store prunes membership

  const showConnectionDialog =
    mounted && connectionState === "disconnected" && !gatewayUrl;

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
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
      {showConnectionDialog && <ConnectionDialog />}
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
