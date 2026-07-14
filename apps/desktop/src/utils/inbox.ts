import { semanticEdgesFromProposalPatch } from "./semantic-proposals.js";

export function currentInboxItems(items: any[]): any[] {
  const currentSemanticId = currentAiRelationshipProposalId(items);
  return items.filter((item) => {
    if (!isAiRelationshipProposal(item)) return true;
    return item.id === currentSemanticId && isActionableInboxItem(item);
  });
}

export function pendingInboxItems(items: any[]): any[] {
  return currentInboxItems(items).filter(isActionableInboxItem);
}

export function pendingInboxReviewCount(items: any[]): number {
  return pendingInboxItems(items).reduce((total, item) => total + inboxReviewUnitCount(item), 0);
}

export function isAiRelationshipProposal(item: any): boolean {
  return Boolean(aiRelationshipProposalPatch(item));
}

function currentAiRelationshipProposalId(items: any[]): string | undefined {
  const semanticItems = items.filter(isAiRelationshipProposal);
  return newestByCreated(semanticItems)?.id;
}

function inboxReviewUnitCount(item: any): number {
  return aiRelationshipProposalPatch(item)?.edges.length || 1;
}

function aiRelationshipProposalPatch(item: any) {
  return item?.type === "graph-update"
    ? semanticEdgesFromProposalPatch(item.proposedPatch)
    : undefined;
}

function isActionableInboxItem(item: any): boolean {
  return item?.status === "pending" || item?.status === "edited";
}

function newestByCreated(items: any[]): any | undefined {
  return [...items].sort((a, b) => String(b.created || "").localeCompare(String(a.created || "")))[0];
}
