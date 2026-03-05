import type { GroupChat } from "./group-store";

type ServerGroupsResult = {
  groups: GroupChat[];
  updatedAt: number;
};

type ServerGroupsSetResult = {
  ok: boolean;
  updatedAt: number;
  count: number;
};

/**
 * Merge local and server groups. Server wins on id collision.
 * Returns merged array and whether a push is needed (local-only groups exist).
 */
export function mergeGroups(
  local: GroupChat[],
  server: GroupChat[],
): { merged: GroupChat[]; needsPush: boolean } {
  const serverIds = new Set(server.map((g) => g.id));
  const merged = new Map<string, GroupChat>();

  for (const g of server) {
    merged.set(g.id, g);
  }

  let needsPush = false;
  for (const g of local) {
    if (!merged.has(g.id)) {
      merged.set(g.id, g);
      needsPush = true;
    }
  }

  return { merged: Array.from(merged.values()), needsPush };
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Debounced push of groups to server.
 */
export function schedulePushGroups(
  rpc: <T>(method: string, params?: unknown) => Promise<T>,
  groups: GroupChat[],
  delayMs = 500,
): void {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    syncTimer = null;
    rpc<ServerGroupsSetResult>("console.groups.set", { groups }).catch((err) => {
      console.warn("[group-sync] push failed:", err);
    });
  }, delayMs);
}

/**
 * Pull groups from server and merge with local.
 * Returns the merged list if successful, null on failure.
 */
export async function pullAndMergeGroups(
  rpc: <T>(method: string, params?: unknown) => Promise<T>,
  localGroups: GroupChat[],
): Promise<{ merged: GroupChat[]; pushed: boolean } | null> {
  try {
    const result = await rpc<ServerGroupsResult>("console.groups.list");
    const { merged, needsPush } = mergeGroups(localGroups, result.groups);
    if (needsPush) {
      await rpc<ServerGroupsSetResult>("console.groups.set", { groups: merged });
    }
    return { merged, pushed: needsPush };
  } catch (err) {
    console.warn("[group-sync] pull failed:", err);
    return null;
  }
}
