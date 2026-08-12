import type { ProjectGraph, ProposedMemoryUpdate } from "@zharwing/memory-core";
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

export type ProjectStoreCoordinator = Pick<
  StoreCoordinatorPort,
  "resetProjectTransient" | "refreshAll" | "clearProjectResources" | "refreshTrash" | "refreshGraph"
>;
export type SessionStoreCoordinator = Pick<
  StoreCoordinatorPort,
  "refreshProjectSummary" | "refreshGraph" | "refreshTrash"
>;
export type DocsStoreCoordinator = Pick<
  StoreCoordinatorPort,
  "refreshProjectSummary" | "refreshGraph" | "refreshTrash"
>;
export type WorkstreamStoreCoordinator = DocsStoreCoordinator;
export type InboxStoreCoordinator = Pick<
  StoreCoordinatorPort,
  "refreshProjectSummary" | "refreshTrash" | "refreshDocs" | "refreshGraph"
>;
export type GraphStoreCoordinator = Pick<
  StoreCoordinatorPort,
  "refreshProjects" | "refreshProjectSummary" | "refreshInbox"
>;
export type AssistantStoreCoordinator = Pick<
  StoreCoordinatorPort,
  "refreshProjects" | "refreshProjectSummary"
>;
export type SemanticStoreCoordinator = Pick<
  StoreCoordinatorPort,
  | "graphRelationshipMode"
  | "replaceInboxItems"
  | "replaceGraph"
  | "refreshInbox"
  | "refreshProjectSummary"
  | "refreshGraph"
>;
export type SystemStoreCoordinator = Pick<
  StoreCoordinatorPort,
  "refreshProjects" | "refreshAll" | "refreshDocs" | "refreshSessions" | "refreshProjectSummary" | "refreshGraph"
>;
