import { operationRegistryManifest, type ResourceId } from "@zharwing/memory-core";
export interface ResourceInvalidationEvent { readonly version: 1; readonly eventId: string; readonly projectId?: string; readonly resourceTags: readonly ResourceId[]; readonly sourceInstanceId: string; readonly timestamp: number; readonly revision?: string; }
export interface ResourceInvalidationBus { readonly sourceInstanceId: string; publish(event: ResourceInvalidationEvent): void; subscribe(listener: (event: ResourceInvalidationEvent) => void): () => void; dispose(): void; }
/** Runtime-neutral in-memory owner; browser/Tauri adapters may bridge it without carrying entity bodies. */
export class LocalResourceInvalidationBus implements ResourceInvalidationBus { readonly sourceInstanceId = globalThis.crypto?.randomUUID?.() ?? `runtime-${Date.now()}-${Math.random()}`; #listeners = new Set<(event: ResourceInvalidationEvent) => void>(); publish(_event: ResourceInvalidationEvent) { /* no peer runtime in this adapter */ } subscribe(listener: (event: ResourceInvalidationEvent) => void) { this.#listeners.add(listener); return () => this.#listeners.delete(listener); } dispose() { this.#listeners.clear(); } }

const CHANNEL = "zharwing-memory-invalidation-v1";
const STORAGE_KEY = "zharwing-memory-invalidation-v1";
const knownTags = new Set(operationRegistryManifest().flatMap((operation) => operation.invalidates));

/** Browser adapter for body-free, versioned cross-tab convergence messages. */
export class BrowserResourceInvalidationBus implements ResourceInvalidationBus {
  readonly sourceInstanceId = globalThis.crypto?.randomUUID?.() ?? `tab-${Date.now()}-${Math.random()}`;
  #listeners = new Set<(event: ResourceInvalidationEvent) => void>();
  #seen = new Set<string>();
  #channel: BroadcastChannel | undefined;
  #onStorage: ((event: StorageEvent) => void) | undefined;

  constructor() {
    if (typeof BroadcastChannel !== "undefined") {
      this.#channel = new BroadcastChannel(CHANNEL);
      this.#channel.addEventListener("message", (event) => this.receive(event.data));
    }
    this.#onStorage = (event) => { if (event.key === STORAGE_KEY && event.newValue) this.receive(parse(event.newValue)); };
    globalThis.addEventListener?.("storage", this.#onStorage);
  }

  publish(event: ResourceInvalidationEvent): void {
    const normalized = { ...event, timestamp: Number.isFinite(event.timestamp) ? event.timestamp : Date.now(), sourceInstanceId: event.sourceInstanceId || this.sourceInstanceId };
    this.remember(normalized.eventId);
    this.#channel?.postMessage(normalized);
    try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(normalized)); } catch { /* storage fallback is optional */ }
  }

  subscribe(listener: (event: ResourceInvalidationEvent) => void): () => void { this.#listeners.add(listener); return () => this.#listeners.delete(listener); }

  dispose(): void {
    this.#channel?.close();
    if (this.#onStorage) globalThis.removeEventListener?.("storage", this.#onStorage);
    this.#listeners.clear();
    this.#seen.clear();
  }

  private receive(value: unknown): void {
    const event = parse(value);
    if (!event || event.sourceInstanceId === this.sourceInstanceId || this.#seen.has(event.eventId)) return;
    this.remember(event.eventId);
    this.emit(event);
  }
  private emit(event: ResourceInvalidationEvent): void { for (const listener of [...this.#listeners]) listener(event); }
  private remember(eventId: string): void { this.#seen.add(eventId); if (this.#seen.size > 512) this.#seen.delete(this.#seen.values().next().value as string); }
}

function parse(value: unknown): ResourceInvalidationEvent | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || typeof candidate.eventId !== "string" || typeof candidate.sourceInstanceId !== "string") return undefined;
  if (!Array.isArray(candidate.resourceTags) || !candidate.resourceTags.every((tag) => typeof tag === "string" && knownTags.has(tag as ResourceId))) return undefined;
  if (candidate.projectId !== undefined && typeof candidate.projectId !== "string") return undefined;
  return { version: 1, eventId: candidate.eventId, sourceInstanceId: candidate.sourceInstanceId, projectId: candidate.projectId as string | undefined, resourceTags: candidate.resourceTags as ResourceId[], timestamp: typeof candidate.timestamp === "number" ? candidate.timestamp : Date.now(), revision: typeof candidate.revision === "string" ? candidate.revision : undefined };
}
