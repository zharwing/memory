import { makeAutoObservable } from "mobx";
import { createPublicError, type PublicError } from "@zharwing/memory-core";
import type { ScopeToken } from "../project-scope/project-scope-coordinator.js";
import { toPublicError } from "../resources/resource-state.js";
import type { StoreAsyncRuntimePort } from "./store-ports.js";

export type OperationState<Result = unknown> =
  | { readonly status: "idle" }
  | { readonly status: "submitting"; readonly operationId: string }
  | { readonly status: "reconciling"; readonly operationId: string; readonly error?: PublicError }
  | { readonly status: "succeeded"; readonly operationId: string; readonly result: Result }
  | { readonly status: "refused"; readonly operationId: string; readonly error: PublicError }
  | { readonly status: "failed"; readonly operationId: string; readonly error: PublicError };

export interface OperationAttempt {
  readonly operationId: string;
  readonly key: string;
  readonly scope?: ScopeToken;
}

/** Concurrent effect identities; finishing one attempt never clears a peer. */
export class OperationLedger {
  private readonly active = new Map<
    string,
    { attempt: OperationAttempt; state: OperationState; readonly sequence: number }
  >();
  private readonly terminal = new Map<
    string,
    { readonly state: OperationState; readonly scope?: ScopeToken; readonly sequence: number }
  >();
  private nextSequence = 0;

  constructor(private readonly runtime: StoreAsyncRuntimePort) {
    makeAutoObservable<this, "runtime">(this, { runtime: false });
  }

  begin(key: string, scope?: ScopeToken): OperationAttempt {
    const attempt: OperationAttempt = {
      operationId: this.runtime.createId(`operation:${key}`),
      key,
      scope
    };
    this.active.set(attempt.operationId, {
      attempt,
      state: { status: "submitting", operationId: attempt.operationId },
      sequence: ++this.nextSequence
    });
    return attempt;
  }

  reconcile(attempt: OperationAttempt): boolean {
    const active = this.active.get(attempt.operationId);
    if (!active || !this.canSettle(attempt)) return false;
    active.state = { status: "reconciling", operationId: attempt.operationId };
    this.active.set(attempt.operationId, active);
    return true;
  }

  succeed<Result>(attempt: OperationAttempt, result: Result): boolean {
    const active = this.active.get(attempt.operationId);
    if (!active || !this.canSettle(attempt)) return false;
    this.active.delete(attempt.operationId);
    this.publishTerminal(attempt.key, {
      state: {
        status: "succeeded",
        operationId: attempt.operationId,
        result
      },
      scope: attempt.scope,
      sequence: active.sequence
    });
    return true;
  }

  fail(attempt: OperationAttempt, error: unknown): boolean {
    const active = this.active.get(attempt.operationId);
    if (!active || !this.canSettle(attempt)) return false;
    const publicError = toPublicError(error);
    this.active.delete(attempt.operationId);
    this.publishTerminal(attempt.key, {
      state: terminalFailure(attempt.operationId, publicError),
      scope: attempt.scope,
      sequence: active.sequence
    });
    return true;
  }

  abandon(attempt: OperationAttempt): boolean {
    return this.active.delete(attempt.operationId);
  }

  resetScope(current?: ScopeToken): void {
    for (const [id, entry] of this.active) {
      if (entry.attempt.scope && entry.attempt.scope !== current) this.active.delete(id);
    }
    for (const [key, entry] of this.terminal) {
      if (entry.scope && entry.scope !== current) this.terminal.delete(key);
    }
  }

  reset(): void {
    this.active.clear();
    this.terminal.clear();
  }

  isBusy(key?: string): boolean {
    if (!key) return this.active.size > 0;
    return [...this.active.values()].some((entry) => entry.attempt.key === key);
  }

  state(key: string): OperationState {
    const active = [...this.active.values()]
      .filter((entry) => entry.attempt.key === key)
      .sort((left, right) => right.sequence - left.sequence)[0];
    const terminal = this.terminal.get(key);
    if (!active) return terminal?.state ?? { status: "idle" };
    if (!terminal) return active.state;
    return active.sequence > terminal.sequence ? active.state : terminal.state;
  }

  get error(): PublicError | undefined {
    const activeError = [...this.active.values()]
      .sort((left, right) => right.sequence - left.sequence)
      .map((entry) => entry.state)
      .find((state): state is Extract<OperationState, { status: "reconciling" }> =>
        state.status === "reconciling" && Boolean(state.error)
      )?.error;
    if (activeError) return activeError;
    const latestFailure = [...this.terminal.values()]
      .filter((entry): entry is typeof entry & {
        state: Extract<OperationState, { status: "reconciling" | "refused" | "failed" }>;
      } => entry.state.status === "reconciling" || entry.state.status === "refused" || entry.state.status === "failed")
      .sort((left, right) => right.sequence - left.sequence)[0];
    return latestFailure?.state.error;
  }

  private canSettle(attempt: OperationAttempt): boolean {
    if (!this.active.has(attempt.operationId)) return false;
    if (!attempt.scope?.signal.aborted) return true;
    this.active.delete(attempt.operationId);
    return false;
  }

  private publishTerminal(
    key: string,
    entry: { readonly state: OperationState; readonly scope?: ScopeToken; readonly sequence: number }
  ): void {
    const current = this.terminal.get(key);
    if (!current || current.sequence <= entry.sequence) this.terminal.set(key, entry);
  }
}

function terminalFailure(operationId: string, error: PublicError): OperationState {
  if (error.retry === "after-reconcile") {
    return { status: "reconciling", operationId, error };
  }
  if (
    error.category === "validation" ||
    error.category === "authorization" ||
    error.category === "conflict"
  ) {
    return { status: "refused", operationId, error };
  }
  return {
    status: "failed",
    operationId,
    error: error ?? createPublicError("internal")
  };
}
