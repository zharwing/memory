import path from "node:path";
import {
  createId,
  nowIso,
  type Project,
  type ProposedMemoryUpdate,
  type ProposedUpdateStatus,
  type ProposedUpdateType
} from "@aimem/core";
import { listFiles, readJson, writeJson } from "./fs.js";

export async function proposeMemoryUpdate(args: {
  project: Project;
  type: ProposedUpdateType;
  sourceSession?: string;
  sourceAgent?: string;
  sourceKind: ProposedMemoryUpdate["sourceKind"];
  confidence?: ProposedMemoryUpdate["confidence"];
  affectedFiles?: string[];
  targetDocument?: string;
  proposedPatch: string;
  reason: string;
}): Promise<ProposedMemoryUpdate> {
  const update: ProposedMemoryUpdate = {
    id: createId("proposal"),
    projectId: args.project.id,
    type: args.type,
    status: "pending",
    sourceSession: args.sourceSession,
    sourceAgent: args.sourceAgent,
    sourceKind: args.sourceKind,
    created: nowIso(),
    confidence: args.confidence || "medium",
    affectedFiles: args.affectedFiles || [],
    targetDocument: args.targetDocument,
    proposedPatch: args.proposedPatch,
    reason: args.reason
  };
  await writeProposal(args.project, update);
  return update;
}

export async function listProposedUpdates(project: Project): Promise<ProposedMemoryUpdate[]> {
  const root = path.join(project.memoryRoot, "inbox", "proposed-updates");
  const files = await listFiles(root, (file) => file.endsWith(".json"));
  const updates = await Promise.all(files.map((file) => readJson<ProposedMemoryUpdate | undefined>(file, undefined)));
  return updates.filter(Boolean).sort((a, b) => b.created.localeCompare(a.created));
}

export async function updateProposalStatus(args: {
  project: Project;
  proposalId: string;
  status: ProposedUpdateStatus;
  editedPatch?: string;
}): Promise<ProposedMemoryUpdate> {
  const updates = await listProposedUpdates(args.project);
  const update = updates.find((candidate) => candidate.id === args.proposalId);
  if (!update) throw new Error(`Proposal not found: ${args.proposalId}`);
  const next: ProposedMemoryUpdate = {
    ...update,
    status: args.status,
    proposedPatch: args.editedPatch || update.proposedPatch
  };
  await writeProposal(args.project, next);
  return next;
}

async function writeProposal(project: Project, update: ProposedMemoryUpdate): Promise<void> {
  const filePath = path.join(project.memoryRoot, "inbox", "proposed-updates", `${update.id}.json`);
  await writeJson(filePath, update);
}
