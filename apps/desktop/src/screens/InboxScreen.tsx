import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react-lite";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../stores/store-context.js";
import { KeyValue, Panel, Screen } from "../components/layout.js";
import { LibraryTabs } from "../components/SectionTabs.js";
import { DataTable } from "../components/DataTable.js";
import { ConfirmDeleteButton } from "../components/ConfirmDeleteButton.js";
import { graphRulesFromProposalPatch } from "../utils/graph-proposals.js";
import { semanticEdgesFromProposalPatch, type SemanticProposalEdge } from "../utils/semantic-proposals.js";

export const InboxScreen = observer(function InboxScreen() {
  const store = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedProposalId, setSelectedProposalId] = useState(searchParams.get("proposal") || "");
  const selectedProposal = store.inbox.find((item) => item.id === selectedProposalId) || store.inbox[0];
  const graphProposalRules = selectedProposal?.type === "graph-update"
    ? graphRulesFromProposalPatch(selectedProposal.proposedPatch)
    : undefined;
  const semanticProposalPatch = selectedProposal?.type === "graph-update"
    ? semanticEdgesFromProposalPatch(selectedProposal.proposedPatch)
    : undefined;
  const semanticProposalSummary = useMemo(
    () => semanticProposalPatch ? summarizeSemanticProposal(semanticProposalPatch.edges) : undefined,
    [selectedProposal?.id, selectedProposal?.proposedPatch]
  );

  useEffect(() => {
    const urlProposalId = searchParams.get("proposal") || "";
    setSelectedProposalId((current) => current === urlProposalId ? current : urlProposalId);
  }, [searchParams]);

  useEffect(() => {
    if (selectedProposalId && store.inbox.length > 0 && !store.inbox.some((item) => item.id === selectedProposalId)) {
      closeInboxProposal(true);
    }
  }, [selectedProposalId, store.inbox]);

  function updateInboxSearchParams(proposalId: string | null, replace = false) {
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);
      if (proposalId) nextParams.set("proposal", proposalId);
      else nextParams.delete("proposal");
      return nextParams;
    }, { replace });
  }

  function openInboxProposal(proposalId: string) {
    setSelectedProposalId(proposalId);
    updateInboxSearchParams(proposalId);
  }

  function closeInboxProposal(replace = false) {
    setSelectedProposalId("");
    updateInboxSearchParams(null, replace);
  }

  return (
    <Screen title="Memory Inbox">
      <LibraryTabs />
      <DataTable
        columns={["created", "status", "type", "confidence", "reason"]}
        rows={store.inbox}
        selectedRowId={selectedProposal?.id}
        onRowClick={(proposal) => openInboxProposal(proposal.id)}
      />
      {selectedProposal ? (
        <Panel title="Selected Proposal">
          <div className="inline-form compact">
            <select value={selectedProposal.id} onChange={(event) => openInboxProposal(event.target.value)}>
              {store.inbox.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.status} - {item.type} - {item.reason}
                </option>
              ))}
            </select>
            <ConfirmDeleteButton
              itemType="inbox-proposal"
              title={selectedProposal.reason || selectedProposal.type}
              label="Move to Trash"
              onConfirm={async () => {
                const deletedProposalId = selectedProposal.id;
                await store.deleteInboxItem(deletedProposalId);
                if (selectedProposalId === deletedProposalId) closeInboxProposal(true);
              }}
            />
            {semanticProposalPatch ? (
              <>
                <button type="button" onClick={() => store.acceptSemanticEdgesProposal(selectedProposal.id)}>
                  Accept All Edges
                </button>
                <button
                  type="button"
                  disabled={!semanticProposalSummary?.confidenceBands.high}
                  onClick={() => store.acceptSemanticEdgesProposal(selectedProposal.id, { minConfidence: 0.85 })}
                >
                  Accept High Confidence
                </button>
                <button
                  type="button"
                  disabled={!semanticProposalSummary || semanticProposalSummary.confidenceBands.high + semanticProposalSummary.confidenceBands.review === 0}
                  onClick={() => store.acceptSemanticEdgesProposal(selectedProposal.id, { minConfidence: 0.55 })}
                >
                  Accept Review+
                </button>
              </>
            ) : (
              <button type="button" onClick={() => store.updateInboxStatus(selectedProposal.id, "accepted")}>Mark Accepted</button>
            )}
            <button type="button" onClick={() => store.updateInboxStatus(selectedProposal.id, "rejected")}>Reject</button>
            {graphProposalRules ? (
              <button type="button" onClick={() => store.applyGraphRulesProposal(selectedProposal.id, graphProposalRules)}>
                Apply Graph Rules
              </button>
            ) : null}
          </div>
          <KeyValue label="Type" value={selectedProposal.type} />
          <KeyValue label="Source" value={selectedProposal.sourceAgent || selectedProposal.sourceKind || "unknown"} />
          <KeyValue label="Confidence" value={selectedProposal.confidence || "unknown"} />
          <KeyValue label="Reason" value={selectedProposal.reason} />
          {semanticProposalPatch ? (
            <div className="semantic-proposal-review">
              <KeyValue label="Run" value={semanticProposalPatch.runId} />
              <KeyValue label="Edges" value={semanticProposalPatch.edges.length} />
              {semanticProposalSummary ? (
                <div className="semantic-proposal-summary">
                  <div className="semantic-proposal-stat-grid">
                    <KeyValue label="High confidence" value={semanticProposalSummary.confidenceBands.high || 0} />
                    <KeyValue label="Review confidence" value={semanticProposalSummary.confidenceBands.review || 0} />
                    <KeyValue label="Low confidence" value={semanticProposalSummary.confidenceBands.low || 0} />
                    <KeyValue label="Avg confidence" value={formatConfidence(semanticProposalSummary.averageConfidence)} />
                  </div>
                  <div className="semantic-proposal-groups">
                    <SemanticGroupList title="Relationship types" rows={semanticProposalSummary.byType} />
                    <SemanticGroupList title="Source areas" rows={semanticProposalSummary.bySourceArea} />
                    <SemanticGroupList title="Target areas" rows={semanticProposalSummary.byTargetArea} />
                  </div>
                </div>
              ) : null}
              <div className="semantic-edge-cards">
                {semanticProposalPatch.edges.map((edge, index) => (
                  <article className="semantic-edge-card" key={`${edge.from}-${edge.to}-${edge.type}-${index}`}>
                    <div className="semantic-edge-card-header">
                      <strong>{compactGraphNodeId(edge.from)} → {compactGraphNodeId(edge.to)}</strong>
                      <span>{edge.type} · {formatConfidence(edge.confidence)}</span>
                    </div>
                    <p>{edge.reason}</p>
                    {edge.evidence.length ? (
                      <div className="semantic-edge-evidence-list">
                        {edge.evidence.slice(0, 2).map((item, evidenceIndex) => (
                          <blockquote key={`${edge.from}-${edge.to}-${index}-${evidenceIndex}`}>
                            {item.quote}
                            {item.sourcePath || item.documentId ? (
                              <cite>{[item.sourcePath, item.documentId].filter(Boolean).join(" / ")}</cite>
                            ) : null}
                          </blockquote>
                        ))}
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ) : null}
          <pre className="markdown-preview">{selectedProposal.proposedPatch || "No proposed patch provided."}</pre>
        </Panel>
      ) : null}
    </Screen>
  );
});

function SemanticGroupList({
  title,
  rows
}: {
  title: string;
  rows: Array<{ label: string; count: number; averageConfidence: number }>;
}) {
  return (
    <section>
      <h3>{title}</h3>
      <div className="semantic-proposal-group-rows">
        {rows.map((row) => (
          <div key={row.label}>
            <span>{row.label}</span>
            <strong>{row.count}</strong>
            <small>{formatConfidence(row.averageConfidence)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function summarizeSemanticProposal(edges: SemanticProposalEdge[]) {
  const confidenceBands = {
    high: 0,
    review: 0,
    low: 0
  };
  let confidenceTotal = 0;
  for (const edge of edges) {
    confidenceTotal += edge.confidence;
    const band = semanticConfidenceBand(edge.confidence);
    confidenceBands[band] += 1;
  }

  return {
    averageConfidence: edges.length ? confidenceTotal / edges.length : 0,
    confidenceBands,
    byType: summarizeSemanticGroups(edges.map((edge) => ({
      label: edge.type,
      confidence: edge.confidence
    }))),
    bySourceArea: summarizeSemanticGroups(edges.map((edge) => ({
      label: semanticGraphArea(edge.from),
      confidence: edge.confidence
    }))),
    byTargetArea: summarizeSemanticGroups(edges.map((edge) => ({
      label: semanticGraphArea(edge.to),
      confidence: edge.confidence
    })))
  };
}

function summarizeSemanticGroups(items: Array<{ label: string; confidence: number }>) {
  const groups = new Map<string, { label: string; count: number; confidenceTotal: number }>();
  for (const item of items) {
    const label = item.label || "unknown";
    const current = groups.get(label) || { label, count: 0, confidenceTotal: 0 };
    current.count += 1;
    current.confidenceTotal += item.confidence;
    groups.set(label, current);
  }
  return [...groups.values()]
    .map((group) => ({
      label: group.label,
      count: group.count,
      averageConfidence: group.count ? group.confidenceTotal / group.count : 0
    }))
    .sort((left, right) => right.count - left.count || right.averageConfidence - left.averageConfidence || left.label.localeCompare(right.label))
    .slice(0, 8);
}

function semanticConfidenceBand(confidence: number): "high" | "review" | "low" {
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.55) return "review";
  return "low";
}

function semanticGraphArea(nodeId: string): string {
  const [kind, ...rest] = nodeId.split(":");
  const raw = rest.join(":") || nodeId;
  if (kind === "doc") return "document";
  if (kind === "repo") return "repo";
  if (kind === "service") return "service";
  if (kind === "package") return "package";
  if (kind === "topic") return "topic";
  if (kind === "diagram-group") return "diagram group";
  return kind || raw || "unknown";
}

function compactGraphNodeId(nodeId: string): string {
  const [kind, ...rest] = nodeId.split(":");
  const value = rest.join(":") || nodeId;
  if (kind === "doc") return `doc:${value.slice(0, 8)}`;
  if (kind === "repo") return value.split(/[\\/]/).filter(Boolean).pop() || value;
  return value.length > 54 ? `${value.slice(0, 51)}...` : value;
}

function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
