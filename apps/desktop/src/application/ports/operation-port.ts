import type {
  OperationInput,
  OperationName,
  OperationOutput
} from "@zharwing/memory-core";

/** Transport-neutral call controls owned by the desktop application layer. */
export interface OperationCallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  correlationId?: string;
  idempotencyKey?: string;
  expectedRevision?: number;
}

export type OperationPortArguments<Name extends OperationName> =
  keyof OperationInput<Name> extends never
    ? [input?: OperationInput<Name>, options?: OperationCallOptions]
    : [input: OperationInput<Name>, options?: OperationCallOptions];

/** A consumer-owned subset of the closed operation registry. */
export type OperationPort<Names extends OperationName> = {
  operation<Name extends Names>(
    name: Name,
    ...args: OperationPortArguments<Name>
  ): Promise<OperationOutput<Name>>;
};
