import type {
  OperationName,
  OperationOutput,
  ProjectGraph,
  ProposedMemoryUpdate
} from "@zharwing/memory-core";
import type { ExecuteCommandOptions } from "./operation-coordinator.js";
import type {
  ProjectScopePort,
  ScopedProjectPort,
  ScopeResetListener,
  ScopeToken
} from "../project-scope/project-scope-coordinator.js";

export type { ProjectScopePort, ScopedProjectPort, ScopeResetListener, ScopeToken };

export interface StoreAsyncRuntimePort {
  createId(prefix: string): string;
  now(): string;
}

/** Minimal scheduling capability required by project-scoped stores. */
export interface StoreSchedulerPort {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
}

/**
 * Semantic coordination actions. Stores receive a `Pick` of this interface,
 * never the complete RootStore or infrastructure service graph.
 */
export interface StoreCoordinatorPort {
  executeCommand<Name extends OperationName>(
    options: ExecuteCommandOptions<Name>
  ): Promise<OperationOutput<Name> | undefined>;
  refreshAll(): Promise<void>;
  refreshProjects(): Promise<void>;
  refreshProjectSummary(): Promise<void>;
  refreshGraph(): Promise<void>;
  refreshTrash(): Promise<void>;
  refreshDocs(): Promise<void>;
  refreshSessions(): Promise<void>;
  refreshInbox(): Promise<void>;
  resetProjectTransient(): void;
  clearProjectResources(): void;
  graphRelationshipMode(): "deterministic" | "ai-reviewed";
  replaceInboxItems(items: ProposedMemoryUpdate[]): void;
  replaceGraph(data: ProjectGraph): void;
}

export type ProjectStoreCoordinator = Pick<StoreCoordinatorPort, "executeCommand" | "refreshAll">;
export type SessionStoreCoordinator = Pick<StoreCoordinatorPort, "executeCommand">;
export type DocsStoreCoordinator = Pick<StoreCoordinatorPort, "executeCommand">;
export type WorkstreamStoreCoordinator = Pick<StoreCoordinatorPort, "executeCommand">;
export type InboxStoreCoordinator = Pick<StoreCoordinatorPort, "executeCommand">;
export type GraphStoreCoordinator = Pick<StoreCoordinatorPort, "executeCommand"> &
  Partial<Pick<StoreCoordinatorPort, "refreshProjects" | "refreshProjectSummary" | "refreshInbox">>;
export type AssistantStoreCoordinator = Pick<StoreCoordinatorPort, "executeCommand"> &
  Partial<Pick<StoreCoordinatorPort, "refreshProjects" | "refreshProjectSummary">>;
export type SemanticStoreCoordinator = Pick<
  StoreCoordinatorPort,
  | "executeCommand"
  | "graphRelationshipMode"
  | "replaceInboxItems"
  | "replaceGraph"
  | "refreshInbox"
  | "refreshProjectSummary"
  | "refreshGraph"
>;
export type SystemStoreCoordinator = Pick<
  StoreCoordinatorPort,
  "executeCommand"
>;
