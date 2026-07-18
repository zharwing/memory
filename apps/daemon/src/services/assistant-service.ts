import {
  classifyDocumentDeterministically,
  getAssistantStatus,
  prepareReturnSummaryDeterministically,
  recommendedModels,
  summarizeSessionDeterministically
} from "@zharwing/memory-assistant";
import type { ProjectRegistry } from "@zharwing/memory-store";
import {
  getSession,
  listProjectDocuments,
  listProjectSessions,
  proposeMemoryUpdate as storageProposeMemoryUpdate
} from "@zharwing/memory-store";
import { resolveProject } from "./project-resolver.js";

export class AssistantService {
  constructor(private readonly registry: ProjectRegistry) {}

  async assistantStatus(params: { projectId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    return {
      ...getAssistantStatus(project),
      recommendedModels: recommendedModels()
    };
  }

  async summarizeSession(params: { projectId: string; sessionId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const session = await getSession(project, params.sessionId);
    if (!session) throw new Error(`Session not found: ${params.sessionId}`);
    const draft = summarizeSessionDeterministically(session);
    return storageProposeMemoryUpdate({
      project,
      type: "session-summary",
      sourceSession: session.id,
      sourceAgent: "local-memory-assistant",
      sourceKind: "memory-assistant",
      confidence: draft.confidence,
      proposedPatch: draft.patch,
      reason: draft.reason
    });
  }

  async prepareReturnSummary(params: { projectId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const draft = prepareReturnSummaryDeterministically(await listProjectSessions(project));
    return storageProposeMemoryUpdate({
      project,
      type: "session-summary",
      sourceAgent: "local-memory-assistant",
      sourceKind: "memory-assistant",
      confidence: draft.confidence,
      proposedPatch: draft.patch,
      reason: draft.reason
    });
  }

  async classifyDocument(params: { projectId: string; documentId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const docs = await listProjectDocuments(project);
    const doc = docs.find((candidate) => candidate.id === params.documentId);
    if (!doc) throw new Error(`Document not found: ${params.documentId}`);
    const draft = classifyDocumentDeterministically(doc);
    return storageProposeMemoryUpdate({
      project,
      type: "doc-update",
      sourceAgent: "local-memory-assistant",
      sourceKind: "memory-assistant",
      confidence: draft.confidence,
      targetDocument: doc.id,
      proposedPatch: draft.patch,
      reason: draft.reason
    });
  }
}
