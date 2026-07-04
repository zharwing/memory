import path from "node:path";
import type { ProjectRegistry } from "@aimem/storage";
import {
  listProposedUpdates,
  movePathToTrash,
  proposeMemoryUpdate as storageProposeMemoryUpdate,
  updateProposalStatus as storageUpdateProposalStatus
} from "@aimem/storage";
import { resolveProject } from "./project-resolver.js";

export class InboxService {
  constructor(private readonly registry: ProjectRegistry) {}

  async proposeMemoryUpdate(params: {
    projectId: string;
    type: Parameters<typeof storageProposeMemoryUpdate>[0]["type"];
    sourceSession?: string;
    sourceAgent?: string;
    sourceKind: Parameters<typeof storageProposeMemoryUpdate>[0]["sourceKind"];
    confidence?: Parameters<typeof storageProposeMemoryUpdate>[0]["confidence"];
    affectedFiles?: string[];
    targetDocument?: string;
    proposedPatch: string;
    reason: string;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    return storageProposeMemoryUpdate({ ...params, project });
  }

  async proposeGraphUpdate(params: {
    projectId: string;
    sourceSession?: string;
    sourceAgent?: string;
    confidence?: Parameters<typeof storageProposeMemoryUpdate>[0]["confidence"];
    affectedFiles?: string[];
    proposedPatch: string;
    reason: string;
  }) {
    return this.proposeMemoryUpdate({
      projectId: params.projectId,
      type: "graph-update",
      sourceSession: params.sourceSession,
      sourceAgent: params.sourceAgent,
      sourceKind: "external-ai",
      confidence: params.confidence,
      affectedFiles: params.affectedFiles,
      proposedPatch: params.proposedPatch,
      reason: params.reason
    });
  }

  async listInbox(params: { projectId: string }) {
    return listProposedUpdates(await resolveProject(this.registry, params.projectId));
  }

  async updateInboxStatus(params: {
    projectId: string;
    proposalId: string;
    status: Parameters<typeof storageUpdateProposalStatus>[0]["status"];
    editedPatch?: string;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    return storageUpdateProposalStatus({ project, ...params });
  }

  async deleteInboxItem(params: { projectId: string; proposalId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const proposals = await listProposedUpdates(project);
    const proposal = proposals.find((candidate) => candidate.id === params.proposalId);
    if (!proposal) throw new Error(`Inbox proposal not found: ${params.proposalId}`);
    return movePathToTrash({
      memoryRoot: this.registry.memoryRoot,
      type: "inbox-proposal",
      projectId: project.id,
      projectName: project.name,
      itemId: proposal.id,
      title: proposal.reason || proposal.type,
      originalPath: path.join(project.memoryRoot, "inbox", "proposed-updates", `${proposal.id}.json`),
      critical: false,
      details: { type: proposal.type, status: proposal.status, confidence: proposal.confidence }
    });
  }
}
