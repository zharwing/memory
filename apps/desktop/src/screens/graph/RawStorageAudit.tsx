import type { GraphDisplayModel, GraphTypeSummary } from "./graph-display-types.js";
import {
  graphEdgeLabel,
  summarizeEdgeTypes,
  summarizeNodeTypes
} from "./graph-presentation.js";

export function RawStorageAudit({ graph }: { graph: GraphDisplayModel | undefined }) {
  const nodes = graph?.nodes ?? [];
  const edges = graph?.edges ?? [];
  const nodeTypes = summarizeNodeTypes(nodes);
  const edgeTypes = summarizeEdgeTypes(edges);
  const storageEdges = edges.filter((sourceEdge) => sourceEdge.type === "belongs-to");
  const contextEdges = edges.filter((sourceEdge) => sourceEdge.type !== "belongs-to");

  return (
    <div className="graph-audit-panel">
      <div className="graph-audit-summary">
        <div>
          <strong>{nodes.length}</strong>
          <span>stored graph nodes</span>
        </div>
        <div>
          <strong>{storageEdges.length}</strong>
          <span>storage ownership links</span>
        </div>
        <div>
          <strong>{contextEdges.length}</strong>
          <span>context relationships</span>
        </div>
      </div>
      <div className="graph-audit-grid">
        <section>
          <h3>Node types</h3>
          <GraphAuditRows rows={nodeTypes} />
        </section>
        <section>
          <h3>Edge types</h3>
          <GraphAuditRows
            rows={edgeTypes.map((row) => ({ ...row, type: graphEdgeLabel(row.type) }))}
          />
        </section>
      </div>
      <p className="graph-audit-note">
        Import audit intentionally includes storage ownership edges. Use Context map for the cleaned relationship graph.
      </p>
    </div>
  );
}

function GraphAuditRows({ rows }: { rows: GraphTypeSummary[] }) {
  return (
    <div className="graph-audit-rows">
      {rows.map((row) => (
        <div key={row.type}>
          <span>{row.type}</span>
          <strong>{row.count}</strong>
        </div>
      ))}
    </div>
  );
}
