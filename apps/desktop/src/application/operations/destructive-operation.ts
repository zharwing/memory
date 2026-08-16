import {
  parseOperationOutput,
  type JsonObject,
  type OperationInput,
  type OperationName,
  type OperationOutput
} from "@zharwing/memory-core";
import type { OperationCallOptions } from "../ports/operation-port.js";
import type { FeatureClientPort } from "../ports/features.js";

type DestructiveClientPort = FeatureClientPort<
  "memory.prepare_destructive_intent" | "memory.commit_destructive_intent" |
  "memory.delete_doc" | "memory.delete_inbox_item" | "memory.delete_project" | "memory.delete_repo" |
  "memory.delete_session" | "memory.delete_workstream" | "memory.delete_backup" | "memory.empty_trash" |
  "memory.purge_trash_item" | "memory.restore_trash_item"
>;

export interface PreparedDestructiveOperation<Name extends OperationName> {
  readonly projectId: string;
  readonly operation: Name;
  readonly intentId: string;
  readonly acknowledgement: string;
  readonly options: OperationCallOptions;
}

/** Prepares once and returns the exact capability that must survive uncertainty. */
export async function prepareDestructiveOperation<Name extends OperationName>(
  client: DestructiveClientPort,
  projectId: string,
  operation: Name,
  input: OperationInput<Name>,
  options: OperationCallOptions = {}
): Promise<PreparedDestructiveOperation<Name>> {
  const prepared = await client.operation("memory.prepare_destructive_intent", {
    projectId,
    operation,
    input: input as unknown as JsonObject
  }, options);
  return Object.freeze({
    projectId,
    operation,
    intentId: prepared.intentId,
    acknowledgement: prepared.acknowledgement,
    options
  });
}

/** Builds the retained commit handle used by OperationCoordinator. */
export async function prepareDestructiveDispatch<Name extends OperationName>(
  client: DestructiveClientPort,
  projectId: string,
  operation: Name,
  input: OperationInput<Name>,
  options: OperationCallOptions = {}
): Promise<{ execute(): Promise<OperationOutput<Name>> }> {
  const prepared = await prepareDestructiveOperation(client, projectId, operation, input, options);
  return Object.freeze({
    execute: () => commitPreparedDestructiveOperation(client, prepared)
  });
}

/** Commits an existing capability; callers retain the handle if outcome is unknown. */
export async function commitPreparedDestructiveOperation<Name extends OperationName>(
  client: DestructiveClientPort,
  prepared: PreparedDestructiveOperation<Name>
): Promise<OperationOutput<Name>> {
  const committed = await client.operation("memory.commit_destructive_intent", {
    projectId: prepared.projectId,
    intentId: prepared.intentId,
    acknowledgement: prepared.acknowledgement
  }, prepared.options);
  return parseOperationOutput(prepared.operation, committed.result) as OperationOutput<Name>;
}

/**
 * Converts a locally confirmed click into an expiring, single-use daemon
 * capability. Only the opaque intent and acknowledgement return to the UI;
 * the daemon retains the decoded target and executes it once.
 */
export async function executeConfirmedDestructiveOperation<Name extends OperationName>(
  client: DestructiveClientPort,
  projectId: string,
  operation: Name,
  input: OperationInput<Name>,
  options: OperationCallOptions = {}
): Promise<OperationOutput<Name>> {
  const prepared = await prepareDestructiveOperation(
    client,
    projectId,
    operation,
    input,
    options
  );
  return commitPreparedDestructiveOperation(client, prepared);
}
