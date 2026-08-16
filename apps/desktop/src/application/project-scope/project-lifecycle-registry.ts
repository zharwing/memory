import type {
  ProjectScopeCoordinator,
  ScopeToken
} from "./project-scope-coordinator.js";

export type ProjectResetReason = "activate" | "clear" | "dispose";

export interface ProjectLifecycleParticipant {
  readonly id: string;
  readonly order: number;
  reset(reason: ProjectResetReason, next: ScopeToken | undefined, previous: ScopeToken | undefined): void;
  dispose?(): void;
}

/** The sole subscription and ordered reset/disposal owner for project state. */
export class ProjectLifecycleRegistry {
  readonly #participants: ProjectLifecycleParticipant[];
  readonly #unsubscribe: () => void;
  #disposed = false;

  constructor(scope: ProjectScopeCoordinator, participants: readonly ProjectLifecycleParticipant[]) {
    const ids = new Set<string>();
    for (const participant of participants) {
      if (ids.has(participant.id)) throw new Error(`Lifecycle participant ${participant.id} is registered twice.`);
      ids.add(participant.id);
    }
    this.#participants = [...participants].sort((left, right) => left.order - right.order);
    this.#unsubscribe = scope.onScopeReset((next, previous) => {
      const reason: ProjectResetReason = next ? "activate" : "clear";
      this.reset(reason, next, previous);
    });
  }

  reset(
    reason: ProjectResetReason,
    next: ScopeToken | undefined,
    previous: ScopeToken | undefined
  ): void {
    for (const participant of this.#participants) participant.reset(reason, next, previous);
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#unsubscribe();
    for (const participant of [...this.#participants].reverse()) {
      participant.reset("dispose", undefined, undefined);
      participant.dispose?.();
    }
  }
}
