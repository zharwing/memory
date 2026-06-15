export interface AimemClientOptions {
  baseUrl?: string;
  authToken?: string;
}

export class AimemClient {
  readonly baseUrl: string;
  readonly authToken: string;

  constructor(options: AimemClientOptions = {}) {
    const env = runtimeEnv();
    this.baseUrl = options.baseUrl || env.AIMEM_DAEMON_URL || "http://127.0.0.1:37841";
    this.authToken = options.authToken || env.AIMEM_AUTH_TOKEN || "local-dev-token";
  }

  async call<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(`${this.baseUrl}/rpc`, {
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
    const payload = (await response.json()) as {
      ok: boolean;
      result?: T;
      error?: { message: string };
    };
    if (!payload.ok) {
      throw new Error(payload.error?.message || `AIMEM RPC failed: ${method}`);
    }
    return payload.result as T;
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

  getContextBundle(params: Record<string, unknown>) {
    return this.call("memory.get_context_bundle", params);
  }
}

function runtimeEnv(): Record<string, string | undefined> {
  if (typeof process !== "undefined" && process.env) return process.env;
  return {};
}
