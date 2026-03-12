"use client";

import { AppShell } from "@/components/layout/app-shell";
import { useRouter } from "@/lib/router";
import { AgentList } from "@/components/agents/agent-list";
import { AgentDetail } from "@/components/agents/agent-detail";
import { ChatTest } from "@/components/chat/chat-test";
import { GroupChat } from "@/components/chat/group-chat";
function PageContent() {
  const { currentPath } = useRouter();

  if (currentPath === "/") return <AgentList />;
  if (currentPath.startsWith("/agents/")) return <AgentDetail />;
  if (currentPath === "/chat/test") return <ChatTest />;
  if (currentPath.startsWith("/chat/group/")) return <GroupChat />;

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-fg-muted">Page not found.</p>
    </div>
  );
}

export default function CatchAllPage() {
  return (
    <AppShell>
      <PageContent />
    </AppShell>
  );
}
