import { action, makeAutoObservable, observable, runInAction } from "mobx";
import {
  createPublicError,
  type PublicError,
  type ResourceId
} from "@zharwing/memory-core";
import type {
  BrowserSessionLockReason,
  BrowserSessionState
} from "@zharwing/memory-api-client";
import type { AppServices } from "../app/composition/ports.js";
import type { DesktopFeaturePorts } from "../application/ports/features.js";
import type { GraphRelationshipPreferenceStore } from "../application/persistence/app-persistence.js";
import type {
  StoreAsyncRuntimePort,
  StoreCoordinatorPort
} from "../application/operations/store-ports.js";
import {
  ApplicationScopeCoordinator,
  ProjectScopeCoordinator
} from "../application/project-scope/project-scope-coordinator.js";
import { ProjectLifecycleRegistry } from "../application/project-scope/project-lifecycle-registry.js";
import { CommandRegistry } from "../application/operations/command-registry.js";
import { OperationCoordinator } from "../application/operations/operation-coordinator.js";
import type { ResourceInvalidationBus } from "../application/resources/resource-invalidation-bus.js";
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
import {
  ResourceRegistry,
  type ResourceDescriptor
} from "../application/resources/resource-registry.js";

export type AppRecoveryState =
  | { readonly status: "ready" }
  | { readonly status: "locked"; readonly reason: BrowserSessionLockReason; readonly error: PublicError }
  | { readonly status: "reconciling"; readonly error: PublicError }
  | { readonly status: "offline"; readonly error: PublicError; readonly staleResourceCount: number }
  | { readonly status: "stale"; readonly error: PublicError; readonly staleResourceCount: number }
  | { readonly status: "failed"; readonly error: PublicError };

type RecoveryResourceSlot = ResourceSlot<never> | ResourceSlot<unknown>;

export interface RootStoreServices extends Pick<
  AppServices,
  "scheduler" | "clock" | "ids" | "browserSession"
> {
  readonly features: DesktopFeaturePorts;
  readonly invalidations: ResourceInvalidationBus;
  readonly graphPreferences: GraphRelationshipPreferenceStore;
}

/** Composes stores around one synchronous project-generation authority. */
export class RootStore {
  readonly resourceRegistry: ResourceRegistry;
  readonly commandRegistry: CommandRegistry;
  readonly operationCoordinator: OperationCoordinator;
  readonly lifecycle: ProjectLifecycleRegistry;
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
  private resumeRevalidationPromise: Promise<void> | undefined;
  private unsubscribeBrowserSession: (() => void) | undefined;
  private readonly browserSession: AppServices["browserSession"];
  private browserSessionState: BrowserSessionState | undefined;

  get hasBrowserSession(): boolean {
    return Boolean(this.browserSession);
  }

  constructor(services: RootStoreServices) {
    this.browserSession = services.browserSession;
    this.browserSessionState = services.browserSession?.state;
    this.applicationScope = new ApplicationScopeCoordinator();
    this.projectScope = new ProjectScopeCoordinator();
    const runtime: StoreAsyncRuntimePort = {
      createId: (prefix) => `${prefix}:${services.ids.create()}`,
      now: () => services.clock.now().toISOString()
    };
    const coordinator: StoreCoordinatorPort = {
      executeCommand: (options) => this.operationCoordinator.execute(options),
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

    this.projects = new ProjectStore(
      services.features.projects,
      this.projectScope,
      this.applicationScope,
      coordinator,
      runtime
    );
    this.sessions = new SessionStore(services.features.sessions, this.projectScope, coordinator, runtime);
    this.docs = new DocsStore(services.features.docs, this.projectScope, coordinator, runtime);
    this.workstreams = new WorkstreamStore(services.features.workstreams, this.projectScope, coordinator, runtime);
    this.graph = new GraphStore(
      services.features.graph,
      this.projectScope,
      coordinator,
      services.graphPreferences,
      runtime
    );
    this.semantic = new SemanticStore(services.features.semantic, this.projectScope, {
      executeCommand: (options) => this.operationCoordinator.execute(options),
      graphRelationshipMode: coordinator.graphRelationshipMode,
      replaceInboxItems: coordinator.replaceInboxItems,
      replaceGraph: coordinator.replaceGraph,
      refreshInbox: coordinator.refreshInbox,
      refreshProjectSummary: coordinator.refreshProjectSummary,
      refreshGraph: coordinator.refreshGraph
    }, services.scheduler, runtime);
    this.inbox = new InboxStore(services.features.inbox, this.projectScope, coordinator, runtime);
    this.assistant = new AssistantStore(services.features.assistant, this.projectScope, coordinator, runtime);
    this.system = new SystemStore(
      services.features.system,
      this.projectScope,
      this.applicationScope,
      coordinator,
      runtime
    );
    this.resourceRegistry = new ResourceRegistry(createResourceDescriptors(this));
    this.commandRegistry = new CommandRegistry();
    this.operationCoordinator = new OperationCoordinator(
      this.commandRegistry,
      this.resourceRegistry,
      services.invalidations,
      runtime,
      services.invalidations.sourceInstanceId
    );
    this.lifecycle = new ProjectLifecycleRegistry(this.projectScope, [
      participant("projects", 10, () => this.projects.clearScoped()),
      participant("sessions", 20, () => this.sessions.clear()),
      participant("documents", 30, () => this.docs.clear()),
      participant("workstreams", 40, () => this.workstreams.clear()),
      participant("graph", 50, () => this.graph.clear()),
      participant("semantic", 60, () => this.semantic.clear(), () => this.semantic.dispose()),
      participant("inbox", 70, () => this.inbox.clear()),
      participant("assistant", 80, () => this.assistant.clear()),
      participant("system", 90, () => this.system.clear())
    ]);
    makeAutoObservable<
      this,
      "disposed" | "initializePromise" | "applicationInitialized" |
      "requestedProjectId" | "requestedProjectRevision" | "appliedProjectRevision" |
      "resumeRevalidationPromise" |
      "unsubscribeBrowserSession" | "browserSession" |
      "browserSessionState" | "resourceSlots" |
      "operationErrors" |
      "initializeLatestProject" | "resourceRegistry"
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
      resourceRegistry: false,
      commandRegistry: false,
      operationCoordinator: false,
      lifecycle: false,
      disposed: false,
      initializePromise: false,
      applicationInitialized: false,
      requestedProjectId: false,
      requestedProjectRevision: observable,
      appliedProjectRevision: observable,
      resumeRevalidationPromise: false,
      unsubscribeBrowserSession: false,
      browserSession: false,
      browserSessionState: true,
      resourceSlots: false,
      operationErrors: false,
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

  /** Complete observation set used only for aggregate recovery presentation. */
  private get resourceSlots(): readonly RecoveryResourceSlot[] {
    return [
      this.projects.projectsResource,
      this.projects.summaryResource,
      this.projects.repoLinksResource,
      this.projects.projectCreationPreviewResource,
      this.sessions.listResource,
      this.sessions.detailBodiesResource,
      this.docs.listResource,
      this.docs.searchResource,
      this.workstreams.listResource,
      this.workstreams.detailResource,
      this.graph.graphResource,
      this.semantic.settingsResource,
      this.semantic.statusResource,
      this.semantic.edgesResource,
      this.semantic.runsResource,
      this.inbox.inboxResource,
      this.assistant.statusResource,
      this.assistant.providerCheckResource,
      this.assistant.providerSecretStatusResource,
      this.assistant.contextBundleResource,
      this.system.daemonHealthResource,
      this.system.mcpDoctorResource,
      this.system.mcpInstallResource,
      this.system.backupsResource,
      this.system.trashResource,
      this.system.importProfilesResource,
      this.system.importPlanResource,
      this.system.importResultResource
    ] as readonly RecoveryResourceSlot[];
  }

  private get operationErrors(): readonly PublicError[] {
    return this.domainStores
      .map((store) => store.operations.error)
      .filter((error): error is PublicError => Boolean(error));
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

  /** True only after the requested URL project generation finished its initial observation. */
  isProjectRouteReady(projectId: string | undefined): boolean {
    // Application-scoped routes do not require a project generation. App owns
    // the projects-list loading/failure gate separately, so keeping these
    // routes behind application initialization can strand a fresh empty store
    // on "Switching project..." while unrelated application reads settle.
    if (!projectId) return true;
    return projectId === this.projectScope.currentProjectId() &&
      this.appliedProjectRevision === this.requestedProjectRevision;
  }

  private async initializeLatestProject(): Promise<void> {
    if (!this.applicationInitialized) {
      await Promise.all([
        this.projects.load(undefined, { activate: false }),
        this.system.loadDaemonHealth()
      ]);
      runInAction(() => {
        this.applicationInitialized = true;
      });
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
      runInAction(() => {
        this.appliedProjectRevision = revision;
      });
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

  /** Authoritative focus/resume revalidation; cross-tab messages are best-effort only. */
  revalidateOnResume(): Promise<void> {
    if (this.resumeRevalidationPromise) return this.resumeRevalidationPromise;
    this.resumeRevalidationPromise = (async () => {
      const preferredProjectId = this.projects.selectedProjectId || undefined;
      await this.projects.load(preferredProjectId, { activate: false });
      const token = this.projectScope.captureScope();
      if (token) await this.refreshAll(token);
    })().finally(() => {
      this.resumeRevalidationPromise = undefined;
    });
    return this.resumeRevalidationPromise;
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
  }

  clearProjectResources(): void {
    const current = this.projectScope.captureScope();
    this.lifecycle.reset("clear", current, current);
  }

  setForeground(foreground: boolean): void {
    this.semantic.setForeground(foreground);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unsubscribeBrowserSession?.();
    this.unsubscribeBrowserSession = undefined;
    this.lifecycle.dispose();
    this.resourceRegistry.dispose();
    this.projectScope.dispose();
    this.applicationScope.dispose();
  }
}

function participant(
  id: string,
  order: number,
  reset: () => void,
  dispose?: () => void
) {
  return { id, order, reset, dispose };
}

function createResourceDescriptors(store: RootStore): Record<ResourceId, ResourceDescriptor> {
  const projectReset = () => store.clearProjectResources();
  const noopReset = () => undefined;
  const descriptor = (
    owner: string,
    scope: ResourceDescriptor["scope"],
    load: () => Promise<void>,
    reset: () => void = projectReset,
    reconcile: () => Promise<void> = load
  ): ResourceDescriptor => ({ owner, scope, load, reset, reconcile });
  const current = () => store.projectScope.captureScope();
  const loadSemantic = () => store.semantic.load(current());
  const loadProjects = () => store.projects.load(store.projects.selectedProjectId || undefined, { activate: false });
  const loadSummary = () => store.projects.loadSummary(current());

  return {
    "assistant-policy": descriptor("assistant-status", "project", () => store.assistant.loadStatus(current())),
    "assistant-status": descriptor("assistant-status", "project", () => store.assistant.loadStatus(current())),
    backups: descriptor("backups", "project", () => store.system.loadBackups(current())),
    "context-bundles": descriptor("assistant-context", "project", () => store.assistant.loadContextBundle(current())),
    documents: descriptor("documents", "project", () => store.docs.load(current())),
    inbox: descriptor("inbox", "project", () => store.inbox.load(current())),
    "mcp-installation": descriptor("mcp", "application", () => store.system.loadMcpDoctor(), noopReset),
    "project-content": descriptor("project-content", "project", () => store.refreshAll(current())),
    "project-graph": descriptor("graph", "project", () => store.graph.load(current())),
    "project-index": descriptor("documents", "project", () => store.docs.load(current())),
    "project-policy": descriptor("project-summary", "project", async () => { await Promise.all([loadProjects(), loadSummary()]); }),
    "project-repos": descriptor("project-repos", "project", () => store.projects.loadRepoLinks(current())),
    "project-summary": descriptor("project-summary", "project", loadSummary),
    "project-workspace": descriptor("project-workspace", "project", () => store.refreshAll(current())),
    projects: descriptor("projects", "application", loadProjects, noopReset),
    "provider-secret-status": descriptor("provider-secret", "project", async () => {
      if (store.assistant.providerSecretKind) {
        await store.assistant.loadProviderSecretStatus(store.assistant.providerSecretKind);
      }
    }),
    search: descriptor("search", "project", async () => { store.docs.searchResource.reset(); }),
    "semantic-edges": descriptor("semantic", "project", loadSemantic),
    "semantic-runs": descriptor("semantic", "project", loadSemantic),
    "semantic-settings": descriptor("semantic", "project", loadSemantic),
    "semantic-status": descriptor("semantic", "project", loadSemantic),
    sessions: descriptor("sessions", "project", () => store.sessions.load(store.sessions.requestedLimit, current())),
    trash: descriptor("trash", "desktop-control", async () => {
      if (!store.hasBrowserSession) await store.system.loadTrash(current());
    }),
    workstreams: descriptor("workstreams", "project", () => store.workstreams.load(current()))
  };
}
