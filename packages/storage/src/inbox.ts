import path from "node:path";
import {
  createId,
  nowIso,
  type Project,
  type ProposedMemoryUpdate,
  type ProposedUpdateStatus,
  type ProposedUpdateType
} from "@zharwing/memory-core";
import { listFiles, readJson, writeJson } from "./fs.js";
import { promises as fs } from "node:fs";

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
  return updates.filter(isDefined).sort((a, b) => b.created.localeCompare(a.created));
}

export async function deleteProposedUpdates(project: Project, proposalIds: string[]): Promise<{ deleted: number }> {
  let deleted = 0;
  for (const proposalId of new Set(proposalIds.filter(Boolean))) {
    const filePath = proposalPath(project, proposalId);
    try {
      await fs.unlink(filePath);
      deleted += 1;
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if (code !== "ENOENT") throw error;
    }
  }
  return { deleted };
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
  const filePath = proposalPath(project, update.id);
  await writeJson(filePath, update);
}

function proposalPath(project: Project, proposalId: string): string {
  return path.join(project.memoryRoot, "inbox", "proposed-updates", `${proposalId}.json`);
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
