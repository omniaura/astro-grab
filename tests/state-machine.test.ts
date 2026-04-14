import { describe, it, expect, beforeEach } from "bun:test";
import { StateMachine } from "../src/state-machine.js";
import type { ClientState } from "../src/state-machine.js";

describe("StateMachine", () => {
  let sm: StateMachine;

  beforeEach(() => {
    sm = new StateMachine();
  });

  describe("initial state", () => {
    it("starts in idle", () => {
      expect(sm.getState()).toBe("idle");
    });
  });

  describe("transition", () => {
    it("transitions from idle to targeting", () => {
      sm.transition("targeting");
      expect(sm.getState()).toBe("targeting");
    });

    it("transitions from targeting to idle", () => {
      sm.transition("targeting");
      sm.transition("idle");
      expect(sm.getState()).toBe("idle");
    });

    it("is a no-op when transitioning to the same state", () => {
      const calls: ClientState[] = [];
      sm.subscribe((state) => calls.push(state));

      sm.transition("idle"); // already idle — should not fire
      expect(calls).toEqual([]);
      expect(sm.getState()).toBe("idle");
    });

    it("is a no-op for targeting → targeting", () => {
      sm.transition("targeting");

      const calls: ClientState[] = [];
      sm.subscribe((state) => calls.push(state));

      sm.transition("targeting"); // already targeting — should not fire
      expect(calls).toEqual([]);
      expect(sm.getState()).toBe("targeting");
    });
  });

  describe("subscribe", () => {
    it("notifies listener on transition", () => {
      const calls: ClientState[] = [];
      sm.subscribe((state) => calls.push(state));

      sm.transition("targeting");
      expect(calls).toEqual(["targeting"]);
    });

    it("notifies listener for each transition", () => {
      const calls: ClientState[] = [];
      sm.subscribe((state) => calls.push(state));

      sm.transition("targeting");
      sm.transition("idle");
      sm.transition("targeting");
      expect(calls).toEqual(["targeting", "idle", "targeting"]);
    });

    it("supports multiple subscribers", () => {
      const callsA: ClientState[] = [];
      const callsB: ClientState[] = [];
      sm.subscribe((state) => callsA.push(state));
      sm.subscribe((state) => callsB.push(state));

      sm.transition("targeting");
      expect(callsA).toEqual(["targeting"]);
      expect(callsB).toEqual(["targeting"]);
    });

    it("returns an unsubscribe function", () => {
      const calls: ClientState[] = [];
      const unsubscribe = sm.subscribe((state) => calls.push(state));

      sm.transition("targeting");
      expect(calls).toEqual(["targeting"]);

      unsubscribe();

      sm.transition("idle");
      // Should NOT have received the idle notification
      expect(calls).toEqual(["targeting"]);
    });

    it("unsubscribe is safe to call multiple times", () => {
      const calls: ClientState[] = [];
      const unsubscribe = sm.subscribe((state) => calls.push(state));

      unsubscribe();
      unsubscribe(); // second call should be harmless

      sm.transition("targeting");
      expect(calls).toEqual([]);
    });
  });

  describe("reset", () => {
    it("restores idle from targeting", () => {
      sm.transition("targeting");
      sm.reset();
      expect(sm.getState()).toBe("idle");
    });

    it("is a no-op when already idle", () => {
      const calls: ClientState[] = [];
      sm.subscribe((state) => calls.push(state));

      sm.reset();
      expect(sm.getState()).toBe("idle");
      expect(calls).toEqual([]);
    });

    it("notifies subscribers when resetting from non-idle", () => {
      sm.transition("targeting");

      const calls: ClientState[] = [];
      sm.subscribe((state) => calls.push(state));

      sm.reset();
      expect(calls).toEqual(["idle"]);
    });
  });
});
