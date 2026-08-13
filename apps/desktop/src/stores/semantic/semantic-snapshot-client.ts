import type { MemoryClient } from "@zharwing/memory-api-client";
import type { ScopeToken } from "../../application/operations/store-ports.js";
import type {
  SemanticAuthoritativeSnapshot,
  SemanticFullSnapshot,
  SemanticProgressSnapshot,
  SemanticSettingsStatusSnapshot,
  SemanticStatusEdgesSnapshot
} from "./semantic-types.js";

/** Read-only semantic RPCs, kept separate from the facade's mutation authority. */
export class SemanticSnapshotClient {
  constructor(private readonly client: MemoryClient) {}

  getStatus(scope: ScopeToken): Promise<SemanticSettingsStatusSnapshot["status"]> {
    return this.client.operation(
      "memory.get_semantic_graph_status",
      { projectId: scope.projectId },
      { signal: scope.signal }
    );
  }

  async getSettingsAndStatus(scope: ScopeToken): Promise<SemanticSettingsStatusSnapshot> {
    const [settings, status] = await Promise.all([
      this.client.operation(
        "memory.get_semantic_graph_settings",
        { projectId: scope.projectId },
        { signal: scope.signal }
      ),
      this.client.operation(
        "memory.get_semantic_graph_status",
        { projectId: scope.projectId },
        { signal: scope.signal }
      )
    ]);
    return { settings, status };
  }

  async getFull(scope: ScopeToken): Promise<SemanticFullSnapshot> {
    const [settings, status, edges, runs] = await Promise.all([
      this.client.operation(
        "memory.get_semantic_graph_settings",
        { projectId: scope.projectId },
        { signal: scope.signal }
      ),
      this.client.operation(
        "memory.get_semantic_graph_status",
        { projectId: scope.projectId },
        { signal: scope.signal }
      ),
      this.client.operation(
        "memory.list_semantic_edges",
        { projectId: scope.projectId },
        { signal: scope.signal }
      ),
      this.client.operation(
        "memory.list_semantic_graph_runs",
        { projectId: scope.projectId },
        { signal: scope.signal }
      )
    ]);
    return { settings, status, edges, runs };
  }

  async getProgress(scope: ScopeToken): Promise<SemanticProgressSnapshot> {
    const [status, runs] = await Promise.all([
      this.client.operation(
        "memory.get_semantic_graph_status",
        { projectId: scope.projectId },
        { signal: scope.signal }
      ),
      this.client.operation(
        "memory.list_semantic_graph_runs",
        { projectId: scope.projectId },
        { signal: scope.signal }
      )
    ]);
    return { status, runs };
  }

  async getStatusAndEdges(scope: ScopeToken): Promise<SemanticStatusEdgesSnapshot> {
    const [status, edges] = await Promise.all([
      this.client.operation(
        "memory.get_semantic_graph_status",
        { projectId: scope.projectId },
        { signal: scope.signal }
      ),
      this.client.operation(
        "memory.list_semantic_edges",
        { projectId: scope.projectId },
        { signal: scope.signal }
      )
    ]);
    return { status, edges };
  }

  async getAuthoritative(
    scope: ScopeToken,
    graphRelationshipParams: Readonly<Record<string, unknown>>
  ): Promise<SemanticAuthoritativeSnapshot> {
    const [status, edges, runs, inbox, graph] = await Promise.all([
      this.client.operation(
        "memory.get_semantic_graph_status",
        { projectId: scope.projectId },
        { signal: scope.signal }
      ),
      this.client.operation(
        "memory.list_semantic_edges",
        { projectId: scope.projectId },
        { signal: scope.signal }
      ),
      this.client.operation(
        "memory.list_semantic_graph_runs",
        { projectId: scope.projectId },
        { signal: scope.signal }
      ),
      this.client.operation(
        "memory.list_inbox",
        { projectId: scope.projectId },
        { signal: scope.signal }
      ),
      this.client.operation(
        "memory.get_graph",
        {
          ...graphRelationshipParams,
          projectId: scope.projectId
        },
        { signal: scope.signal }
      )
    ]);
    return { status, edges, runs, inbox, graph };
  }
}
