import type { SystemClientPort } from "../../application/ports/features.js";
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
    private readonly client: SystemClientPort,
    private readonly scope: ScopedProjectPort,
    applicationScope: ApplicationScopePort,
    private readonly coordinator: Pick<SystemStoreCoordinator, "executeCommand">,
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
    try {
      const input = parseOperationInput("memory.commit_import", {
        projectId: token.projectId,
        plan,
        conflictStrategy
      });
      const result = await this.coordinator.executeCommand({
        port: this.client,
        operation: "memory.commit_import",
        input,
        ledger: this.operations,
        key: "import:commit",
        scope: token
      });
      if (!result || !this.scope.isScopeCurrent(token)) {
        const error = this.operations.error;
        if (error) this.resultResource.fail(resourceAttempt, error);
        return;
      }
      this.resultResource.succeed(resourceAttempt, result);
    } catch (error) {
      if (!this.scope.isScopeCurrent(token)) {
        return;
      }
      this.resultResource.fail(resourceAttempt, error);
    }
  }
}
