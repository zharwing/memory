import { makeAutoObservable } from "mobx";
import { ZharwingMemoryClient } from "@zharwing/memory-api-client";
import { AssistantStore } from "./assistant-store.js";
import { DocsStore } from "./docs-store.js";
import { GraphStore } from "./graph-store.js";
import { InboxStore } from "./inbox-store.js";
import { ProjectStore } from "./project-store.js";
import { SemanticStore } from "./semantic-store.js";
import { SessionStore } from "./session-store.js";
import { SystemStore } from "./system-store.js";
import { WorkstreamStore } from "./workstream-store.js";

/**
 * Thin composer over the domain stores. Each domain owns its data, actions,
 * and its own `loading`/`error` pair; the root only aggregates those flags
 * for the Shell banner and coordinates full project reloads.
 */
export class RootStore {
  readonly client = new ZharwingMemoryClient();
  readonly projects: ProjectStore;
  readonly sessions: SessionStore;
  readonly docs: DocsStore;
  readonly workstreams: WorkstreamStore;
  readonly graph: GraphStore;
  readonly semantic: SemanticStore;
  readonly inbox: InboxStore;
  readonly assistant: AssistantStore;
  readonly system: SystemStore;

  constructor() {
    this.projects = new ProjectStore(this.client, this);
    this.sessions = new SessionStore(this.client, this);
    this.docs = new DocsStore(this.client, this);
    this.workstreams = new WorkstreamStore(this.client, this);
    this.graph = new GraphStore(this.client, this);
    this.semantic = new SemanticStore(this.client, this);
    this.inbox = new InboxStore(this.client, this);
    this.assistant = new AssistantStore(this.client, this);
    this.system = new SystemStore(this.client, this);
    makeAutoObservable(this, {
      client: false,
      projects: false,
      sessions: false,
      docs: false,
      workstreams: false,
      graph: false,
      semantic: false,
      inbox: false,
      assistant: false,
      system: false
    });
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

  get loading() {
    return this.domainStores.some((store) => store.loading);
  }

  get error() {
    return this.domainStores.find((store) => store.error)?.error || "";
  }

  /** Full reload of every project-scoped domain; used on startup and project switch. */
  async refreshAll() {
    if (!this.projects.selectedProjectId) return;
    await Promise.all([
      this.projects.loadSummary(),
      this.sessions.load(),
      this.docs.load(),
      this.workstreams.load(),
      this.inbox.load(),
      this.graph.load(),
      this.semantic.refreshStatus(),
      this.assistant.loadStatus(),
      this.assistant.loadContextBundle()
    ]);
    if (this.workstreams.selectedWorkstreamId) await this.workstreams.loadDetail(this.workstreams.selectedWorkstreamId);
  }

  dispose() {
    this.semantic.dispose();
  }
}
