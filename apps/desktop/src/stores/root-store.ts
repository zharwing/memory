import { action, makeAutoObservable } from "mobx";
import { createPublicError, type PublicError } from "@zharwing/memory-core";
import type {
  BrowserSessionLockReason,
  BrowserSessionState
} from "@zharwing/memory-api-client";
import type { AppServices } from "../app/composition/ports.js";
import type {
  StoreAsyncRuntimePort,
  StoreCoordinatorPort
} from "../application/operations/store-ports.js";
import {
  ApplicationScopeCoordinator,
  ProjectScopeCoordinator
} from "../application/project-scope/project-scope-coordinator.js";
import {
  publicErrorCopy,
  type ResourceSlot
} from "../application/resources/resource-state.js";
import { AssistantStore } from "./assistant-store.js";
import { DocsStore } from "./docs-store.js";
import { GraphStore } from "./graph-store.js";
import { InboxStore } from "./inbox-store.js";
import { ProjectStore } from "./project-store.js";
import { SemanticStore } from "./semantic-store.js";
import { SessionStore } from "./session-store.js";
import { SystemStore } from "./system-store.js";
import { WorkstreamStore } from "./workstream-store.js";

export type AppRecoveryState =
  | { readonly status: "ready" }
  | { readonly status: "locked"; readonly reason: BrowserSessionLockReason; readonly error: PublicError }
  | { readonly status: "reconciling"; readonly error: PublicError }
  | { readonly status: "offline"; readonly error: PublicError; readonly staleResourceCount: number }
  | { readonly status: "stale"; readonly error: PublicError; readonly staleResourceCount: number }
  | { readonly status: "failed"; readonly error: PublicError };

type RecoveryResourceSlot = ResourceSlot<never> | ResourceSlot<unknown>;
type ReconciliationScope = "application" | "desktop-control" | "project" | "none";

interface ResourceRegistration {
  readonly slot: RecoveryResourceSlot;
  readonly reconciliation: ReconciliationScope;
}

/** Composes stores around one synchronous project-generation authority. */
export class RootStore {
  readonly applicationScope: ApplicationScopeCoordinator;
  readonly projectScope: ProjectScopeCoordinator;
  readonly projects: ProjectStore;
  readonly sessions: SessionStore;
  readonly docs: DocsStore;
  readonly workstreams: WorkstreamStore;
  readonly graph: GraphStore;
  readonly semantic: SemanticStore;
  readonly inbox: InboxStore;
  readonly assistant: AssistantStore;
  readonly system: SystemStore;

  private disposed = false;
  private initializePromise: Promise<void> | undefined;
  private applicationInitialized = false;
  private requestedProjectId: string | undefined;
  private requestedProjectRevision = 0;
  private appliedProjectRevision = 0;
  private unsubscribeScopeReset: (() => void) | undefined;
  private unsubscribeBrowserSession: (() => void) | undefined;
  private readonly browserSession: AppServices["browserSession"];
  private browserSessionState: BrowserSessionState | undefined;

  constructor(services: Pick<
    AppServices,
    "memory" | "scheduler" | "clock" | "ids" | "preferences" | "browserSession"
  >) {
    this.browserSession = services.browserSession;
    this.browserSessionState = services.browserSession?.state;
    this.applicationScope = new ApplicationScopeCoordinator();
    this.projectScope = new ProjectScopeCoordinator();
    const runtime: StoreAsyncRuntimePort = {
      createId: (prefix) => `${prefix}:${services.ids.create()}`,
      now: () => services.clock.now().toISOString()
    };
    const coordinator: StoreCoordinatorPort = {
      refreshAll: () => this.refreshAll(),
      refreshProjects: () => this.projects.load(),
      refreshProjectSummary: () => this.projects.loadSummary(),
      refreshGraph: () => this.graph.load(this.projectScope.captureScope()),
      refreshTrash: () => this.system.loadTrash(),
      refreshDocs: () => this.docs.load(this.projectScope.captureScope()),
      refreshSessions: () => this.sessions.load(this.sessions.requestedLimit, this.projectScope.captureScope()),
      refreshInbox: () => this.inbox.load(this.projectScope.captureScope()),
      resetProjectTransient: () => {
        this.semantic.resetForProjectSwitch();
        this.assistant.resetProviderCheck();
      },
      clearProjectResources: () => this.clearProjectResources(),
      graphRelationshipMode: () => this.graph.relationshipMode,
      replaceInboxItems: (items) => this.inbox.replace(items),
      replaceGraph: (data) => this.graph.replace(data)
    };

    this.projects = new ProjectStore(services.memory, this.projectScope, this.applicationScope, {
      resetProjectTransient: coordinator.resetProjectTransient,
      refreshAll: coordinator.refreshAll,
      clearProjectResources: coordinator.clearProjectResources,
      refreshTrash: coordinator.refreshTrash,
      refreshGraph: coordinator.refreshGraph
    }, runtime);
    this.sessions = new SessionStore(services.memory, this.projectScope, {
      refreshProjectSummary: coordinator.refreshProjectSummary,
      refreshGraph: coordinator.refreshGraph,
      refreshTrash: coordinator.refreshTrash
    }, runtime);
    this.docs = new DocsStore(services.memory, this.projectScope, {
      refreshProjectSummary: coordinator.refreshProjectSummary,
      refreshGraph: coordinator.refreshGraph,
      refreshTrash: coordinator.refreshTrash
    }, runtime);
    this.workstreams = new WorkstreamStore(services.memory, this.projectScope, {
      refreshProjectSummary: coordinator.refreshProjectSummary,
      refreshGraph: coordinator.refreshGraph,
      refreshTrash: coordinator.refreshTrash
    }, runtime);
    this.graph = new GraphStore(services.memory, this.projectScope, {
      refreshProjects: coordinator.refreshProjects,
      refreshProjectSummary: coordinator.refreshProjectSummary,
      refreshInbox: coordinator.refreshInbox
    }, services.preferences, runtime);
    this.semantic = new SemanticStore(services.memory, this.projectScope, {
      graphRelationshipMode: coordinator.graphRelationshipMode,
      replaceInboxItems: coordinator.replaceInboxItems,
      replaceGraph: coordinator.replaceGraph,
      refreshInbox: coordinator.refreshInbox,
      refreshProjectSummary: coordinator.refreshProjectSummary,
      refreshGraph: coordinator.refreshGraph
    }, services.scheduler, runtime);
    this.inbox = new InboxStore(services.memory, this.projectScope, {
      refreshProjectSummary: coordinator.refreshProjectSummary,
      refreshTrash: coordinator.refreshTrash,
      refreshDocs: coordinator.refreshDocs,
      refreshGraph: coordinator.refreshGraph
    }, runtime);
    this.assistant = new AssistantStore(services.memory, this.projectScope, {
      refreshProjects: coordinator.refreshProjects,
      refreshProjectSummary: coordinator.refreshProjectSummary
    }, runtime);
    this.system = new SystemStore(services.memory, this.projectScope, this.applicationScope, {
      refreshProjects: coordinator.refreshProjects,
      refreshAll: coordinator.refreshAll,
      refreshDocs: coordinator.refreshDocs,
      refreshSessions: coordinator.refreshSessions,
      refreshProjectSummary: coordinator.refreshProjectSummary,
      refreshGraph: coordinator.refreshGraph
    }, runtime);

    this.unsubscribeScopeReset = this.projectScope.onScopeReset(() => {
      this.clearProjectResources();
    });
    makeAutoObservable<
      this,
      "disposed" | "initializePromise" | "applicationInitialized" |
      "requestedProjectId" | "requestedProjectRevision" | "appliedProjectRevision" |
      "unsubscribeScopeReset" | "unsubscribeBrowserSession" | "browserSession" |
      "browserSessionState" | "resourceManifest" | "resourceSlots" |
      "reconciliationSlots" | "operationErrors" | "clearReconciledOperations" |
      "initializeLatestProject"
    >(this, {
      applicationScope: false,
      projectScope: false,
      projects: false,
      sessions: false,
      docs: false,
      workstreams: false,
      graph: false,
      semantic: false,
      inbox: false,
      assistant: false,
      system: false,
      disposed: false,
      initializePromise: false,
      applicationInitialized: false,
      requestedProjectId: false,
      requestedProjectRevision: false,
      appliedProjectRevision: false,
      unsubscribeScopeReset: false,
      unsubscribeBrowserSession: false,
      browserSession: false,
      browserSessionState: true,
      resourceManifest: false,
      resourceSlots: false,
      reconciliationSlots: false,
      operationErrors: false,
      clearReconciledOperations: false,
      initializeLatestProject: false
    });
    this.unsubscribeBrowserSession = this.browserSession?.subscribe(action("update browser session state", (state) => {
      this.browserSessionState = state;
    }));
  }

  private get domainStores() {
    return [
      this.projects,
      this.sessions,
      this.docs,
      this.workstreams,
      this.graph,
      this.semantic,
      this.inbox,
      this.assistant,
      this.system
    ];
  }

  /** One declarative registry drives global error, stale, and reconciliation truth. */
  private get resourceManifest(): readonly ResourceRegistration[] {
    return [
      register(this.projects.projectsResource, "application"),
      register(this.projects.summaryResource, "project"),
      register(this.projects.repoLinksResource, "project"),
      register(this.projects.projectCreationPreviewResource, "none"),
      register(this.sessions.listResource, "project"),
      register(this.sessions.detailBodiesResource, "none"),
      register(this.docs.listResource, "project"),
      register(this.docs.searchResource, "none"),
      register(this.workstreams.listResource, "project"),
      register(this.workstreams.detailResource, "none"),
      register(this.graph.graphResource, "project"),
      register(this.semantic.settingsResource, "project"),
      register(this.semantic.statusResource, "project"),
      register(this.semantic.edgesResource, "project"),
      register(this.semantic.runsResource, "project"),
      register(this.inbox.inboxResource, "project"),
      register(this.assistant.statusResource, "project"),
      register(this.assistant.providerCheckResource, "none"),
      register(this.assistant.providerSecretStatusResource, "project"),
      register(this.assistant.contextBundleResource, "project"),
      register(this.system.daemonHealthResource, "application"),
      register(this.system.mcpDoctorResource, "desktop-control"),
      register(this.system.mcpInstallResource, "none"),
      register(this.system.backupsResource, "project"),
      register(this.system.trashResource, "desktop-control"),
      register(this.system.importProfilesResource, "none"),
      register(this.system.importPlanResource, "none"),
      register(this.system.importResultResource, "none")
    ];
  }

  private get resourceSlots(): readonly RecoveryResourceSlot[] {
    return this.resourceManifest.map(({ slot }) => slot);
  }

  private get operationErrors(): readonly PublicError[] {
    return this.domainStores
      .map((store) => store.operations.error)
      .filter((error): error is PublicError => Boolean(error));
  }

  private get reconciliationSlots() {
    const projectActive = Boolean(this.projectScope.captureScope());
    return this.resourceManifest
      .filter(({ reconciliation }) =>
        reconciliation === "application" ||
        (reconciliation === "desktop-control" && !this.browserSession) ||
        (reconciliation === "project" && projectActive)
      )
      .map(({ slot }) => slot);
  }

  get loading(): boolean {
    return this.domainStores.some((store) => store.loading);
  }

  get publicError(): PublicError | undefined {
    return this.operationErrors[0] ?? this.resourceSlots.find((slot) => slot.error)?.error;
  }

  get error(): string {
    return publicErrorCopy(this.publicError);
  }

  get recoveryState(): AppRecoveryState {
    const browserState = this.browserSessionState;
    const unauthorized = this.allErrors.find((error) => error.code === "unauthorized");
    if (browserState?.status === "locked" || unauthorized) {
      return {
        status: "locked",
        reason: browserState?.status === "locked" ? browserState.reason : "unauthorized",
        error: unauthorized ?? this.publicErrorFor("unauthorized")
      };
    }
    const reconciling = this.operationErrors.find((error) => error.retry === "after-reconcile");
    if (reconciling) return { status: "reconciling", error: reconciling };
    const staleResourceCount = this.resourceSlots.filter((slot) =>
      slot.state.status === "failure" && Boolean(slot.state.previous)
    ).length;
    const healthError = this.system.daemonHealthResource.error;
    if (healthError && (healthError.code === "unavailable" || healthError.code === "timeout")) {
      return { status: "offline", error: healthError, staleResourceCount };
    }
    const firstError = this.allErrors[0];
    if (staleResourceCount > 0 && firstError) {
      return { status: "stale", error: firstError, staleResourceCount };
    }
    return firstError ? { status: "failed", error: firstError } : { status: "ready" };
  }

  private get allErrors(): readonly PublicError[] {
    return [
      ...this.operationErrors,
      ...this.resourceSlots.map((slot) => slot.error).filter((error): error is PublicError => Boolean(error))
    ];
  }

  private publicErrorFor(code: "unauthorized"): PublicError {
    return createPublicError(code);
  }

  initialize(preferredProjectId?: string): Promise<void> {
    this.requestedProjectId = preferredProjectId;
    this.requestedProjectRevision += 1;
    // Once the global list is accepted, URL changes can synchronously cancel
    // the previous project's reads instead of waiting for their full latency.
    const requestedProject = preferredProjectId
      ? this.projects.list.find((project) => project.id === preferredProjectId)
      : undefined;
    if (this.applicationInitialized && requestedProject &&
        requestedProject.id !== this.projectScope.currentProjectId()) {
      this.projects.selectProject(requestedProject.id, { refresh: false });
    }
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = this.initializeLatestProject().finally(() => {
      this.initializePromise = undefined;
    });
    return this.initializePromise;
  }

  private async initializeLatestProject(): Promise<void> {
    if (!this.applicationInitialized) {
      await Promise.all([
        this.projects.load(undefined, { activate: false }),
        this.system.loadDaemonHealth()
      ]);
      this.applicationInitialized = true;
    }
    while (!this.disposed && this.appliedProjectRevision < this.requestedProjectRevision) {
      const revision = this.requestedProjectRevision;
      const requestedProjectId = this.requestedProjectId;
      const requestedProject = requestedProjectId
        ? this.projects.list.find((project) => project.id === requestedProjectId)
        : undefined;
      const currentProject = this.projects.list.find(
        (project) => project.id === this.projectScope.currentProjectId()
      );
      const selectedProject = requestedProject ?? currentProject ?? this.projects.list[0];
      if (selectedProject && selectedProject.id !== this.projectScope.currentProjectId()) {
        this.projects.selectProject(selectedProject.id, { refresh: false });
      }
      const token = this.projectScope.captureScope();
      if (token) await this.refreshAll(token);
      this.appliedProjectRevision = revision;
    }
  }

  /** Full reload for the one accepted project generation. */
  async refreshAll(token = this.projectScope.captureScope()): Promise<void> {
    if (!token || !this.projectScope.isScopeCurrent(token)) return;
    await Promise.all([
      this.projects.loadSummary(token),
      this.projects.loadRepoLinks(token),
      this.sessions.load(this.sessions.requestedLimit, token),
      this.docs.load(token),
      this.workstreams.load(token),
      this.inbox.load(token),
      this.graph.load(token),
      this.semantic.load(token),
      this.assistant.loadStatus(token),
      this.assistant.loadContextBundle(token),
      this.system.loadBackups(token)
    ]);
    if (!this.projectScope.isScopeCurrent(token)) return;
    if (this.workstreams.selectedWorkstreamId) {
      await this.workstreams.loadDetail(this.workstreams.selectedWorkstreamId, token);
    }
  }

  /** Re-observe application and selected-project state without retrying an effect. */
  async recover(): Promise<void> {
    const preferredProjectId = this.projects.selectedProjectId || undefined;
    const providerSecretKind = this.assistant.providerSecretKind;
    const applicationReads: Promise<void>[] = [
      this.projects.load(preferredProjectId, { activate: false }),
      this.system.loadDaemonHealth()
    ];
    // MCP configuration and global trash are desktop/admin control-plane
    // observations. A browser principal must not probe operations outside its
    // registry audience merely to recover an unrelated project resource.
    if (!this.browserSession) {
      applicationReads.push(this.system.loadMcpDoctor(), this.system.loadTrash());
    }
    await Promise.all(applicationReads);
    const selectedProject = this.projects.list.find((project) => project.id === preferredProjectId) ??
      this.projects.list[0];
    if (selectedProject) this.projects.selectProject(selectedProject.id, { refresh: false });
    else this.projectScope.clear();
    const token = this.projectScope.captureScope();
    if (token) {
      const projectReads: Promise<void>[] = [this.refreshAll(token)];
      if (providerSecretKind) {
        projectReads.push(this.assistant.loadProviderSecretStatus(providerSecretKind));
      }
      await Promise.all(projectReads);
    }
    if (this.reconciliationSlots.every((slot) => !slot.error)) this.clearReconciledOperations();
  }

  private clearReconciledOperations(): void {
    // Do not erase a concurrently submitting effect. Once every store is idle,
    // clearing terminal ledgers acknowledges only the just-completed
    // authoritative re-observation.
    if (this.domainStores.some((store) => store.operations.isBusy())) return;
    for (const store of this.domainStores) store.operations.reset();
    for (const result of [this.system.mcpInstallResource, this.system.importResultResource]) {
      if (result.error?.retry === "after-reconcile") result.reset();
    }
  }

  clearProjectResources(): void {
    this.projects.clearScoped();
    this.sessions.clear();
    this.docs.clear();
    this.workstreams.clear();
    this.graph.clear();
    this.semantic.clear();
    this.inbox.clear();
    this.assistant.clear();
    this.system.clear();
  }

  setForeground(foreground: boolean): void {
    this.semantic.setForeground(foreground);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeScopeReset?.();
    this.unsubscribeScopeReset = undefined;
    this.unsubscribeBrowserSession?.();
    this.unsubscribeBrowserSession = undefined;
    this.semantic.dispose();
    this.projectScope.dispose();
    this.applicationScope.dispose();
  }
}

function register<T>(
  slot: ResourceSlot<T>,
  reconciliation: ReconciliationScope
): ResourceRegistration {
  return { slot: slot as RecoveryResourceSlot, reconciliation };
}
