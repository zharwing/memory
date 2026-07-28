import { useMemo } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { KeyValue, Panel, RawTextPreview, Screen } from "../components/layout.js";
import { LibraryTabs } from "../components/SectionTabs.js";
import { DataTable } from "../components/DataTable.js";
import { ConfirmDeleteButton } from "../components/ConfirmDeleteButton.js";
import { useCloseWhenMissing, useSearchParamState } from "../hooks/useSearchParamState.js";
import { graphRulesFromProposalPatch } from "../utils/graph-proposals.js";
import { semanticEdgesFromProposalPatch, type SemanticGraphProposalPatch } from "@zharwing/memory-semantic-graph/proposals";
import { formatConfidence, formatShortDateTime, timestampRenderers, titleCaseSlug } from "../utils/format.js";
import { graphNodeDisplayLabel, semanticGraphArea } from "./graph/graph-display.js";
import { currentInboxItems } from "../utils/inbox.js";

type SemanticProposalEdge = SemanticGraphProposalPatch["edges"][number];

export const InboxScreen = observer(function InboxScreen() {
  const store = useStore();
  const [selectedProposalId, setProposalSearchParam] = useSearchParamState("proposal");
  const visibleInbox = useMemo(() => currentInboxItems(store.inbox), [store.inbox]);
  const selectedProposal = visibleInbox.find((item) => item.id === selectedProposalId) || visibleInbox[0];
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
  const documentTitles = useMemo(
    () => new Map<string, string>(store.docs.map((doc) => [String(doc.id), String(doc.title || doc.id)])),
    [store.docs]
  );
  const semanticProposalPlainSummary = useMemo(
    () => semanticProposalPatch ? summarizeSemanticProposalForReview(semanticProposalPatch, documentTitles) : undefined,
    [semanticProposalPatch, documentTitles]
  );
  const inboxRows = visibleInbox.map((item) => ({
    ...item,
    status: proposalDisplayStatus(item),
    type: proposalDisplayType(item),
    reason: proposalDisplayReason(item)
  }));

  useCloseWhenMissing(
    selectedProposalId,
    visibleInbox.length > 0 && !visibleInbox.some((item) => item.id === selectedProposalId),
    () => closeInboxProposal(true)
  );

  function openInboxProposal(proposalId: string) {
    setProposalSearchParam(proposalId);
  }

  function closeInboxProposal(replace = false) {
    setProposalSearchParam(null, { replace });
  }

  function regenerateRelationshipReview() {
    void store.analyzeSemanticGraph({
      mode: "review",
      dryRun: false
    });
  }

  function removeSemanticProposalEdge(edgeIndex: number) {
    if (!selectedProposal || !semanticProposalPatch) return;
    const remainingEdges = semanticProposalPatch.edges.filter((_, index) => index !== edgeIndex);
    if (remainingEdges.length === 0) {
      void store.updateInboxStatus(selectedProposal.id, "rejected");
      return;
    }
    void store.updateInboxStatus(
      selectedProposal.id,
      "edited",
      JSON.stringify({ ...semanticProposalPatch, edges: remainingEdges }, null, 2)
    );
  }

  return (
    <Screen title="Memory Inbox">
      <LibraryTabs />
      <DataTable
        columns={["created", "status", "type", "confidence", "reason"]}
        rows={inboxRows}
        renderers={timestampRenderers("created")}
        selectedRowId={selectedProposal?.id}
        onRowClick={(proposal) => openInboxProposal(proposal.id)}
      />
      {selectedProposal ? (
        <Panel title={semanticProposalPatch ? "AI Relationship Approval" : "Selected Proposal"}>
          <div className="inline-form compact">
            <select value={selectedProposal.id} onChange={(event) => openInboxProposal(event.target.value)}>
              {visibleInbox.map((item, index) => (
                <option key={item.id} value={item.id}>
                  {proposalOptionLabel(item, index)}
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
                  Accept all
                </button>
                <button
                  type="button"
                  disabled={!semanticProposalSummary?.confidenceBands.high}
                  onClick={() => store.acceptSemanticEdgesProposal(selectedProposal.id, { minConfidence: 0.85 })}
                >
                  Accept high confidence
                </button>
                <button
                  type="button"
                  disabled={!semanticProposalSummary || semanticProposalSummary.confidenceBands.high + semanticProposalSummary.confidenceBands.review === 0}
                  onClick={() => store.acceptSemanticEdgesProposal(selectedProposal.id, { minConfidence: 0.55 })}
                >
                  Accept high + review
                </button>
                <button type="button" disabled={store.loading} onClick={regenerateRelationshipReview}>
                  Regenerate review
                </button>
              </>
            ) : (
              <button type="button" onClick={() => store.updateInboxStatus(selectedProposal.id, "accepted")}>Mark Accepted</button>
            )}
            <button type="button" onClick={() => store.updateInboxStatus(selectedProposal.id, "rejected")}>Reject all</button>
            {graphProposalRules ? (
              <button type="button" onClick={() => store.applyGraphRulesProposal(selectedProposal.id, graphProposalRules)}>
                Apply Graph Rules
              </button>
            ) : null}
          </div>
          {semanticProposalPatch ? (
            <div className="semantic-proposal-review">
              <section className="semantic-proposal-conclusion">
                <span>AI relationship review</span>
                <h3>{semanticProposalPlainSummary?.title || proposalDisplayReason(selectedProposal)}</h3>
                <p>{semanticProposalPlainSummary?.conclusion}</p>
                {semanticProposalPlainSummary?.keyRelationships.length ? (
                  <ul className="semantic-proposal-ai-list">
                    {semanticProposalPlainSummary.keyRelationships.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
                {semanticProposalPlainSummary?.reviewNotes.length ? (
                  <div className="semantic-proposal-review-notes">
                    <strong>Review notes</strong>
                    <ul>
                      {semanticProposalPlainSummary.reviewNotes.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="semantic-proposal-badges">
                  <strong>{semanticProposalPatch.edges.length} suggestions</strong>
                  <strong>{semanticProposalSummary?.confidenceBands.high || 0} high confidence</strong>
                  <strong>{semanticProposalSummary?.confidenceBands.review || 0} need review</strong>
                </div>
              </section>
              {semanticProposalPlainSummary ? (
                <section className="semantic-connection-review-list" aria-label="Suggested relationships">
                  {semanticProposalPlainSummary.connections.map((connection, index) => (
                    <article key={`${connection.from}-${connection.to}-${index}`}>
                      <div className="semantic-connection-main">
                        <div className="semantic-connection-path">
                          <strong>{connection.from}</strong>
                          <span>{connection.label}</span>
                          <strong>{connection.to}</strong>
                          <span className={`semantic-confidence-pill ${connection.confidenceBand}`}>
                            {connection.confidenceLabel}
                          </span>
                        </div>
                        <p>{connection.reason}</p>
                      </div>
                      <div className="semantic-connection-actions">
                        <button
                          type="button"
                          disabled={store.loading}
                          onClick={() => store.acceptSemanticEdgesProposal(selectedProposal.id, { edgeIndexes: [index] })}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          disabled={store.loading}
                          onClick={() => removeSemanticProposalEdge(index)}
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </section>
              ) : null}
              {semanticProposalSummary ? (
                <details className="semantic-proposal-details">
                  <summary>Review summary details</summary>
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
                </details>
              ) : null}
              <details className="semantic-proposal-details">
                <summary>AI reasoning and evidence</summary>
                <div className="semantic-edge-cards">
                  {semanticProposalPatch.edges.map((edge, index) => (
                    <article className="semantic-edge-card" key={`${edge.from}-${edge.to}-${edge.type}-${index}`}>
                      <div className="semantic-edge-card-header">
                        <strong>{graphNodeDisplayLabel(edge.from, documentTitles)} → {graphNodeDisplayLabel(edge.to, documentTitles)}</strong>
                        <span>{edge.type} · {formatConfidence(edge.confidence)}</span>
                      </div>
                      <p>{edge.reason}</p>
                      {edge.evidence.length ? (
                        <div className="semantic-edge-evidence-list">
                          {edge.evidence.slice(0, 2).map((item, evidenceIndex) => (
                            <blockquote key={`${edge.from}-${edge.to}-${index}-${evidenceIndex}`}>
                              {item.quote}
                              {item.sourcePath || item.documentId ? (
                                <cite>{evidenceSourceLabel(item, documentTitles)}</cite>
                              ) : null}
                            </blockquote>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </details>
            </div>
          ) : (
            <>
              <KeyValue label="Type" value={selectedProposal.type} />
              <KeyValue label="Source" value={selectedProposal.sourceAgent || selectedProposal.sourceKind || "unknown"} />
              <KeyValue label="Confidence" value={selectedProposal.confidence || "unknown"} />
              <KeyValue label="Reason" value={selectedProposal.reason} />
            </>
          )}
          <details className="semantic-proposal-details technical">
            <summary>Technical patch</summary>
            {semanticProposalPatch ? <KeyValue label="Run" value={semanticProposalPatch.runId} /> : null}
            <RawTextPreview text={selectedProposal.proposedPatch} fallback="No proposed patch provided." />
          </details>
        </Panel>
      ) : null}
    </Screen>
  );
});

function proposalDisplayReason(item: { type?: string; proposedPatch?: string; reason?: string }) {
  const semanticProposalPatch = item.type === "graph-update"
    ? semanticEdgesFromProposalPatch(item.proposedPatch)
    : undefined;
  if (!semanticProposalPatch) return item.reason || item.type || "Proposal";
  const count = semanticProposalPatch.edges.length;
  return `${count} suggested ${count === 1 ? "link" : "links"} waiting for approval`;
}

function proposalDisplayType(item: { type?: string; proposedPatch?: string }) {
  const semanticProposalPatch = item.type === "graph-update"
    ? semanticEdgesFromProposalPatch(item.proposedPatch)
    : undefined;
  if (semanticProposalPatch) return "AI relationships";
  return item.type || "proposal";
}

function proposalDisplayStatus(item: { type?: string; status?: string; proposedPatch?: string }) {
  const semanticProposalPatch = item.type === "graph-update"
    ? semanticEdgesFromProposalPatch(item.proposedPatch)
    : undefined;
  if (semanticProposalPatch && (item.status === "pending" || item.status === "edited")) return "waiting";
  return item.status || "pending";
}

function proposalOptionLabel(item: { type?: string; status?: string; proposedPatch?: string; reason?: string; created?: string }, index: number) {
  const semanticProposalPatch = item.type === "graph-update"
    ? semanticEdgesFromProposalPatch(item.proposedPatch)
    : undefined;
  const date = item.created ? ` - ${formatShortDateTime(item.created)}` : "";
  if (!semanticProposalPatch) {
    return `${item.status || "pending"} - ${proposalDisplayType(item)} - ${item.reason || "Proposal"}${date}`;
  }
  const count = semanticProposalPatch.edges.length;
  const isCurrent = (item.status === "pending" || item.status === "edited") && index === 0;
  const prefix = isCurrent ? "Current AI relationship approval" : "AI relationship approval";
  return `${prefix} - ${count} suggested ${count === 1 ? "link" : "links"}${date}`;
}

function summarizeSemanticProposalForReview(
  patch: SemanticGraphProposalPatch,
  documentTitles: Map<string, string>
) {
  const summary = patch.summary;
  return {
    title: summary?.title || "AI summary not available",
    conclusion: summary?.summary || "This proposal was created before AI-written review summaries were stored. Re-run AI relationship review to get a real model-generated summary for these suggestions.",
    keyRelationships: summary?.keyRelationships || [],
    reviewNotes: summary?.reviewNotes || [],
    connections: patch.edges.map((edge) => ({
      from: graphNodeDisplayLabel(edge.from, documentTitles),
      to: graphNodeDisplayLabel(edge.to, documentTitles),
      label: relationshipLabel(edge.type),
      reason: plainRelationshipReason(edge),
      confidenceBand: semanticConfidenceBand(edge.confidence),
      confidenceLabel: semanticConfidenceLabel(edge.confidence)
    }))
  };
}

function relationshipLabel(type: string): string {
  if (type === "supports") return "points to";
  if (type === "related") return "related to";
  if (type === "uses") return "uses";
  if (type === "depends-on") return "depends on";
  if (type === "mentions") return "mentions";
  return titleCaseSlug(type);
}

function plainRelationshipReason(edge: SemanticProposalEdge): string {
  if (edge.type === "supports" && edge.to.startsWith("file:")) {
    return cleanReasonSentence(edge.reason) || "The document directly names this file as implementation evidence.";
  }
  if (edge.type === "related" && edge.from.startsWith("doc:") && edge.to.startsWith("doc:")) {
    return cleanReasonSentence(edge.reason);
  }
  return cleanReasonSentence(edge.reason);
}

function evidenceSourceLabel(
  item: { documentId?: string; sourcePath?: string },
  documentTitles: Map<string, string>
): string {
  return [item.sourcePath, item.documentId ? documentTitles.get(item.documentId) || titleCaseSlug(item.documentId.replace(/^doc-/, "")) : ""]
    .filter(Boolean)
    .join(" / ");
}

function cleanReasonSentence(reason: string): string {
  const [firstSentence] = reason.split(/[.!?]\s+/);
  return (firstSentence || reason)
    .replace(/\bsource document\b/gi, "first document")
    .replace(/\btarget document\b/gi, "second document")
    .replace(/\bcandidate document\b/gi, "other document")
    .replace(/\bsource\b/gi, "first item")
    .replace(/\btarget\b/gi, "second item")
    .trim();
}

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

function semanticConfidenceLabel(confidence: number): string {
  const band = semanticConfidenceBand(confidence);
  if (band === "high") return `High confidence · ${formatConfidence(confidence)}`;
  if (band === "review") return `Needs review · ${formatConfidence(confidence)}`;
  return `Low confidence · ${formatConfidence(confidence)}`;
}
