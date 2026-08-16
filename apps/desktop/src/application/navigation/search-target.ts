import type { MemoryDocument, SearchResult } from "@zharwing/memory-core";
import { routePath } from "../../app/routing/route-registry.js";
import { findDocumentForSearchResult } from "../../utils/documents.js";

export type SearchTarget =
  | { readonly kind: "document"; readonly documentId: string }
  | { readonly kind: "session"; readonly sessionId: string }
  | { readonly kind: "workstream"; readonly workstreamId: string }
  | { readonly kind: "proposal"; readonly proposalId: string }
  | { readonly kind: "context-bundle"; readonly bundleId: string };

export type SearchTargetResolution =
  | { readonly status: "available"; readonly target: SearchTarget }
  | { readonly status: "unavailable"; readonly reason: "document-missing" | "identifier-missing" };

/** One activation authority for every search projection kind. */
export function resolveSearchTarget(
  result: SearchResult,
  documents: readonly MemoryDocument[]
): SearchTargetResolution {
  if (!result.id) return { status: "unavailable", reason: "identifier-missing" };
  switch (result.type) {
    case "document": {
      const document = findDocumentForSearchResult(documents, result);
      return document
        ? { status: "available", target: { kind: "document", documentId: document.id } }
        : { status: "unavailable", reason: "document-missing" };
    }
    case "session":
      return { status: "available", target: { kind: "session", sessionId: result.id } };
    case "workstream":
      return { status: "available", target: { kind: "workstream", workstreamId: result.id } };
    case "proposed-update":
      return { status: "available", target: { kind: "proposal", proposalId: result.id } };
    case "context-bundle":
      return { status: "available", target: { kind: "context-bundle", bundleId: result.id } };
  }
}

export function searchTargetPath(projectId: string, target: SearchTarget): string {
  switch (target.kind) {
    case "document":
      return routePath("docs", { projectId, query: { doc: target.documentId } });
    case "session":
      return routePath("sessions", { projectId, query: { session: target.sessionId } });
    case "workstream":
      return routePath("workstreams", { projectId, query: { workstream: target.workstreamId } });
    case "proposal":
      return routePath("inbox", { projectId, query: { proposal: target.proposalId } });
    case "context-bundle":
      return routePath("context", { projectId, query: { bundle: target.bundleId } });
  }
}
