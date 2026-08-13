import { semanticEdgesFromProposalPatch } from "@zharwing/memory-semantic-graph/proposals";
import type { ProposedMemoryUpdate } from "@zharwing/memory-core";

export function currentInboxItems(items: readonly ProposedMemoryUpdate[]): ProposedMemoryUpdate[] {
  const currentSemanticId = currentAiRelationshipProposalId(items);
  return items.filter((item) => {
    if (!isAiRelationshipProposal(item)) return true;
    return item.id === currentSemanticId && isActionableInboxItem(item);
  });
}

export function pendingInboxItems(items: readonly ProposedMemoryUpdate[]): ProposedMemoryUpdate[] {
  return currentInboxItems(items).filter(isActionableInboxItem);
}

export function pendingInboxReviewCount(items: readonly ProposedMemoryUpdate[]): number {
  return pendingInboxItems(items).reduce((total, item) => total + inboxReviewUnitCount(item), 0);
}

export function isAiRelationshipProposal(item: ProposedMemoryUpdate): boolean {
  return Boolean(aiRelationshipProposalPatch(item));
}

function currentAiRelationshipProposalId(items: readonly ProposedMemoryUpdate[]): string | undefined {
  const semanticItems = items.filter(isAiRelationshipProposal);
  return newestByCreated(semanticItems)?.id;
}

function inboxReviewUnitCount(item: ProposedMemoryUpdate): number {
  return aiRelationshipProposalPatch(item)?.edges.length || 1;
}

function aiRelationshipProposalPatch(item: ProposedMemoryUpdate) {
  return item.type === "graph-update"
    ? semanticEdgesFromProposalPatch(item.proposedPatch)
    : undefined;
}

function isActionableInboxItem(item: ProposedMemoryUpdate): boolean {
  return item.status === "pending" || item.status === "edited";
}

function newestByCreated(items: readonly ProposedMemoryUpdate[]): ProposedMemoryUpdate | undefined {
  return [...items].sort((a, b) => String(b.created || "").localeCompare(String(a.created || "")))[0];
}
