import type { MemoryClient } from "@zharwing/memory-api-client";
import type { OperationLedger } from "../../application/operations/operation-state.js";
import type { StoreAsyncRuntimePort } from "../../application/operations/store-ports.js";
import type { ApplicationScopePort } from "../../application/project-scope/project-scope-coordinator.js";
import { ResourceSlot } from "../../application/resources/resource-state.js";
import type {
  DaemonHealth,
  McpDoctor,
  McpInstallResult
} from "./system-types.js";

/** Application-scoped daemon health and MCP installation diagnostics. */
export class SystemDiagnosticsStore {
  readonly daemonHealthResource: ResourceSlot<DaemonHealth>;
  readonly mcpDoctorResource: ResourceSlot<McpDoctor>;
  readonly mcpInstallResource: ResourceSlot<McpInstallResult>;

  constructor(
    private readonly client: MemoryClient,
    applicationScope: ApplicationScopePort,
    private readonly operations: OperationLedger,
    runtime: StoreAsyncRuntimePort
  ) {
    this.daemonHealthResource = new ResourceSlot(applicationScope, runtime);
    this.mcpDoctorResource = new ResourceSlot(applicationScope, runtime);
    this.mcpInstallResource = new ResourceSlot(applicationScope, runtime);
  }

  async loadDaemonHealth(): Promise<void> {
    const attempt = this.daemonHealthResource.begin();
    if (!attempt) return;
    try {
      const health = await this.client.operation("memory.health", {}, {
        signal: attempt.scope.signal
      });
      this.daemonHealthResource.succeed(attempt, health);
    } catch (error) {
      this.daemonHealthResource.fail(attempt, error);
    }
  }

  async loadMcpDoctor(): Promise<void> {
    const attempt = this.mcpDoctorResource.begin();
    if (!attempt) return;
    try {
      const result = await this.client.operation("memory.mcp_doctor", {}, {
        signal: attempt.scope.signal
      });
      this.mcpDoctorResource.succeed(attempt, result);
    } catch (error) {
      this.mcpDoctorResource.fail(attempt, error);
    }
  }

  async installMcpClient(
    client: "auto" | "codex" | "claude-code" | "claude-desktop",
    transport: "http" | "stdio" = "http"
  ): Promise<void> {
    const resourceAttempt = this.mcpInstallResource.begin();
    if (!resourceAttempt) return;
    const operation = this.operations.begin("install-mcp-client");
    try {
      const result = await this.client.operation("memory.mcp_install", {
        client,
        transport,
        authMode: "auto"
      }, { signal: resourceAttempt.scope.signal });
      this.operations.succeed(operation, result);
      this.mcpInstallResource.succeed(resourceAttempt, result);
      await this.loadMcpDoctor();
    } catch (error) {
      this.operations.fail(operation, error);
      this.mcpInstallResource.fail(resourceAttempt, error);
    }
  }
}
