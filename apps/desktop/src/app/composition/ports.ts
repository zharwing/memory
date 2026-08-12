import type {
  BrowserSessionBootstrapResult,
  BrowserSessionLockReason,
  BrowserSessionState,
  MemoryClient
} from "@zharwing/memory-api-client";

export interface Clock {
  now(): Date;
}

export interface IdSource {
  create(): string;
}

export interface UiPreferenceStore {
  get(key: string): string | undefined;
  set(key: string, value: string | undefined): void;
}

export interface DiagnosticEvent {
  name: "runtime.created" | "runtime.disposed" | "contract.failure" | "browser.session.state";
  correlationId?: string;
  sessionState?: "active" | "locked";
  lockReason?: BrowserSessionLockReason;
}

export interface DiagnosticSink {
  record(event: DiagnosticEvent): void;
}

export interface BrowserSessionPort {
  readonly state: BrowserSessionState;
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
  preferences: UiPreferenceStore;
  diagnostics: DiagnosticSink;
  scheduler: Scheduler;
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

export const noOpDiagnostics: DiagnosticSink = { record: () => undefined };
