import { makeAutoObservable } from "mobx";

export interface ScopeToken {
  readonly projectId: string;
  readonly generation: number;
  readonly signal: AbortSignal;
}

/** Compatibility identity view used by code that has not yet captured requests. */
export interface ProjectScopePort {
  currentProjectId(): string;
  currentProjectWorkingDirectory(): string | undefined;
}

export type ScopeResetListener = (
  next: ScopeToken | undefined,
  previous: ScopeToken | undefined
) => void;

/**
 * The single authority for the visible project generation.
 *
 * Project id comparison alone is insufficient: an A -> B -> A trace must not
 * allow the first A's callbacks to commit into the second A. Captured tokens
 * therefore include identity, generation, and an abort signal.
 */
export interface ScopedProjectPort extends ProjectScopePort {
  captureScope(): ScopeToken | undefined;
  isScopeCurrent(token: ScopeToken): boolean;
  onScopeReset(listener: ScopeResetListener): () => void;
}

export class ProjectScopeCoordinator implements ScopedProjectPort {
  private projectId = "";
  private workingDirectory: string | undefined = undefined;
  private generation = 0;
  private controller: AbortController | undefined = undefined;
  private token: ScopeToken | undefined = undefined;
  private readonly listeners = new Set<ScopeResetListener>();
  private disposed = false;

  constructor() {
    makeAutoObservable<
      this,
      "controller" | "token" | "listeners" | "disposed"
    >(this, {
      controller: false,
      token: false,
      listeners: false,
      disposed: false
    });
  }

  currentProjectId(): string {
    return this.projectId;
  }

  currentProjectWorkingDirectory(): string | undefined {
    return this.workingDirectory;
  }

  captureScope(): ScopeToken | undefined {
    return this.token;
  }

  isScopeCurrent(candidate: ScopeToken): boolean {
    return Boolean(
      this.token === candidate &&
      candidate.projectId === this.projectId &&
      candidate.generation === this.generation &&
      !candidate.signal.aborted
    );
  }

  activate(projectId: string, workingDirectory?: string): ScopeToken | undefined {
    if (this.disposed) return undefined;
    const normalizedProjectId = projectId.trim();
    if (!normalizedProjectId) {
      this.clear();
      return undefined;
    }

    if (this.token && this.projectId === normalizedProjectId && !this.token.signal.aborted) {
      this.workingDirectory = workingDirectory;
      return this.token;
    }

    const previous = this.token;
    this.controller?.abort();
    this.generation += 1;
    this.projectId = normalizedProjectId;
    this.workingDirectory = workingDirectory;
    this.controller = new AbortController();
    this.token = Object.freeze({
      projectId: normalizedProjectId,
      generation: this.generation,
      signal: this.controller.signal
    });
    this.notify(this.token, previous);
    return this.token;
  }

  clear(): void {
    const previous = this.token;
    if (!previous && !this.projectId) return;
    this.controller?.abort();
    this.generation += 1;
    this.projectId = "";
    this.workingDirectory = undefined;
    this.controller = undefined;
    this.token = undefined;
    this.notify(undefined, previous);
  }

  onScopeReset(listener: ScopeResetListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    this.listeners.clear();
  }

  private notify(next: ScopeToken | undefined, previous: ScopeToken | undefined): void {
    for (const listener of [...this.listeners]) listener(next, previous);
  }
}

/** Stable scope for application-wide resources such as daemon health. */
export function createApplicationScopePort(): Pick<
  ScopedProjectPort,
  "captureScope" | "isScopeCurrent"
> {
  const controller = new AbortController();
  const token: ScopeToken = Object.freeze({
    projectId: "@application",
    generation: 0,
    signal: controller.signal
  });
  return {
    captureScope: () => token,
    isScopeCurrent: (candidate) => candidate === token && !candidate.signal.aborted
  };
}
