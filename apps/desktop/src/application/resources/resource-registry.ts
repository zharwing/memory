import {
  RESOURCE_IDS,
  operationRegistryManifest,
  type ResourceId
} from "@zharwing/memory-core";

export type ResourceScope = "application" | "project" | "desktop-control";
export type ResourceResetReason = "project-change" | "application-dispose" | "manual";

export interface ResourceDescriptor {
  /** Stable owner identity used to deduplicate tags that share one load. */
  readonly owner: string;
  readonly scope: ResourceScope;
  readonly load: () => Promise<void>;
  readonly reset: (reason: ResourceResetReason) => void;
  readonly reconcile?: () => Promise<void>;
}

/** Composition-owned resource authority; operation metadata is the vocabulary. */
export class ResourceRegistry {
  readonly #descriptors: Readonly<Record<ResourceId, ResourceDescriptor>>;

  constructor(descriptors: Readonly<Record<ResourceId, ResourceDescriptor>>) {
    this.#descriptors = descriptors;
    const actual = new Set(Object.keys(descriptors));
    for (const id of RESOURCE_IDS) {
      if (!actual.delete(id)) throw new Error(`Resource ${id} has no composition owner.`);
    }
    if (actual.size) throw new Error(`Unknown resource descriptors: ${[...actual].join(", ")}`);
  }

  assertExhaustive(tags: readonly ResourceId[]): void {
    for (const tag of tags) if (!this.#descriptors[tag]) throw new Error(`Resource ${tag} has no composition owner.`);
  }

  async invalidate(tags: readonly ResourceId[]): Promise<void> {
    this.assertExhaustive(tags);
    await Promise.all(uniqueOwners(tags, this.#descriptors).map((descriptor) => descriptor.load()));
  }

  async reconcile(tags: readonly ResourceId[]): Promise<void> {
    this.assertExhaustive(tags);
    await Promise.all(uniqueOwners(tags, this.#descriptors).map((descriptor) =>
      descriptor.reconcile?.() ?? descriptor.load()
    ));
  }

  reset(scope: ResourceScope, reason: ResourceResetReason): void {
    const owners = new Map<string, ResourceDescriptor>();
    for (const descriptor of Object.values(this.#descriptors)) {
      if (descriptor.scope === scope) owners.set(descriptor.owner, descriptor);
    }
    for (const descriptor of owners.values()) descriptor.reset(reason);
  }

  dispose(): void {
    // Descriptors are immutable closures. ProjectLifecycleRegistry owns the
    // actual reset/disposal sequence; clearing it here would create a second
    // lifecycle authority.
  }
}

export function registeredResourceIds(): readonly ResourceId[] {
  const registered = new Set(operationRegistryManifest().flatMap((operation) => operation.invalidates));
  return RESOURCE_IDS.filter((id) => registered.has(id));
}

function uniqueOwners(
  tags: readonly ResourceId[],
  descriptors: Readonly<Record<ResourceId, ResourceDescriptor>>
): ResourceDescriptor[] {
  const owners = new Map<string, ResourceDescriptor>();
  for (const tag of tags) owners.set(descriptors[tag].owner, descriptors[tag]);
  return [...owners.values()];
}
