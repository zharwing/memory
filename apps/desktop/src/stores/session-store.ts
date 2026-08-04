import { makeAutoObservable, runInAction } from "mobx";
import type { ZharwingMemoryClient } from "@zharwing/memory-api-client";
import type { SessionSummary } from "@zharwing/memory-core";
import type { RootStore } from "./root-store.js";

/** Session list rows; the daemon returns summaries and the store lazily merges the Markdown body. */
export type SessionListItem = SessionSummary & { body?: string };

export class SessionStore {
  list: SessionListItem[] = [];
  loading = false;
  error = "";

  constructor(
    readonly client: ZharwingMemoryClient,
    readonly root: RootStore
  ) {
    makeAutoObservable(this, {
      client: false,
      root: false
    });
  }

  private get projectId() {
    return this.root.projects.selectedProjectId;
  }

  clear() {
    this.list = [];
  }

  async load() {
    if (!this.projectId) return;
    await this.run(async () => {
      const sessions = await this.client.call<SessionListItem[]>("memory.list_project_sessions", {
        projectId: this.projectId,
        limit: 20
      });
      runInAction(() => {
        this.list = sessions;
      });
    });
  }

  async loadAll() {
    if (!this.projectId) return;
    await this.run(async () => {
      const sessions = await this.client.call<SessionListItem[]>("memory.list_project_sessions", {
        projectId: this.projectId
      });
      runInAction(() => {
        this.list = sessions;
      });
    });
  }

  async loadDetail(sessionId: string) {
    if (!this.projectId || !sessionId) return;
    await this.run(async () => {
      const detail = await this.client.call("memory.get_session_detail", {
        projectId: this.projectId,
        sessionId,
        sections: ["body"]
      }) as { body?: string };
      runInAction(() => {
        this.list = this.list.map((session) =>
          session.id === sessionId ? { ...session, body: detail.body ?? "" } : session
        );
      });
    });
  }

  async startSession(taskTitle = "", workstreamIds: string[] = []) {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.start_session", {
        projectId: this.projectId,
        taskTitle: taskTitle.trim() || undefined,
        agent: "manual",
        client: "desktop",
        workingDirectory: this.root.projects.selectedProject?.repos?.[0]?.path,
        workstreamIds
      });
      await this.load();
      await this.root.projects.loadSummary();
    });
  }

  async closeSession(sessionId: string, summary = "") {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.close_session", {
        projectId: this.projectId,
        sessionId,
        summary: summary.trim() || undefined,
        autoSummarize: true
      });
      await this.load();
      await this.root.projects.loadSummary();
    });
  }

  /** Closes every session left active on an earlier day, without starting a new one. */
  async closeStaleSessions() {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.close_stale_sessions", {
        projectId: this.projectId
      });
      await this.load();
      await this.root.projects.loadSummary();
    });
  }

  async deleteSession(sessionId: string) {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.delete_session", {
        projectId: this.projectId,
        sessionId
      });
      await this.load();
      await this.root.projects.loadSummary();
      await this.root.graph.load();
      await this.root.system.loadTrash();
    });
  }

  async updateGraphVisibility(sessionId: string, includeInGraph: boolean) {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.update_session_graph_visibility", {
        projectId: this.projectId,
        sessionId,
        includeInGraph
      });
      await this.load();
      await this.root.graph.load();
    });
  }

  async generateSummary(sessionId: string, force = true) {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.generate_session_summary", {
        projectId: this.projectId,
        sessionId,
        force
      });
      await this.load();
      await this.root.projects.loadSummary();
    });
  }

  async generateSummaries(mode: "missing" | "all" = "missing") {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.generate_session_summaries", {
        projectId: this.projectId,
        mode
      });
      await this.load();
      await this.root.projects.loadSummary();
    });
  }

  async saveCheckpoint(sessionId: string, summary: string) {
    if (!this.projectId) return;
    await this.run(async () => {
      await this.client.call("memory.save_checkpoint", {
        projectId: this.projectId,
        sessionId,
        summary
      });
      await this.load();
      await this.root.projects.loadSummary();
    });
  }

  private async run(work: () => Promise<void>) {
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
