import type { MemoryClient, OperationOptions } from "@zharwing/memory-api-client";
import {
  parseOperationOutput,
  type JsonObject,
  type OperationInput,
  type OperationName,
  type OperationOutput
} from "@zharwing/memory-core";

/**
 * Converts a locally confirmed click into an expiring, single-use daemon
 * capability. Only the opaque intent and acknowledgement return to the UI;
 * the daemon retains the decoded target and executes it once.
 */
export async function executeConfirmedDestructiveOperation<Name extends OperationName>(
  client: MemoryClient,
  projectId: string,
  operation: Name,
  input: OperationInput<Name>,
  options: OperationOptions = {}
): Promise<OperationOutput<Name>> {
  const { idempotencyKey: _localAttemptKey, ...transportOptions } = options;
  const prepared = await client.operation("memory.prepare_destructive_intent", {
    projectId,
    operation,
    input: input as unknown as JsonObject
  }, transportOptions);
  const committed = await client.operation("memory.commit_destructive_intent", {
    projectId,
    intentId: prepared.intentId,
    acknowledgement: prepared.acknowledgement
  }, transportOptions);
  return parseOperationOutput(operation, committed.result) as OperationOutput<Name>;
}
