import {
  extractOperationProjectId,
  type OperationInput,
  type OperationName,
  type OperationOutput
} from "@zharwing/memory-core";
import type { OperationPort, OperationCallOptions } from "../ports/operation-port.js";
import type { ScopeToken } from "../project-scope/project-scope-coordinator.js";
import type { ResourceInvalidationBus } from "../resources/resource-invalidation-bus.js";
import type { ResourceRegistry } from "../resources/resource-registry.js";
import { toPublicError } from "../resources/resource-state.js";
import type { StoreAsyncRuntimePort } from "./store-ports.js";
import type { OperationLedger } from "./operation-state.js";
import { CommandRegistry } from "./command-registry.js";

export interface ExecuteCommandOptions<Name extends OperationName> {
  readonly port: OperationPort<Name>;
  readonly operation: Name;
  readonly input: OperationInput<Name>;
  readonly ledger: OperationLedger;
  readonly key?: string;
  readonly scope?: ScopeToken;
  readonly call?: Omit<OperationCallOptions, "idempotencyKey" | "expectedRevision">;
  /** Compatibility seam for daemon-authorized destructive prepare/commit. */
  readonly dispatch?: (operationId: string) => Promise<OperationOutput<Name>>;
  /**
   * Creates a durable dispatch handle once. The coordinator retains it while
   * an outcome is unknown so a manual retry commits the same capability.
   */
  readonly prepareDispatch?: (
    operationId: string
  ) => Promise<{ execute(): Promise<OperationOutput<Name>> }>;
}

/** Owns command identity, reconciliation, invalidation, and reobservation order. */
export class OperationCoordinator {
  private readonly preparedDispatches = new Map<
    string,
    Promise<{ execute(): Promise<unknown> }>
  >();

  constructor(
    private readonly commands: CommandRegistry,
    private readonly resources: ResourceRegistry,
    private readonly invalidations: ResourceInvalidationBus,
    private readonly runtime: StoreAsyncRuntimePort,
    private readonly sourceInstanceId: string
  ) {}

  async execute<Name extends OperationName>(
    options: ExecuteCommandOptions<Name>
  ): Promise<OperationOutput<Name> | undefined> {
    const descriptor = this.commands.get(options.operation);
    const digest = descriptor.canonicalInputDigest(options.input);
    const attempt = options.ledger.beginOrResume(
      options.key ?? `${options.operation}:${digest}`,
      options.scope
    );
    if (!attempt) return undefined;

    try {
      const result = options.prepareDispatch
        ? await this.executePrepared(options, attempt.operationId)
        : options.dispatch
          ? await options.dispatch(attempt.operationId)
          : await options.port.operation(options.operation, options.input, {
            ...options.call,
            signal: options.call?.signal ?? options.scope?.signal,
            idempotencyKey: attempt.operationId,
            expectedRevision: descriptor.expectedRevision?.(options.input)
          });
      if (!options.ledger.succeed(attempt, result)) {
        this.preparedDispatches.delete(attempt.operationId);
        return undefined;
      }
      this.preparedDispatches.delete(attempt.operationId);
      await this.reobserveAndPublish(options.operation, options.input, attempt.operationId);
      return result;
    } catch (error) {
      const publicError = toPublicError(error);
      if (publicError.retry !== "after-reconcile") {
        options.ledger.failDefinitively(attempt, publicError);
        this.preparedDispatches.delete(attempt.operationId);
        return undefined;
      }

      options.ledger.reconcile(attempt, publicError);
      if (!descriptor.reconcile) return undefined;
      const reconciliation = await descriptor.reconcile(options.input, attempt.operationId);
      if (reconciliation.status === "unknown") return undefined;
      if (reconciliation.status === "failed") {
        options.ledger.failDefinitively(attempt, reconciliation.error);
        this.preparedDispatches.delete(attempt.operationId);
        return undefined;
      }
      if (!options.ledger.succeed(attempt, reconciliation.result)) {
        this.preparedDispatches.delete(attempt.operationId);
        return undefined;
      }
      this.preparedDispatches.delete(attempt.operationId);
      await this.reobserveAndPublish(options.operation, options.input, attempt.operationId);
      return reconciliation.result;
    }
  }

  private async executePrepared<Name extends OperationName>(
    options: ExecuteCommandOptions<Name>,
    operationId: string
  ): Promise<OperationOutput<Name>> {
    let prepared = this.preparedDispatches.get(operationId);
    if (!prepared) {
      prepared = options.prepareDispatch!(operationId) as Promise<{
        execute(): Promise<unknown>;
      }>;
      this.preparedDispatches.set(operationId, prepared);
    }
    const handle = await prepared;
    return handle.execute() as Promise<OperationOutput<Name>>;
  }

  private async reobserveAndPublish<Name extends OperationName>(
    operation: Name,
    input: OperationInput<Name>,
    eventId: string
  ): Promise<void> {
    const descriptor = this.commands.get(operation);
    await this.resources.invalidate(descriptor.invalidates);
    this.invalidations.publish({
      version: 1,
      eventId,
      sourceInstanceId: this.sourceInstanceId,
      projectId: extractOperationProjectId(operation, input),
      resourceTags: descriptor.invalidates,
      timestamp: Date.parse(this.runtime.now())
    });
  }
}
