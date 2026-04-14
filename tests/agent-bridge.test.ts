import { describe, it, expect } from "bun:test";
import { AgentBridge } from "../src/agent-bridge.js";

describe("AgentBridge", () => {
  it("initializes as disconnected", () => {
    const bridge = new AgentBridge("ws://localhost:9999");
    expect(bridge.connected).toBe(false);
  });

  it("disconnect is safe to call when not connected", () => {
    const bridge = new AgentBridge("ws://localhost:9999");
    expect(() => bridge.disconnect()).not.toThrow();
  });

  it("send is a no-op when not connected", () => {
    const bridge = new AgentBridge("ws://localhost:9999");
    expect(() =>
      bridge.send({
        element: document.createElement("div"),
        tagName: "div",
        elementSource: null,
        components: [],
        formatted: "test",
        timestamp: Date.now(),
      })
    ).not.toThrow();
  });
});
