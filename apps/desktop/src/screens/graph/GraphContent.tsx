import { Link } from "react-router-dom";
import { Empty } from "../../components/layout.js";
import {
  StructuredGraphView,
  type StructuredGraphViewAdapters
} from "../../features/graph/accessible/StructuredGraphView.js";
import {
  graphDocumentIdForGraphNode,
  isGraphFocusableNodeId
} from "./graph-selection.js";
import { graphEdgeLabel } from "./graph-presentation.js";
import { RawStorageAudit } from "./RawStorageAudit.js";
import { GraphMap } from "./GraphMap.js";
import type { GraphMapEdge, GraphMapNode } from "./graph-flow-model.js";
import type { GraphScreenController } from "./useGraphScreenController.js";

const structuredGraphAdapters: StructuredGraphViewAdapters<GraphMapNode, GraphMapEdge> = {
  documentIdForNode: (node) => graphDocumentIdForGraphNode(node.id, node.graphNode),
  canFocusNode: (node) => isGraphFocusableNodeId(node.id),
  edgeTypeLabel: graphEdgeLabel
};

export function GraphContent({ controller }: { controller: GraphScreenController["content"] }) {
  const { model, actions } = controller;

  if (model.status === "idle" || model.status === "loading") {
    return <p className="panel-help" role="status">Loading saved relationships...</p>;
  }

  if (model.status === "failure") {
    return <p className="panel-help" role="alert">The graph could not be loaded. Refresh to try again.</p>;
  }

  return (
    <>
      {model.status === "refreshing" ? (
        <p className="panel-help" role="status">Refreshing saved relationships; showing the last accepted result.</p>
      ) : model.observationPartial ? (
        <p className="panel-help" role="status">Showing a partial graph result; more relationships may exist.</p>
      ) : null}
      {model.isRawGraph ? (
        <RawStorageAudit graph={model.graph} />
      ) : model.elements.nodes.length ? (
        <>
          <GraphMap
            model={model.viewport}
            actions={actions}
          />
          <StructuredGraphView
            model={model.viewport}
            actions={actions}
            adapters={structuredGraphAdapters}
          />
        </>
      ) : model.status === "refreshing" || model.observationPartial ? null
      : model.observationComplete && model.viewport.selection.focusedNodeId && model.stats.relationships > 0 ? (
        <Empty
          className="graph-empty-state"
          title="No links for this focus"
          body="This item has no visible saved links in the current graph view. Reset focus to see the accepted relationship map."
          action={<button type="button" onClick={actions.resetFocus}>Show full graph</button>}
        />
      ) : model.observationComplete ? (
        <Empty
          className="graph-empty-state"
          title="No saved relationships yet"
          body="AI may have suggestions waiting, but the graph only shows relationships after you accept them. Review the Inbox first; accepted links will appear here."
          action={<Link className="button-link" to={model.inboxRoute}>Review Inbox</Link>}
        />
      ) : (
        <p className="panel-help" role="status">Loading saved relationships...</p>
      )}
    </>
  );
}
