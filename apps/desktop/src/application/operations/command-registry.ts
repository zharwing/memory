import {
  getOperationDefinition,
  operationRegistryManifest,
  type OperationInput,
  type OperationName,
  type OperationOutput,
  type ResourceId
} from "@zharwing/memory-core";

export type CommandScope = "application" | "project";
export type CommandUnknownPolicy = "readback" | "manual";

export type CommandReconciliation<Name extends OperationName> =
  | { readonly status: "succeeded"; readonly result: OperationOutput<Name> }
  | { readonly status: "failed"; readonly error: unknown }
  | { readonly status: "unknown" };

export interface CommandDescriptor<Name extends OperationName = OperationName> {
  readonly operation: Name;
  readonly scope: CommandScope;
  readonly unknownPolicy: CommandUnknownPolicy;
  readonly canonicalInputDigest: (input: OperationInput<Name>) => string;
  readonly expectedRevision?: (input: OperationInput<Name>) => number | undefined;
  readonly reconcile?: (
    input: OperationInput<Name>,
    operationId: string
  ) => Promise<CommandReconciliation<Name>>;
  readonly invalidates: readonly ResourceId[];
}

export type CommandDescriptorOverrides = Partial<{
  [Name in OperationName]: Pick<
    CommandDescriptor<Name>,
    "scope" | "unknownPolicy" | "expectedRevision" | "reconcile"
  >;
}>;

/** Closed command metadata; invalidation always comes from core definitions. */
export class CommandRegistry {
  readonly #descriptors = new Map<OperationName, CommandDescriptor>();

  constructor(overrides: CommandDescriptorOverrides = {}) {
    for (const manifest of operationRegistryManifest()) {
      if (manifest.effect === "read") continue;
      const operation = manifest.name;
      const override = overrides[operation] as CommandDescriptor | undefined;
      this.#descriptors.set(operation, {
        operation,
        scope: override?.scope ?? (manifest.projectScope === "required" ? "project" : "application"),
        unknownPolicy: override?.reconcile ? "readback" : (override?.unknownPolicy ?? "manual"),
        canonicalInputDigest,
        expectedRevision: override?.expectedRevision,
        reconcile: override?.reconcile,
        get invalidates() {
          return getOperationDefinition(operation).invalidates;
        }
      });
    }
  }

  get<Name extends OperationName>(operation: Name): CommandDescriptor<Name> {
    const descriptor = this.#descriptors.get(operation);
    if (!descriptor) throw new Error(`${operation} is not a command operation.`);
    return descriptor as CommandDescriptor<Name>;
  }

  has(operation: OperationName): boolean {
    return this.#descriptors.has(operation);
  }
}

export function canonicalInputDigest(input: unknown): string {
  const text = canonicalJson(input);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`
  ).join(",")}}`;
}
