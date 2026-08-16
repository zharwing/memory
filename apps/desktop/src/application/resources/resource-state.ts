import { makeAutoObservable } from "mobx";
import {
  createPublicError,
  isPublicError,
  type PublicError
} from "@zharwing/memory-core";
import type {
  ScopeToken,
  ScopedProjectPort
} from "../project-scope/project-scope-coordinator.js";
import type { StoreAsyncRuntimePort } from "../operations/store-ports.js";
import { publicErrorPresenter } from "../errors/public-error-presenter.js";

export type Completeness =
  | { readonly kind: "complete" }
  | { readonly kind: "partial"; readonly nextCursor?: string; readonly total?: number };

/** Compatibility projection while stores migrate to the presenter directly. */
export function publicErrorCopy(error: PublicError | undefined): string {
  return publicErrorPresenter.present(error);
}

export const complete: Completeness = Object.freeze({ kind: "complete" });

export interface ResourceSnapshot<T> {
  readonly scope: ScopeToken;
  readonly data: T;
  readonly completeness: Completeness;
  readonly receivedAt: string;
}

export type ResourceState<T> =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly scope: ScopeToken; readonly requestId: string }
  | {
      readonly status: "refreshing";
      readonly scope: ScopeToken;
      readonly requestId: string;
      readonly data: T;
      readonly completeness: Completeness;
      readonly lastSuccessAt: string;
    }
  | {
      readonly status: "success";
      readonly scope: ScopeToken;
      readonly data: T;
      readonly completeness: Completeness;
      readonly lastSuccessAt: string;
    }
  | {
      readonly status: "empty";
      readonly scope: ScopeToken;
      readonly data: T;
      readonly completeness: { readonly kind: "complete" };
      readonly lastSuccessAt: string;
    }
  | {
      readonly status: "failure";
      readonly scope: ScopeToken;
      readonly error: PublicError;
      readonly previous?: ResourceSnapshot<T>;
    };

export interface ResourceAttempt {
  readonly requestId: string;
  readonly scope: ScopeToken;
}

type ScopeAuthority = Pick<ScopedProjectPort, "captureScope" | "isScopeCurrent">;

/**
 * One observed resource with scope-generation and same-generation request
 * identity guards. Its state is the source of truth; compatibility getters in
 * stores may project it but must not maintain a second mutable copy.
 */
export class ResourceSlot<T> {
  state: ResourceState<T> = { status: "idle" };
  lastSuccess: ResourceSnapshot<T> | undefined = undefined;
  private activeRequestId: string | undefined = undefined;

  constructor(
    private readonly scope: ScopeAuthority,
    private readonly runtime: StoreAsyncRuntimePort,
    private readonly isEmpty: (data: T) => boolean = defaultIsEmpty
  ) {
    makeAutoObservable<
      this,
      "scope" | "runtime" | "isEmpty" | "activeRequestId"
    >(this, {
      scope: false,
      runtime: false,
      isEmpty: false,
      activeRequestId: false
    });
  }

  begin(scope = this.scope.captureScope()): ResourceAttempt | undefined {
    // An obsolete continuation may explicitly pass its captured old token
    // after the new generation already started. It must be a no-op: resetting
    // here would erase the newer generation's active request and data.
    if (!scope || !this.scope.isScopeCurrent(scope)) return undefined;
    const requestId = this.runtime.createId("resource");
    this.activeRequestId = requestId;
    const previous = this.snapshotFor(scope);
    this.state = previous
      ? {
          status: "refreshing",
          scope,
          requestId,
          data: previous.data,
          completeness: previous.completeness,
          lastSuccessAt: previous.receivedAt
        }
      : { status: "loading", scope, requestId };
    return { requestId, scope };
  }

  succeed(
    attempt: ResourceAttempt,
    data: T,
    completeness: Completeness = complete
  ): boolean {
    if (!this.canCommit(attempt)) return false;
    const snapshot: ResourceSnapshot<T> = {
      scope: attempt.scope,
      data,
      completeness,
      receivedAt: this.runtime.now()
    };
    this.lastSuccess = snapshot;
    this.activeRequestId = undefined;
    this.state = completeness.kind === "complete" && this.isEmpty(data)
      ? {
          status: "empty",
          scope: attempt.scope,
          data,
          completeness: { kind: "complete" },
          lastSuccessAt: snapshot.receivedAt
        }
      : {
          status: "success",
          scope: attempt.scope,
          data,
          completeness,
          lastSuccessAt: snapshot.receivedAt
        };
    return true;
  }

  fail(attempt: ResourceAttempt, error: unknown): boolean {
    if (!this.canCommit(attempt)) return false;
    const previous = this.snapshotFor(attempt.scope);
    this.activeRequestId = undefined;
    this.state = {
      status: "failure",
      scope: attempt.scope,
      error: toPublicError(error),
      previous
    };
    return true;
  }

  cancel(attempt: ResourceAttempt): boolean {
    if (!this.canCommit(attempt)) return false;
    const previous = this.snapshotFor(attempt.scope);
    this.activeRequestId = undefined;
    if (!previous) {
      this.state = { status: "idle" };
    } else {
      this.state = this.isEmpty(previous.data) && previous.completeness.kind === "complete"
        ? {
            status: "empty",
            scope: previous.scope,
            data: previous.data,
            completeness: { kind: "complete" },
            lastSuccessAt: previous.receivedAt
          }
        : {
            status: "success",
            scope: previous.scope,
            data: previous.data,
            completeness: previous.completeness,
            lastSuccessAt: previous.receivedAt
          };
    }
    return true;
  }

  reset(): void {
    this.activeRequestId = undefined;
    this.lastSuccess = undefined;
    this.state = { status: "idle" };
  }

  get data(): T | undefined {
    if (
      this.state.status === "refreshing" ||
      this.state.status === "success" ||
      this.state.status === "empty"
    ) return this.state.data;
    return this.state.status === "failure" ? this.state.previous?.data : undefined;
  }

  get loading(): boolean {
    return this.state.status === "loading" || this.state.status === "refreshing";
  }

  get error(): PublicError | undefined {
    return this.state.status === "failure" ? this.state.error : undefined;
  }

  get completeness(): Completeness | undefined {
    if (
      this.state.status === "refreshing" ||
      this.state.status === "success" ||
      this.state.status === "empty"
    ) return this.state.completeness;
    return this.state.status === "failure" ? this.state.previous?.completeness : undefined;
  }

  private canCommit(attempt: ResourceAttempt): boolean {
    return this.activeRequestId === attempt.requestId && this.scope.isScopeCurrent(attempt.scope);
  }

  private snapshotFor(scope: ScopeToken): ResourceSnapshot<T> | undefined {
    return this.lastSuccess?.scope === scope ? this.lastSuccess : undefined;
  }
}

export function toPublicError(error: unknown): PublicError {
  if (isPublicError(error)) return error;
  if (isRecord(error) && isPublicError(error.publicError)) return error.publicError;
  return createPublicError("internal");
}

function defaultIsEmpty(value: unknown): boolean {
  return Array.isArray(value) ? value.length === 0 : value === undefined || value === null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
