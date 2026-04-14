/**
 * state-machine.ts
 *
 * Minimal state machine for the astro-grab client lifecycle.
 * Drives overlay visibility and inspector activation via
 * subscribe-based state transitions.
 */

// ── Types ─────────────────────────────────────────────────────────────

export type ClientState = "idle" | "targeting";

export interface StateListener {
  (state: ClientState): void;
}

// ── StateMachine ──────────────────────────────────────────────────────

export class StateMachine {
  private state: ClientState = "idle";
  private listeners = new Set<StateListener>();

  getState(): ClientState {
    return this.state;
  }

  /**
   * Transition to a new state. No-ops if the state is unchanged.
   * Notifies all subscribers when a transition occurs.
   */
  transition(newState: ClientState): void {
    if (this.state === newState) return;

    this.state = newState;

    for (const listener of this.listeners) {
      listener(newState);
    }
  }

  /**
   * Subscribe to all state transitions.
   * Returns an unsubscribe function.
   */
  subscribe(listener: StateListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Reset the machine back to idle. */
  reset(): void {
    this.transition("idle");
  }
}
