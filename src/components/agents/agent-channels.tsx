"use client";

import { useGatewayStore } from "@/lib/stores/gateway-store";
import { useEffect, useState } from "react";
import type { ChannelsStatusSnapshot } from "@/lib/gateway/types";

export function AgentChannels() {
  const rpc = useGatewayStore((s) => s.rpc);
  const [status, setStatus] = useState<ChannelsStatusSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const result = await rpc<ChannelsStatusSnapshot>("channels.status");
      setStatus(result);
    } catch (err) {
      console.error("Failed to load channels:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchChannels();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return <div className="font-mono text-xs uppercase tracking-[0.2em] text-fg-dim">LOADING CHANNELS...</div>;
  }

  if (!status) {
    return <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-dim">FAILED TO LOAD CHANNELS</p>;
  }

  const channels = status.channelOrder ?? [];

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-bold uppercase tracking-wide text-fg">CHANNELS</h3>
        <button
          onClick={fetchChannels}
          className="border border-border-interactive px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-fg-muted hover:text-fg hover:border-border-hover transition-all"
        >
          REFRESH
        </button>
      </div>
      <p className="mb-4 font-mono text-[10px] uppercase tracking-wider text-fg-ghost">
        CHANNELS ARE GLOBAL — NOT PER-AGENT
      </p>

      {channels.length === 0 ? (
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-fg-dim">NO CHANNELS CONFIGURED</p>
      ) : (
        <div className="space-y-2">
          {channels.map((channelKey) => {
            const label = status.channelLabels?.[channelKey] ?? channelKey;
            const channelData = status.channels?.[channelKey];
            const accounts = channelData?.accounts ?? [];

            return (
              <div
                key={channelKey}
                className="border border-border-default p-3 hover:border-border-active transition-all"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs uppercase tracking-wide text-fg">{label}</span>
                  <span className="font-mono text-[10px] text-fg-ghost">({channelKey})</span>
                </div>
                {accounts.length === 0 ? (
                  <p className="mt-1 font-mono text-[10px] text-fg-ghost">NO ACCOUNTS</p>
                ) : (
                  <div className="mt-2 space-y-1">
                    {accounts.map((acct) => (
                      <div key={acct.accountId} className="flex items-center gap-2">
                        <span className="font-mono text-xs">
                          {acct.connected ? "●" : "○"}
                        </span>
                        <span className="font-mono text-[10px] text-fg-subtle">
                          {acct.label || acct.accountId}
                        </span>
                        {acct.error && (
                          <span className="font-mono text-[10px] text-fg-subtle">[ERR] {acct.error}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
