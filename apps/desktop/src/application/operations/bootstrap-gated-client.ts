import type {
  MemoryClient,
  OperationArguments
} from "@zharwing/memory-api-client";
import type {
  OperationName,
  OperationOutput
} from "@zharwing/memory-core";

/** Holds initial operations until the one-shot fragment exchange settles. */
export class BootstrapGatedMemoryClient implements MemoryClient {
  constructor(
    private readonly delegate: MemoryClient,
    private readonly readiness: Promise<unknown>
  ) {}

  async operation<Name extends OperationName>(
    name: Name,
    ...args: OperationArguments<Name>
  ): Promise<OperationOutput<Name>> {
    await this.readiness;
    return this.delegate.operation(name, ...args);
  }
}
