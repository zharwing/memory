import {
  DEFAULT_DAEMON_URL,
  isOperationName,
  isPlainObject,
  memoryEnv,
  type AgentResult,
  type OperationName
} from "@zharwing/memory-core";
import {
  BrowserMemoryTransport,
  BrowserSessionController,
  type BrowserSessionControllerOptions
} from "./browser-transport.js";
import {
  OperationClient,
  type ClientRuntime,
  type OperationOptions
} from "./client.js";
import {
  NonBrowserCredentialTransport,
  type NonBrowserCredentialTransportOptions
} from "./credential-transport.js";
import {
  TransportAccessError,
  type MemoryTransport,
  type TransportRequest,
  type TransportResponse
} from "./transport.js";
import { normalizeLocalDaemonBaseUrl } from "./local-url.js";

export * from "./transport.js";
export * from "./browser-transport.js";
export * from "./credential-transport.js";
export * from "./tauri-transport.js";
export * from "./client.js";
export * from "./local-url.js";

export interface BrowserMemoryClientOptions extends Omit<BrowserSessionControllerOptions, "baseUrl"> {
  baseUrl?: string;
  runtime?: ClientRuntime;
  session?: BrowserSessionController;
}

export class BrowserMemoryClient extends OperationClient {
  readonly session: BrowserSessionController;

  constructor(options: BrowserMemoryClientOptions = {}) {
    const baseUrl = options.baseUrl ?? browserDaemonUrl();
    const session = options.session ?? new BrowserSessionController({
      baseUrl,
      fetch: options.fetch,
      onStateChange: options.onStateChange
    });
    super(new BrowserMemoryTransport({ baseUrl, fetch: options.fetch, session }), options.runtime, "browser");
    this.session = session;
  }
}

export interface NonBrowserMemoryClientOptions {
  transport?: MemoryTransport;
  runtime?: ClientRuntime;
  baseUrl?: string;
  credential?: string;
  /** @deprecated Use adminCredential for control-plane calls. */
  authToken?: string;
  adminCredential?: string;
  agentCredential?: string;
  fetch?: typeof fetch;
}

export interface AgentMemoryClientOptions {
  transport?: MemoryTransport;
  runtime?: ClientRuntime;
  baseUrl?: string;
  agentCredential?: string;
  fetch?: typeof fetch;
}

/**
 * Agent-only trusted-host client. It has no generic/admin credential fallback
 * and can reach only /agent-rpc through an agent-audience transport request.
 */
export class AgentMemoryClient extends OperationClient {
  constructor(options: AgentMemoryClientOptions = {}) {
    super(
      options.transport ?? createAgentOnlyTransport(options),
      options.runtime,
      "agent"
    );
  }

  callAgent<T = AgentResult>(
    method: string,
    input: Record<string, unknown> = {},
    options?: OperationOptions
  ): Promise<T> {
    return this.rawAgentOperation(method, input, options) as Promise<T>;
  }
}

/**
 * Trusted-runtime compatibility facade. Browser composition never imports or
 * constructs this client, and no Vite environment name is consulted here.
 */
export class NonBrowserMemoryClient extends OperationClient {
  constructor(options: NonBrowserMemoryClientOptions = {}) {
    const transport = options.transport ?? createNonBrowserTransport(options, false);
    // Typed operation outputs are the human/admin projection. Production
    // agent entrypoints use AgentMemoryClient instead of this compatibility
    // facade so they cannot acquire admin authority.
    super(transport, options.runtime, "admin");
  }

  /** Compatibility alias for registered control-plane operations. */
  call<T = unknown>(
    name: string,
    input: Record<string, unknown> = {},
    options?: OperationOptions
  ): Promise<T> {
    if (!isOperationName(name)) {
      return Promise.reject(new Error(`Unknown Zharwing Memory operation: ${name}`));
    }
    return super.operation(name, input, options) as Promise<T>;
  }

  /** @deprecated Production agent entrypoints must use AgentMemoryClient. */
  callAgent<T = AgentResult>(
    method: string,
    input: Record<string, unknown> = {},
    options?: OperationOptions
  ): Promise<T> {
    return this.rawAgentOperation(method, input, options) as Promise<T>;
  }
}

/**
 * Compatibility export for trusted Node CLI/MCP callers only. Unlike the
 * explicit client above, this legacy facade can discover role-separated
 * credentials from the Node process environment. Browser composition never
 * constructs it and no Vite-prefixed credential name is supported.
 */
export class ZharwingMemoryClient extends NonBrowserMemoryClient {
  readonly #compatBaseUrl: string;
  readonly #compatAuthToken: string;
  readonly #compatFetch: typeof fetch;
  readonly #hasDedicatedAgentCredential: boolean;

  constructor(options: NonBrowserMemoryClientOptions = {}) {
    const runtime = trustedNodeRuntimeOptions();
    const baseUrl = options.baseUrl ?? runtime.baseUrl ?? DEFAULT_DAEMON_URL;
    const authToken = options.authToken ?? options.credential ?? options.adminCredential ?? runtime.adminCredential ?? "";
    super({
      ...options,
      // The legacy CLI must be able to run help/setup before credentials are
      // provisioned. The transport still rejects every operation without the
      // exact role credential; it never substitutes another authority.
      transport: options.transport ?? createNonBrowserTransport({
        ...options,
        baseUrl,
        adminCredential: options.adminCredential ?? authToken,
        agentCredential: options.agentCredential ?? runtime.agentCredential
      }, false, true)
    });
    this.#compatBaseUrl = normalizeLocalDaemonBaseUrl(baseUrl);
    this.#compatAuthToken = authToken;
    const requestFetch = options.fetch ?? globalThis.fetch;
    if (typeof requestFetch !== "function") throw new Error("A fetch implementation is required.");
    this.#compatFetch = requestFetch;
    this.#hasDedicatedAgentCredential = Boolean(options.agentCredential ?? runtime.agentCredential);
  }

  /** @deprecated Prefer an explicit transport. Retained for trusted Node compatibility. */
  get baseUrl(): string { return this.#compatBaseUrl; }
  /** @deprecated Prefer role-specific credentials. Never expose this facade to browser composition. */
  get authToken(): string { return this.#compatAuthToken; }

  /**
   * Versionless compatibility call for the personal-preview admin surface.
   * Passing typed operation options opts into the current versioned registrar
   * instead. Hardened callers should prefer operation().
   */
  override call<T = unknown>(
    method: string,
    params: Record<string, unknown> = {},
    options?: OperationOptions
  ): Promise<T> {
    if (options !== undefined) return super.call<T>(method, params, options);
    return this.#callPreviewEndpoint<T>("/rpc", method, params);
  }

  /**
   * A distinct agent credential always selects the hardened agent path. The
   * legacy admin bearer reaches /agent-rpc only through personal-preview,
   * where the daemon owns the compatibility decision.
   */
  override callAgent<T = AgentResult>(
    method: string,
    params: Record<string, unknown> = {},
    options?: OperationOptions
  ): Promise<T> {
    if (this.#hasDedicatedAgentCredential || options !== undefined) {
      return super.callAgent<T>(method, params, options);
    }
    return this.#callPreviewEndpoint<T>("/agent-rpc", method, params);
  }

  health() { return this.call("memory.health"); }
  listProjects() { return this.call("memory.list_projects"); }
  getStartupState(params: Record<string, unknown>) { return this.call("memory.get_startup_state", params); }
  getSessionDetail(params: Record<string, unknown>) { return this.call("memory.get_session_detail", params); }
  getContextBundle(params: Record<string, unknown>) { return this.call("memory.get_context_bundle", params); }
  getGraph(params: Record<string, unknown>) { return this.call("memory.get_graph", params); }
  getSemanticGraphSettings(params: Record<string, unknown>) { return this.call("memory.get_semantic_graph_settings", params); }
  updateAssistantPolicy(params: Record<string, unknown>) { return this.call("memory.update_assistant_policy", params); }
  updateSemanticGraphSettings(params: Record<string, unknown>) { return this.call("memory.update_semantic_graph_settings", params); }
  getSemanticGraphStatus(params: Record<string, unknown>) { return this.call("memory.get_semantic_graph_status", params); }
  listSemanticEdges(params: Record<string, unknown>) { return this.call("memory.list_semantic_edges", params); }
  updateSemanticEdgeStatus(params: Record<string, unknown>) { return this.call("memory.update_semantic_edge_status", params); }
  listSemanticGraphRuns(params: Record<string, unknown>) { return this.call("memory.list_semantic_graph_runs", params); }
  getSemanticGraphRun(params: Record<string, unknown>) { return this.call("memory.get_semantic_graph_run", params); }
  previewSemanticGraphAnalysis(params: Record<string, unknown>) { return this.call("memory.preview_semantic_graph_analysis", params); }
  analyzeSemanticGraph(params: Record<string, unknown>) { return this.call("memory.analyze_semantic_graph", params); }
  checkSemanticGraphProvider(params: Record<string, unknown>) { return this.call("memory.check_semantic_graph_provider", params); }
  proposeSemanticEdges(params: Record<string, unknown>) { return this.call("memory.propose_semantic_edges", params); }
  acceptSemanticEdgesProposal(params: Record<string, unknown>) { return this.call("memory.accept_semantic_edges_proposal", params); }

  async #callPreviewEndpoint<T>(
    endpoint: "/rpc" | "/agent-rpc",
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.#compatFetch(`${this.#compatBaseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          accept: "application/json",
          ...(this.#compatAuthToken ? { authorization: `Bearer ${this.#compatAuthToken}` } : {}),
          "content-type": "application/json"
        },
        body: JSON.stringify({ id: this.runtime.createId(), method, params })
      });
    } catch {
      throw new Error(`Cannot reach Zharwing Memory daemon at ${this.#compatBaseUrl}.`);
    }
    let payload: unknown;
    try {
      payload = JSON.parse(await response.text());
    } catch {
      throw new Error(`Zharwing Memory RPC failed: ${method}`);
    }
    if (!isPlainObject(payload) || typeof payload.ok !== "boolean") {
      throw new Error(`Zharwing Memory RPC failed: ${method}`);
    }
    if (payload.ok) return payload.result as T;
    const message = isPlainObject(payload.error) && typeof payload.error.message === "string"
      ? legacyPublicMessage(payload.error.message)
      : undefined;
    throw new Error(message ?? `Zharwing Memory RPC failed: ${method}`);
  }
}

/** @deprecated Use NonBrowserMemoryClientOptions. */
export interface ZharwingMemoryClientOptions extends NonBrowserMemoryClientOptions {}
/** @deprecated Use NonBrowserMemoryClientOptions. */
export type AimemClientOptions = ZharwingMemoryClientOptions;
/** @deprecated Use ZharwingMemoryClient. */
export const AimemClient = ZharwingMemoryClient;

function browserDaemonUrl(): string {
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  return viteEnv.ZHARWING_PUBLIC_DAEMON_URL ?? DEFAULT_DAEMON_URL;
}

function createNonBrowserTransport(
  options: NonBrowserMemoryClientOptions,
  allowNodeEnvironment: boolean,
  allowUnprovisioned = false
): MemoryTransport {
  const runtime = allowNodeEnvironment ? trustedNodeRuntimeOptions() : {};
  const fallbackCredential = options.credential ?? options.authToken;
  const adminCredential = options.adminCredential ?? fallbackCredential ?? runtime.adminCredential;
  const agentCredential = options.agentCredential ?? fallbackCredential ?? runtime.agentCredential;
  if (!allowUnprovisioned && !adminCredential && !agentCredential) {
    throw new Error("NonBrowserMemoryClient requires an explicit trusted-runtime credential.");
  }
  return new RoleCredentialTransport({
    baseUrl: options.baseUrl ?? runtime.baseUrl ?? DEFAULT_DAEMON_URL,
    adminCredential,
    agentCredential,
    fetch: options.fetch
  });
}

function createAgentOnlyTransport(options: AgentMemoryClientOptions): MemoryTransport {
  const runtime = trustedAgentNodeRuntimeOptions();
  const credential = options.agentCredential ?? runtime.agentCredential;
  if (!credential) {
    throw new Error("A dedicated trusted-host agent credential is required.");
  }
  return new NonBrowserCredentialTransport({
    baseUrl: options.baseUrl ?? runtime.baseUrl ?? DEFAULT_DAEMON_URL,
    credential,
    fetch: options.fetch
  });
}

interface RoleCredentialTransportOptions {
  readonly baseUrl: string;
  readonly adminCredential?: string;
  readonly agentCredential?: string;
  readonly fetch?: typeof fetch;
}

class RoleCredentialTransport implements MemoryTransport {
  #baseUrl: string;
  #adminCredential: string | undefined;
  #agentCredential: string | undefined;
  #fetch: typeof fetch | undefined;

  constructor(options: RoleCredentialTransportOptions) {
    this.#baseUrl = options.baseUrl;
    this.#adminCredential = options.adminCredential;
    this.#agentCredential = options.agentCredential;
    this.#fetch = options.fetch;
  }

  send(request: TransportRequest): Promise<TransportResponse> {
    const credential = request.audience === "agent"
      ? this.#agentCredential
      : request.audience === "admin"
        ? this.#adminCredential
        : undefined;
    if (!credential) throw new TransportAccessError("unauthorized", 401);
    const transportOptions: NonBrowserCredentialTransportOptions = {
      baseUrl: this.#baseUrl,
      credential,
      fetch: this.#fetch
    };
    return new NonBrowserCredentialTransport(transportOptions).send(request);
  }
}

function trustedNodeRuntimeOptions(): {
  baseUrl?: string;
  adminCredential?: string;
  agentCredential?: string;
} {
  if (typeof process === "undefined" || !process.versions?.node || !process.env) return {};
  return {
    baseUrl: memoryEnv("ZHARWING_MEMORY_DAEMON_URL"),
    adminCredential: memoryEnv("ZHARWING_MEMORY_AUTH_TOKEN"),
    agentCredential: nonEmpty(process.env.ZHARWING_MEMORY_AGENT_CREDENTIAL)
  };
}

function trustedAgentNodeRuntimeOptions(): {
  baseUrl?: string;
  agentCredential?: string;
} {
  if (typeof process === "undefined" || !process.versions?.node || !process.env) return {};
  return {
    baseUrl: nonEmpty(process.env.ZHARWING_MEMORY_DAEMON_URL),
    agentCredential: nonEmpty(process.env.ZHARWING_MEMORY_AGENT_CREDENTIAL)
  };
}

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function legacyPublicMessage(value: string): string | undefined {
  return LEGACY_PUBLIC_MESSAGES.has(value) ? value : undefined;
}

const LEGACY_PUBLIC_MESSAGES = new Set([
  "The request is not valid.",
  "Unlock this session to continue.",
  "This action is not allowed.",
  "The requested item was not found.",
  "The item changed before this action completed.",
  "The memory service is unavailable.",
  "The memory service did not respond in time.",
  "The operation was cancelled.",
  "The memory service returned an invalid response.",
  "The memory service is not compatible with this app version.",
  "The operation may have been applied; reconcile before trying again.",
  "The operation could not be completed."
]);
