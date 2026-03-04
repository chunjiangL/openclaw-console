import { describe, it, expect, vi } from "vitest";
import { useGatewayStore } from "../gateway-store";

describe("useGatewayStore", () => {
  describe("loadAgents", () => {
    it("maps raw.id to agentId and flattens identity", async () => {
      const mockClient = {
        connected: true,
        request: vi.fn().mockResolvedValue({
          defaultId: "agent-1",
          agents: [
            { id: "agent-1", identity: { name: "Alpha Bot" } },
            { id: "agent-2", name: "Beta" },
          ],
        }),
      };
      useGatewayStore.setState({ client: mockClient as never, connectionState: "connected" });
      await useGatewayStore.getState().loadAgents();

      const agents = useGatewayStore.getState().agents;
      expect(agents).toHaveLength(2);
      expect(agents[0].agentId).toBe("agent-1");
      expect(agents[0].name).toBe("Alpha Bot");
    });

    it("falls back name: identity.name -> name -> id", async () => {
      const mockClient = {
        connected: true,
        request: vi.fn().mockResolvedValue({
          defaultId: "a",
          agents: [
            { id: "a", name: "FallbackName" },
            { id: "b" },
          ],
        }),
      };
      useGatewayStore.setState({ client: mockClient as never, connectionState: "connected" });
      await useGatewayStore.getState().loadAgents();

      const agents = useGatewayStore.getState().agents;
      expect(agents[0].name).toBe("FallbackName");
      expect(agents[1].name).toBe("b");
    });

    it("sets defaultAgentId from result.defaultId", async () => {
      const mockClient = {
        connected: true,
        request: vi.fn().mockResolvedValue({
          defaultId: "default-agent",
          agents: [{ id: "default-agent", identity: { name: "Default" } }],
        }),
      };
      useGatewayStore.setState({ client: mockClient as never, connectionState: "connected" });
      await useGatewayStore.getState().loadAgents();

      expect(useGatewayStore.getState().defaultAgentId).toBe("default-agent");
    });

    it("does not fetch if client is not connected", async () => {
      const mockClient = { connected: false, request: vi.fn() };
      useGatewayStore.setState({ client: mockClient as never });
      await useGatewayStore.getState().loadAgents();

      expect(mockClient.request).not.toHaveBeenCalled();
    });

    it("sets lastError on RPC failure", async () => {
      const mockClient = {
        connected: true,
        request: vi.fn().mockRejectedValue(new Error("RPC failed")),
      };
      useGatewayStore.setState({ client: mockClient as never, connectionState: "connected" });
      await useGatewayStore.getState().loadAgents();

      expect(useGatewayStore.getState().lastError).toContain("RPC failed");
    });
  });
});
