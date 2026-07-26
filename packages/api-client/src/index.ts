import { DEFAULT_DAEMON_URL, MEMORY_ENV_FALLBACKS, type RpcResponse } from "@zharwing/memory-core";

export interface ZharwingMemoryClientOptions {
  baseUrl?: string;
  authToken?: string;
}

export class ZharwingMemoryClient {
  readonly baseUrl: string;
  readonly authToken: string;

  constructor(options: ZharwingMemoryClientOptions = {}) {
    const env = runtimeEnv();
    this.baseUrl = options.baseUrl || env.DAEMON_URL || DEFAULT_DAEMON_URL;
    // No fallback credential: an unset token means requests fail closed with
    // 401 until the operator supplies the daemon token.
    this.authToken = options.authToken || env.AUTH_TOKEN || "";
  }

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.callEndpoint("/rpc", method, params);
  }

  /**
   * Agent-surface call: routed through the daemon's audience-checked privacy
   * facade. MCP and any other agent-facing client must use this, never call().
   */
  async callAgent<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    return this.callEndpoint("/agent-rpc", method, params);
  }

  private async callEndpoint<T>(endpoint: string, method: string, params: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.authToken}`
        },
        body: JSON.stringify({
          id: Date.now(),
          method,
          params
        })
      });
    } catch (error) {
      throw new Error(`Cannot reach Zharwing Memory daemon at ${this.baseUrl}. Make sure the daemon is running and browser access is allowed. ${error instanceof Error ? error.message : String(error)}`);
    }
    const payload = (await response.json()) as RpcResponse<T>;
    if (!payload.ok) {
      throw new Error(payload.error?.message || `Zharwing Memory RPC failed: ${method}`);
    }
    return payload.result;
  }

  health() {
    return this.call("memory.health");
  }

  listProjects() {
    return this.call("memory.list_projects");
  }

  getStartupState(params: Record<string, unknown>) {
    return this.call("memory.get_startup_state", params);
  }

  getSessionDetail(params: Record<string, unknown>) {
    return this.call("memory.get_session_detail", params);
  }

  getContextBundle(params: Record<string, unknown>) {
    return this.call("memory.get_context_bundle", params);
  }

  getGraph(params: Record<string, unknown>) {
    return this.call("memory.get_graph", params);
  }

  getSemanticGraphSettings(params: Record<string, unknown>) {
    return this.call("memory.get_semantic_graph_settings", params);
  }

  updateAssistantPolicy(params: Record<string, unknown>) {
    return this.call("memory.update_assistant_policy", params);
  }

  updateSemanticGraphSettings(params: Record<string, unknown>) {
    return this.call("memory.update_semantic_graph_settings", params);
  }

  getSemanticGraphStatus(params: Record<string, unknown>) {
    return this.call("memory.get_semantic_graph_status", params);
  }

  listSemanticEdges(params: Record<string, unknown>) {
    return this.call("memory.list_semantic_edges", params);
  }

  updateSemanticEdgeStatus(params: Record<string, unknown>) {
    return this.call("memory.update_semantic_edge_status", params);
  }

  listSemanticGraphRuns(params: Record<string, unknown>) {
    return this.call("memory.list_semantic_graph_runs", params);
  }

  getSemanticGraphRun(params: Record<string, unknown>) {
    return this.call("memory.get_semantic_graph_run", params);
  }

  previewSemanticGraphAnalysis(params: Record<string, unknown>) {
    return this.call("memory.preview_semantic_graph_analysis", params);
  }

  analyzeSemanticGraph(params: Record<string, unknown>) {
    return this.call("memory.analyze_semantic_graph", params);
  }

  checkSemanticGraphProvider(params: Record<string, unknown>) {
    return this.call("memory.check_semantic_graph_provider", params);
  }

  proposeSemanticEdges(params: Record<string, unknown>) {
    return this.call("memory.propose_semantic_edges", params);
  }

  acceptSemanticEdgesProposal(params: Record<string, unknown>) {
    return this.call("memory.accept_semantic_edges_proposal", params);
  }
}

/** @deprecated Use ZharwingMemoryClientOptions. */
export type AimemClientOptions = ZharwingMemoryClientOptions;

/** @deprecated Use ZharwingMemoryClient. */
export const AimemClient = ZharwingMemoryClient;

function runtimeEnv(): { DAEMON_URL?: string; AUTH_TOKEN?: string } {
  return {
    DAEMON_URL: resolveEnv("ZHARWING_MEMORY_DAEMON_URL"),
    AUTH_TOKEN: resolveEnv("ZHARWING_MEMORY_AUTH_TOKEN")
  };
}

/**
 * Resolves an env var across process.env and import.meta.env (including the
 * VITE_-prefixed variants exposed to browser bundles). The canonical
 * ZHARWING_MEMORY_* name wins; the legacy AIMEM_* name from the shared core
 * table remains readable for one transition release so existing .env files
 * keep working.
 */
function resolveEnv(canonical: keyof typeof MEMORY_ENV_FALLBACKS): string | undefined {
  const processEnv = typeof process !== "undefined" && process.env ? process.env : {};
  const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env || {};
  const names = [canonical, MEMORY_ENV_FALLBACKS[canonical]];
  for (const name of names) {
    if (processEnv[name]) return processEnv[name];
  }
  for (const name of names) {
    if (viteEnv[name]) return viteEnv[name];
  }
  for (const name of names) {
    if (viteEnv[`VITE_${name}`]) return viteEnv[`VITE_${name}`];
  }
  return undefined;
}
