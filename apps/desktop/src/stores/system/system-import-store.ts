import type { MemoryClient } from "@zharwing/memory-api-client";
import { parseOperationInput } from "@zharwing/memory-core";
import type {
  ImportCommitResult,
  ImportConflictStrategy,
  ImportPlan,
  ImportProfile
} from "@zharwing/memory-core";
import type { OperationLedger } from "../../application/operations/operation-state.js";
import type {
  ScopedProjectPort,
  StoreAsyncRuntimePort,
  SystemStoreCoordinator
} from "../../application/operations/store-ports.js";
import type { ApplicationScopePort } from "../../application/project-scope/project-scope-coordinator.js";
import { ResourceSlot } from "../../application/resources/resource-state.js";

/** Global import profiles and project-scoped import planning/commit behavior. */
export class SystemImportStore {
  readonly profilesResource: ResourceSlot<ImportProfile[]>;
  readonly planResource: ResourceSlot<ImportPlan>;
  readonly resultResource: ResourceSlot<ImportCommitResult>;

  constructor(
    private readonly client: MemoryClient,
    private readonly scope: ScopedProjectPort,
    applicationScope: ApplicationScopePort,
    private readonly coordinator: Pick<
      SystemStoreCoordinator,
      "refreshDocs" | "refreshSessions" | "refreshProjectSummary" | "refreshGraph"
    >,
    private readonly operations: OperationLedger,
    runtime: StoreAsyncRuntimePort
  ) {
    this.profilesResource = new ResourceSlot(applicationScope, runtime);
    this.planResource = new ResourceSlot(scope, runtime);
    this.resultResource = new ResourceSlot(scope, runtime);
  }

  clear(): void {
    this.planResource.reset();
    this.resultResource.reset();
  }

  async loadProfiles(): Promise<void> {
    const attempt = this.profilesResource.begin();
    if (!attempt) return;
    try {
      const profiles = await this.client.operation("memory.list_import_profiles", {}, {
        signal: attempt.scope.signal
      });
      this.profilesResource.succeed(attempt, profiles);
    } catch (error) {
      this.profilesResource.fail(attempt, error);
    }
  }

  async prepare(args: {
    sourceRoot: string;
    profile: string;
    limit?: number;
  }): Promise<void> {
    const token = this.scope.captureScope();
    if (!token) return;
    const attempt = this.planResource.begin(token);
    if (!attempt) return;
    this.resultResource.reset();
    try {
      const plan = await this.client.operation("memory.prepare_import", {
        projectId: token.projectId,
        sourceRoot: args.sourceRoot,
        profile: args.profile,
        limit: args.limit
      }, { signal: token.signal });
      this.planResource.succeed(attempt, plan);
    } catch (error) {
      this.planResource.fail(attempt, error);
    }
  }

  async commit(conflictStrategy: ImportConflictStrategy | string): Promise<void> {
    const token = this.scope.captureScope();
    const plan = this.planResource.data;
    if (!token || !plan) return;
    const resourceAttempt = this.resultResource.begin(token);
    if (!resourceAttempt) return;
    const operation = this.operations.begin("commit-import", token);
    try {
      const input = parseOperationInput("memory.commit_import", {
        projectId: token.projectId,
        plan,
        conflictStrategy
      });
      const result = await this.client.operation("memory.commit_import", input, {
        signal: token.signal
      });
      if (!this.scope.isScopeCurrent(token)) {
        this.operations.abandon(operation);
        return;
      }
      this.operations.succeed(operation, result);
      this.resultResource.succeed(resourceAttempt, result);
      await this.coordinator.refreshDocs();
      if (!this.scope.isScopeCurrent(token)) return;
      await this.coordinator.refreshSessions();
      if (!this.scope.isScopeCurrent(token)) return;
      await this.coordinator.refreshProjectSummary();
      if (this.scope.isScopeCurrent(token)) await this.coordinator.refreshGraph();
    } catch (error) {
      if (!this.scope.isScopeCurrent(token)) {
        this.operations.abandon(operation);
        return;
      }
      this.operations.fail(operation, error);
      this.resultResource.fail(resourceAttempt, error);
    }
  }
}
