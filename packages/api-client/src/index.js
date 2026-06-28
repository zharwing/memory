export class AimemClient {
    baseUrl;
    authToken;
    constructor(options = {}) {
        const env = runtimeEnv();
        this.baseUrl = options.baseUrl || env.AIMEM_DAEMON_URL || "http://127.0.0.1:37841";
        this.authToken = options.authToken || env.AIMEM_AUTH_TOKEN || "local-dev-token";
    }
    async call(method, params = {}) {
        let response;
        try {
            response = await fetch(`${this.baseUrl}/rpc`, {
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
        }
        catch (error) {
            throw new Error(`Cannot reach AI Memory daemon at ${this.baseUrl}. Make sure the daemon is running and browser access is allowed. ${error instanceof Error ? error.message : String(error)}`);
        }
        const payload = (await response.json());
        if (!payload.ok) {
            throw new Error(payload.error?.message || `AIMEM RPC failed: ${method}`);
        }
        return payload.result;
    }
    health() {
        return this.call("memory.health");
    }
    listProjects() {
        return this.call("memory.list_projects");
    }
    getStartupState(params) {
        return this.call("memory.get_startup_state", params);
    }
    getContextBundle(params) {
        return this.call("memory.get_context_bundle", params);
    }
}
function runtimeEnv() {
    const processEnv = typeof process !== "undefined" && process.env ? process.env : {};
    const viteEnv = import.meta.env || {};
    return {
        ...viteEnv,
        ...processEnv,
        AIMEM_DAEMON_URL: processEnv.AIMEM_DAEMON_URL || viteEnv.AIMEM_DAEMON_URL || viteEnv.VITE_AIMEM_DAEMON_URL,
        AIMEM_AUTH_TOKEN: processEnv.AIMEM_AUTH_TOKEN || viteEnv.AIMEM_AUTH_TOKEN || viteEnv.VITE_AIMEM_AUTH_TOKEN
    };
}
//# sourceMappingURL=index.js.map