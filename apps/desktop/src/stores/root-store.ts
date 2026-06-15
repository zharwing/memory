import { makeAutoObservable, runInAction } from "mobx";
import { AimemClient } from "@aimem/api-client";

export class RootStore {
  client = new AimemClient();
  projects: any[] = [];
  selectedProjectId = "";
  summary: any = undefined;
  sessions: any[] = [];
  docs: any[] = [];
  inbox: any[] = [];
  graph: any = undefined;
  contextBundle: any = undefined;
  searchResults: any[] = [];
  loading = false;
  error = "";

  constructor() {
    makeAutoObservable(this);
  }

  get selectedProject() {
    return this.projects.find((project) => project.id === this.selectedProjectId);
  }

  async loadProjects() {
    await this.run(async () => {
      const projects = (await this.client.call("memory.list_projects")) as any[];
      runInAction(() => {
        this.projects = projects;
        if (!this.selectedProjectId && projects[0]) this.selectedProjectId = projects[0].id;
      });
    });
  }

  async selectProject(projectId: string) {
    this.selectedProjectId = projectId;
    await this.refreshProject();
  }

  async refreshProject() {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      const [summary, sessions, docs, inbox, graph, contextBundle] = await Promise.all([
        this.client.call("memory.get_project_summary", { projectId: this.selectedProjectId }),
        this.client.call("memory.list_project_sessions", { projectId: this.selectedProjectId, limit: 20 }),
        this.client.call("memory.list_docs", { projectId: this.selectedProjectId }),
        this.client.call("memory.list_inbox", { projectId: this.selectedProjectId }),
        this.client.call("memory.get_graph", { projectId: this.selectedProjectId }),
        this.client.call("memory.preview_context_bundle", { projectId: this.selectedProjectId, requestedBy: "desktop" })
      ]);
      runInAction(() => {
        this.summary = summary;
        this.sessions = sessions as any[];
        this.docs = docs as any[];
        this.inbox = inbox as any[];
        this.graph = graph;
        this.contextBundle = contextBundle;
      });
    });
  }

  async startSession(taskTitle: string) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.start_session", {
        projectId: this.selectedProjectId,
        taskTitle,
        agent: "manual",
        client: "desktop",
        workingDirectory: this.selectedProject?.repos?.[0]?.path
      });
      await this.refreshProject();
    });
  }

  async saveCheckpoint(sessionId: string, summary: string) {
    if (!this.selectedProjectId) return;
    await this.run(async () => {
      await this.client.call("memory.save_checkpoint", {
        projectId: this.selectedProjectId,
        sessionId,
        summary
      });
      await this.refreshProject();
    });
  }

  async search(query: string) {
    if (!this.selectedProjectId || !query.trim()) {
      this.searchResults = [];
      return;
    }
    await this.run(async () => {
      const results = await this.client.call("memory.search", {
        projectId: this.selectedProjectId,
        query
      });
      runInAction(() => {
        this.searchResults = results as any[];
      });
    });
  }

  async run(work: () => Promise<void>) {
    this.loading = true;
    this.error = "";
    try {
      await work();
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : String(error);
      });
    } finally {
      runInAction(() => {
        this.loading = false;
      });
    }
  }
}
