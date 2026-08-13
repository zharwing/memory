import { RPC_COMPATIBILITY_VERSION } from "@zharwing/memory-core";
import {
  ResponseLimitError,
  TransportAccessError,
  utf8ByteLength,
  type MemoryTransport,
  type TransportRequest,
  type TransportResponse
} from "./transport.js";
import { normalizeLocalDaemonBaseUrl } from "./local-url.js";

export type BrowserSessionState =
  | { readonly status: "locked"; readonly reason: BrowserSessionLockReason }
  | {
      readonly status: "active";
      readonly expiresAt: string;
      readonly rotationId: string;
      readonly projectId: string | null;
    };

export type BrowserSessionLockReason =
  | "bootstrap-required"
  | "exchange-failed"
  | "expired"
  | "project-rebinding"
  | "revoked"
  | "rotating"
  | "unauthorized"
  | "forbidden";

export interface BrowserSessionSnapshot {
  readonly state: BrowserSessionState;
}

export type BrowserSessionStateListener = (state: BrowserSessionState) => void;

export interface BrowserSessionObservable extends BrowserSessionSnapshot {
  /**
   * Observes public session state only. The current snapshot is delivered
   * immediately and the returned function removes the listener.
   */
  subscribe(listener: BrowserSessionStateListener): () => void;
}

export interface BrowserSessionAccess extends BrowserSessionSnapshot {
  withProjectSession<Result>(
    projectId: string | null,
    invoke: (csrfToken: string) => Promise<Result>
  ): Promise<Result>;
  handleAccessStatus(status: number): never;
}

export interface BrowserSessionBootstrapResult {
  readonly expiresAt: string;
  readonly rotationId: string;
  readonly projectId: string | null;
}

export interface BrowserSessionControllerOptions {
  baseUrl: string;
  fetch?: typeof fetch;
  onStateChange?: (state: BrowserSessionState) => void;
}

interface BrowserSessionWireResult extends BrowserSessionBootstrapResult {
  csrfToken: string;
}

const SESSION_RESPONSE_LIMIT = 64 * 1024;

/**
 * Owns the browser session's only script-visible secret. The CSRF value is
 * deliberately private, memory-only, and absent from snapshots/configuration.
 */
export class BrowserSessionController implements BrowserSessionObservable {
  private readonly requestFetch: typeof fetch;
  private readonly baseUrl: string;
  #csrfToken: string | undefined;
  #sessionQueue: Promise<void> = Promise.resolve();
  #activeProjectRequests = 0;
  #requestDrain: Promise<void> | undefined;
  #resolveRequestDrain: (() => void) | undefined;
  readonly #stateListeners = new Set<BrowserSessionStateListener>();
  private currentState: BrowserSessionState = Object.freeze({
    status: "locked",
    reason: "bootstrap-required"
  });

  constructor(private readonly options: BrowserSessionControllerOptions) {
    this.baseUrl = normalizeLocalDaemonBaseUrl(options.baseUrl);
    const requestFetch = options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (typeof requestFetch !== "function") {
      throw new Error("A fetch implementation is required by BrowserSessionController.");
    }
    this.requestFetch = requestFetch;
  }

  get state(): BrowserSessionState {
    return this.currentState;
  }

  subscribe(listener: BrowserSessionStateListener): () => void {
    this.#stateListeners.add(listener);
    this.notifyListener(listener);
    return () => {
      this.#stateListeners.delete(listener);
    };
  }

  /** Atomically exchanges a launcher-issued, single-use bootstrap code. */
  async bootstrap(code: string, signal?: AbortSignal): Promise<BrowserSessionBootstrapResult> {
    if (!code) throw new Error("A browser bootstrap code is required.");
    return this.exclusive(async () => {
      await this.waitForActiveProjectRequests();
      this.lock("bootstrap-required");
      return this.establish("/browser-session/bootstrap", { code }, undefined, signal);
    });
  }

  /**
   * Explicit personal-preview opt-in. The daemon accepts this only for the
   * loopback-only personal-preview profile with authentication disabled; the
   * hardened profile always rejects it.
   */
  async bootstrapPersonalPreview(signal?: AbortSignal): Promise<BrowserSessionBootstrapResult> {
    return this.exclusive(async () => {
      await this.waitForActiveProjectRequests();
      this.lock("bootstrap-required");
      return this.establish("/browser-session/preview", {}, undefined, signal);
    });
  }

  /** Rotates the bounded session while preserving cookie-only session authority. */
  async rotate(signal?: AbortSignal): Promise<BrowserSessionBootstrapResult> {
    return this.exclusive(async () => {
      await this.waitForActiveProjectRequests();
      this.expireSessionIfNeeded();
      const csrfToken = this.requireCsrf();
      this.lock("rotating");
      return this.establish("/browser-session/rotate", {}, csrfToken, signal);
    });
  }

  /** Rebinds project scope by rotating to new server-owned session claims. */
  async bindProject(projectId: string, signal?: AbortSignal): Promise<BrowserSessionBootstrapResult> {
    if (!projectId) throw new Error("A project id is required to bind the browser session.");
    return this.exclusive(async () => {
      await this.waitForActiveProjectRequests();
      this.expireSessionIfNeeded();
      return this.bindProjectNow(projectId, signal);
    });
  }

  /** Revokes the cookie session and immediately forgets the in-memory CSRF value. */
  async revoke(signal?: AbortSignal): Promise<void> {
    return this.exclusive(async () => {
      await this.waitForActiveProjectRequests();
      this.expireSessionIfNeeded();
      const csrfToken = this.requireCsrf();
      this.lock("revoked");
      const response = await this.request("/browser-session/revoke", {}, csrfToken, signal);
      if (response.status === 401 || response.status === 403) this.handleAccessStatus(response.status);
      if (response.status !== 204) throw new Error("The browser session could not be revoked.");
    });
  }

  lock(reason: BrowserSessionLockReason): void {
    this.#csrfToken = undefined;
    this.setState({ status: "locked", reason });
  }

  async withProjectSession<Result>(
    projectId: string | null,
    invoke: (csrfToken: string) => Promise<Result>
  ): Promise<Result> {
    const csrfToken = await this.exclusive(async () => {
      if (!this.isStableForProject(projectId)) {
        await this.waitForActiveProjectRequests();
        this.expireSessionIfNeeded();
        if (projectId !== null &&
            (this.currentState.status !== "active" || this.currentState.projectId !== projectId)) {
          await this.bindProjectNow(projectId);
        }
      }
      this.expireSessionIfNeeded();
      const token = this.requireCsrf();
      this.acquireProjectRequest();
      return token;
    });

    try {
      return await invoke(csrfToken);
    } finally {
      this.releaseProjectRequest();
    }
  }

  handleAccessStatus(status: number): never {
    this.applyAccessFailure(status);
    throw new TransportAccessError(status === 403 ? "forbidden" : "unauthorized", status === 403 ? 403 : 401);
  }

  private async establish(
    path: string,
    body: Record<string, unknown>,
    csrfToken?: string,
    signal?: AbortSignal
  ): Promise<BrowserSessionBootstrapResult> {
    try {
      const response = await this.request(path, body, csrfToken, signal);
      if (response.status === 401 || response.status === 403) this.handleAccessStatus(response.status);
      if (response.status < 200 || response.status >= 300) {
        throw new Error("The browser session exchange failed.");
      }
      const result = await readBoundedJson(response, SESSION_RESPONSE_LIMIT);
      if (!isSessionWireResult(result)) throw new Error("The browser session response is not valid.");
      this.#csrfToken = result.csrfToken;
      const publicResult = {
        expiresAt: result.expiresAt,
        rotationId: result.rotationId,
        projectId: result.projectId
      };
      this.setState({ status: "active", ...publicResult });
      return publicResult;
    } catch (error) {
      if (this.currentState.status === "locked" &&
          this.currentState.reason !== "unauthorized" &&
          this.currentState.reason !== "forbidden") {
        this.lock("exchange-failed");
      }
      throw error;
    }
  }

  private async bindProjectNow(
    projectId: string,
    signal?: AbortSignal
  ): Promise<BrowserSessionBootstrapResult> {
    if (this.currentState.status === "active" && this.currentState.projectId === projectId) {
      return {
        expiresAt: this.currentState.expiresAt,
        rotationId: this.currentState.rotationId,
        projectId: this.currentState.projectId
      };
    }
    const csrfToken = this.requireCsrf();
    this.lock("project-rebinding");
    return this.establish("/browser-session/project", { projectId }, csrfToken, signal);
  }

  private isStableForProject(projectId: string | null): boolean {
    return this.currentState.status === "active" &&
      Date.parse(this.currentState.expiresAt) > Date.now() &&
      (projectId === null || this.currentState.projectId === projectId);
  }

  private expireSessionIfNeeded(): void {
    if (this.currentState.status === "active" && Date.parse(this.currentState.expiresAt) <= Date.now()) {
      this.lock("expired");
    }
  }

  private acquireProjectRequest(): void {
    if (this.#activeProjectRequests === 0) {
      this.#requestDrain = new Promise<void>((resolve) => {
        this.#resolveRequestDrain = () => resolve();
      });
    }
    this.#activeProjectRequests += 1;
  }

  private releaseProjectRequest(): void {
    if (this.#activeProjectRequests <= 0) return;
    this.#activeProjectRequests -= 1;
    if (this.#activeProjectRequests !== 0) return;
    const resolve = this.#resolveRequestDrain;
    this.#requestDrain = undefined;
    this.#resolveRequestDrain = undefined;
    resolve?.();
  }

  private waitForActiveProjectRequests(): Promise<void> {
    return this.#requestDrain ?? Promise.resolve();
  }

  private exclusive<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.#sessionQueue.then(operation);
    this.#sessionQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private request(
    path: string,
    body: Record<string, unknown>,
    csrfToken?: string,
    signal?: AbortSignal
  ): Promise<Response> {
    const headers: Record<string, string> = {
      accept: "application/json",
      "content-type": "application/json"
    };
    if (csrfToken) headers["x-csrf-token"] = csrfToken;
    return this.requestFetch(`${this.baseUrl}${path}`, {
      method: "POST",
      credentials: "include",
      headers,
      body: JSON.stringify(body),
      signal
    });
  }

  private requireCsrf(): string {
    if (!this.#csrfToken || this.currentState.status !== "active") {
      throw new TransportAccessError("unauthorized", 401);
    }
    return this.#csrfToken;
  }

  private applyAccessFailure(status: number): void {
    this.lock(status === 403 ? "forbidden" : "unauthorized");
  }

  private setState(state: BrowserSessionState): void {
    this.currentState = Object.freeze(state);
    if (this.options.onStateChange) this.notifyListener(this.options.onStateChange);
    for (const listener of [...this.#stateListeners]) this.notifyListener(listener);
  }

  private notifyListener(listener: BrowserSessionStateListener): void {
    try {
      listener(this.currentState);
    } catch {
      // Session observers cannot interrupt or roll back an authority change.
    }
  }
}

export interface BrowserMemoryTransportOptions {
  baseUrl: string;
  session: BrowserSessionAccess;
  fetch?: typeof fetch;
}

/** Cookie/CSRF transport for browser UI only; it has no bearer input surface. */
export class BrowserMemoryTransport implements MemoryTransport {
  private readonly requestFetch: typeof fetch;
  private readonly baseUrl: string;

  constructor(private readonly options: BrowserMemoryTransportOptions) {
    this.baseUrl = normalizeLocalDaemonBaseUrl(options.baseUrl);
    const requestFetch = options.fetch ?? globalThis.fetch?.bind(globalThis);
    if (typeof requestFetch !== "function") {
      throw new Error("A fetch implementation is required by BrowserMemoryTransport.");
    }
    this.requestFetch = requestFetch;
  }

  async send(request: TransportRequest): Promise<TransportResponse> {
    if (request.audience !== "browser") {
      throw new TransportAccessError("forbidden", 403);
    }
    const projectId = typeof request.input.projectId === "string" ? request.input.projectId : null;
    return this.options.session.withProjectSession(projectId, async (csrfToken) => {
      const headers: Record<string, string> = {
        accept: "application/json",
        "content-type": "application/json",
        "x-correlation-id": request.context.correlationId,
        "x-csrf-token": csrfToken,
        "x-rpc-compatibility-version": String(RPC_COMPATIBILITY_VERSION)
      };
      if (request.context.idempotencyKey) headers["x-idempotency-key"] = request.context.idempotencyKey;
      if (request.context.expectedRevision !== undefined) headers["if-match"] = String(request.context.expectedRevision);
      const response = await this.requestFetch(`${this.baseUrl}/rpc`, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          version: request.version,
          id: request.context.correlationId,
          method: request.operation,
          params: request.input
        }),
        signal: request.context.signal
      });
      if (response.status === 401 || response.status === 403) this.options.session.handleAccessStatus(response.status);
      return toTransportResponse(response, request.context.maximumResponseBytes);
    });
  }
}

async function toTransportResponse(response: Response, maximumResponseBytes: number): Promise<TransportResponse> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) {
    throw new ResponseLimitError(maximumResponseBytes);
  }
  const bodyText = await response.text();
  const byteLength = utf8ByteLength(bodyText);
  if (byteLength > maximumResponseBytes) throw new ResponseLimitError(maximumResponseBytes);
  return {
    status: response.status,
    contentType: response.headers.get("content-type") ?? "",
    bodyText,
    byteLength
  };
}

async function readBoundedJson(response: Response, maximumResponseBytes: number): Promise<unknown> {
  const transportResponse = await toTransportResponse(response, maximumResponseBytes);
  if (!transportResponse.contentType.toLowerCase().includes("application/json")) {
    throw new Error("The browser session response must be JSON.");
  }
  return JSON.parse(transportResponse.bodyText) as unknown;
}

function isSessionWireResult(value: unknown): value is BrowserSessionWireResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.csrfToken === "string" && candidate.csrfToken.length > 0 &&
    typeof candidate.expiresAt === "string" && Number.isFinite(Date.parse(candidate.expiresAt)) &&
    typeof candidate.rotationId === "string" && candidate.rotationId.length > 0 &&
    (candidate.projectId === null || typeof candidate.projectId === "string");
}
