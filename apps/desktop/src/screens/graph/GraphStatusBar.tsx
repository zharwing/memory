import type { GraphScreenController } from "./useGraphScreenController.js";

export function GraphStatusBar({
  status,
  showHelp
}: {
  status: GraphScreenController["status"];
  showHelp: boolean;
}) {
  return (
    <>
      <div className="graph-status-row" aria-label="Graph status">
        <strong>{status.scopeLabel}</strong>
        <span>{status.nodeCount} {status.isRawGraph ? "stored nodes" : "visible nodes"}</span>
        <span>{status.linkCount} {status.isRawGraph ? "context links" : "visible links"}</span>
        <span>{status.relationshipLabel}</span>
        <span>{status.hiddenCount} {status.isRawGraph ? "ownership links" : "hidden"}</span>
        {status.generatedLabel ? <span>{status.generatedLabel}</span> : null}
      </div>
      {showHelp ? (
        <div className="notice graph-explainer compact">
          <strong>Context graph, not storage inventory</strong>
          <p>
            Context map shows saved relationships only. AI suggestions stay in Inbox until you accept them, then they appear here as part of the trusted graph.
          </p>
        </div>
      ) : null}
    </>
  );
}
