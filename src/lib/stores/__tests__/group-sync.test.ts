import { describe, it, expect } from "vitest";
import { mergeGroups } from "../group-sync";
import type { GroupChat } from "../group-store";

const makeGroup = (id: string, name: string, agents = ["main"]): GroupChat => ({
  id,
  name,
  agents,
  responseMode: "parallel",
  contextSharing: false,
  createdAt: Date.now(),
});

describe("mergeGroups", () => {
  it("returns server groups when local is empty", () => {
    const server = [makeGroup("1", "Server Group")];
    const { merged, needsPush } = mergeGroups([], server);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("Server Group");
    expect(needsPush).toBe(false);
  });

  it("returns local groups when server is empty and flags push", () => {
    const local = [makeGroup("1", "Local Only")];
    const { merged, needsPush } = mergeGroups(local, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("Local Only");
    expect(needsPush).toBe(true);
  });

  it("server wins on id collision", () => {
    const local = [makeGroup("1", "Local Version")];
    const server = [makeGroup("1", "Server Version")];
    const { merged, needsPush } = mergeGroups(local, server);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe("Server Version");
    expect(needsPush).toBe(false);
  });

  it("merges disjoint sets and flags push", () => {
    const local = [makeGroup("local-1", "Local")];
    const server = [makeGroup("server-1", "Server")];
    const { merged, needsPush } = mergeGroups(local, server);
    expect(merged).toHaveLength(2);
    expect(needsPush).toBe(true);
    expect(merged.map((g) => g.id).sort()).toEqual(["local-1", "server-1"]);
  });

  it("returns empty when both are empty", () => {
    const { merged, needsPush } = mergeGroups([], []);
    expect(merged).toHaveLength(0);
    expect(needsPush).toBe(false);
  });

  it("preserves all server groups on partial overlap", () => {
    const local = [makeGroup("1", "Local A"), makeGroup("2", "Local B")];
    const server = [makeGroup("2", "Server B"), makeGroup("3", "Server C")];
    const { merged, needsPush } = mergeGroups(local, server);
    expect(merged).toHaveLength(3);
    expect(needsPush).toBe(true); // "1" is local-only
    const byId = Object.fromEntries(merged.map((g) => [g.id, g.name]));
    expect(byId["1"]).toBe("Local A");
    expect(byId["2"]).toBe("Server B"); // server wins
    expect(byId["3"]).toBe("Server C");
  });
});
