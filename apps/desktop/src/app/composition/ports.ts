import type {
  BrowserSessionBootstrapResult,
  BrowserSessionObservable,
  MemoryClient
} from "@zharwing/memory-api-client";
import type { DiagnosticJournal } from "../../platform/diagnostics/diagnostic-journal.js";
import type { GraphPositionStore } from "../../features/graph/persistence/graph-position-store.js";
import type { ResourceInvalidationBus } from "../../application/resources/resource-invalidation-bus.js";
import type {
  AppPersistence,
  RawPreferenceStore
} from "../../application/persistence/app-persistence.js";

export interface Clock {
  now(): Date;
}

export interface IdSource {
  create(): string;
}

/** @deprecated Raw storage adapter; application features consume AppPersistence. */
export type UiPreferenceStore = RawPreferenceStore;

/** Browser composition owns the controller; consumers see only its explicit port. */
export interface BrowserSessionPort extends BrowserSessionObservable {
  bootstrap(code: string, signal?: AbortSignal): Promise<BrowserSessionBootstrapResult>;
  bootstrapPersonalPreview(signal?: AbortSignal): Promise<BrowserSessionBootstrapResult>;
  rotate(signal?: AbortSignal): Promise<BrowserSessionBootstrapResult>;
  bindProject(projectId: string, signal?: AbortSignal): Promise<BrowserSessionBootstrapResult>;
  revoke(signal?: AbortSignal): Promise<void>;
}

export interface Scheduler {
  setTimeout(callback: () => void, delayMs: number): ReturnType<typeof setTimeout>;
  clearTimeout(handle: ReturnType<typeof setTimeout>): void;
  setInterval(callback: () => void, delayMs: number): ReturnType<typeof setInterval>;
  clearInterval(handle: ReturnType<typeof setInterval>): void;
}

export interface AppServices {
  memory: MemoryClient;
  browserSession?: BrowserSessionPort;
  clock: Clock;
  ids: IdSource;
  persistence: AppPersistence;
  diagnostics: DiagnosticJournal;
  scheduler: Scheduler;
  invalidations?: ResourceInvalidationBus;
}

export const systemClock: Clock = { now: () => new Date() };

export const randomIds: IdSource = {
  create: () => globalThis.crypto?.randomUUID?.() ?? `ui-${Date.now()}-${Math.random().toString(16).slice(2)}`
};

export const globalScheduler: Scheduler = {
  setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs),
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
  setInterval: (callback, delayMs) => globalThis.setInterval(callback, delayMs),
  clearInterval: (handle) => globalThis.clearInterval(handle)
};
