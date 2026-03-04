import { describe, it, expect, vi } from "vitest";
import { useGroupStore, type GroupMessage } from "../group-store";

describe("useGroupStore", () => {
  describe("createGroup", () => {
    it("creates a group with correct defaults", () => {
      const group = useGroupStore.getState().createGroup("Test", ["a1", "a2"]);
      expect(group.name).toBe("Test");
      expect(group.agents).toEqual(["a1", "a2"]);
      expect(group.responseMode).toBe("parallel");
      expect(group.contextSharing).toBe(false);
      expect(group.id).toBeTruthy();
    });

    it("adds group to store", () => {
      useGroupStore.getState().createGroup("G1", ["a1"]);
      expect(useGroupStore.getState().groups).toHaveLength(1);
    });

    it("persists to localStorage", () => {
      useGroupStore.getState().createGroup("G1", ["a1"]);
      const stored = localStorage.getItem("claw-console:groups");
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].name).toBe("G1");
    });

    it("supports custom response mode", () => {
      const group = useGroupStore.getState().createGroup("G1", ["a1"], "sequential");
      expect(group.responseMode).toBe("sequential");
    });
  });

  describe("addMessage", () => {
    it("appends message to the correct group", () => {
      const group = useGroupStore.getState().createGroup("G1", ["a1"]);
      const msg: GroupMessage = {
        id: "m1",
        groupId: group.id,
        role: "user",
        content: "hello",
        timestamp: Date.now(),
        targetAgents: ["a1"],
        runIds: [],
      };
      useGroupStore.getState().addMessage(msg);
      const messages = useGroupStore.getState().getGroupMessages(group.id);
      expect(messages).toHaveLength(1);
      expect(messages[0].content).toBe("hello");
    });

    it("persists messages async", async () => {
      vi.useFakeTimers();
      const group = useGroupStore.getState().createGroup("G1", ["a1"]);
      useGroupStore.getState().addMessage({
        id: "m1",
        groupId: group.id,
        role: "user",
        content: "test",
        timestamp: Date.now(),
        targetAgents: [],
        runIds: [],
      });
      // Persistence is delayed by 100ms
      vi.advanceTimersByTime(150);
      const stored = localStorage.getItem("claw-console:group-messages");
      expect(stored).toBeTruthy();
      vi.useRealTimers();
    });
  });

  describe("getGroupMessages", () => {
    it("returns empty array for unknown group", () => {
      expect(useGroupStore.getState().getGroupMessages("nonexistent")).toEqual([]);
    });
  });

  describe("updateGroup", () => {
    it("patches group fields", () => {
      const group = useGroupStore.getState().createGroup("G1", ["a1"]);
      useGroupStore.getState().updateGroup(group.id, { name: "Updated", contextSharing: true });
      const updated = useGroupStore.getState().groups.find((g) => g.id === group.id);
      expect(updated?.name).toBe("Updated");
      expect(updated?.contextSharing).toBe(true);
    });

    it("preserves other fields", () => {
      const group = useGroupStore.getState().createGroup("G1", ["a1", "a2"]);
      useGroupStore.getState().updateGroup(group.id, { name: "New" });
      const updated = useGroupStore.getState().groups.find((g) => g.id === group.id);
      expect(updated?.agents).toEqual(["a1", "a2"]);
    });
  });

  describe("deleteGroup", () => {
    it("removes the group", () => {
      const group = useGroupStore.getState().createGroup("G1", ["a1"]);
      useGroupStore.getState().deleteGroup(group.id);
      expect(useGroupStore.getState().groups).toHaveLength(0);
    });

    it("removes associated messages", () => {
      const group = useGroupStore.getState().createGroup("G1", ["a1"]);
      useGroupStore.getState().addMessage({
        id: "m1",
        groupId: group.id,
        role: "user",
        content: "test",
        timestamp: Date.now(),
        targetAgents: [],
        runIds: [],
      });
      useGroupStore.getState().deleteGroup(group.id);
      expect(useGroupStore.getState().getGroupMessages(group.id)).toEqual([]);
    });

    it("resets activeGroupId if it matches deleted group", () => {
      const group = useGroupStore.getState().createGroup("G1", ["a1"]);
      useGroupStore.getState().setActiveGroup(group.id);
      expect(useGroupStore.getState().activeGroupId).toBe(group.id);
      useGroupStore.getState().deleteGroup(group.id);
      expect(useGroupStore.getState().activeGroupId).toBeNull();
    });
  });

  describe("loadGroups", () => {
    it("restores groups from localStorage", () => {
      const group = useGroupStore.getState().createGroup("Saved", ["a1"]);
      const groupId = group.id;

      // Reset store
      useGroupStore.setState({ groups: [], messages: new Map() });
      expect(useGroupStore.getState().groups).toHaveLength(0);

      // Reload from storage
      useGroupStore.getState().loadGroups();
      expect(useGroupStore.getState().groups).toHaveLength(1);
      expect(useGroupStore.getState().groups[0].id).toBe(groupId);
    });

    it("restores messages from localStorage", () => {
      vi.useFakeTimers();
      const group = useGroupStore.getState().createGroup("G1", ["a1"]);
      useGroupStore.getState().addMessage({
        id: "m1",
        groupId: group.id,
        role: "user",
        content: "persisted",
        timestamp: Date.now(),
        targetAgents: [],
        runIds: [],
      });
      // Wait for async persist
      vi.advanceTimersByTime(150);

      // Reset and reload
      useGroupStore.setState({ groups: [], messages: new Map() });
      useGroupStore.getState().loadGroups();
      const msgs = useGroupStore.getState().getGroupMessages(group.id);
      expect(msgs).toHaveLength(1);
      expect(msgs[0].content).toBe("persisted");
      vi.useRealTimers();
    });
  });
});
