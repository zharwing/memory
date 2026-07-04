import {
  type ProjectRegistry,
  listSemanticRuns,
  proposeMemoryUpdate,
  readSemanticEdges,
  readSemanticGraphSettings,
  readSemanticRun,
  writeSemanticEdges,
  writeSemanticGraphSettings
} from "@aimem/storage";
import { semanticEdgesProposalPatch } from "@aimem/semantic-graph";
import {
  createId,
  nowIso,
  type ProposedMemoryUpdate,
  type SemanticGraphEdge,
  type SemanticGraphEdgeStatus,
  type SemanticGraphEdgeType,
  type SemanticGraphEvidence,
  type SemanticGraphSettings
} from "@aimem/core";
import { resolveProject } from "./project-resolver.js";

export class SemanticGraphService {
  constructor(private readonly registry: ProjectRegistry) {}

  async getSettings(params: { projectId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    return readSemanticGraphSettings(project);
  }

  async updateSettings(params: {
    projectId: string;
    settings?: Partial<SemanticGraphSettings>;
  } & Partial<SemanticGraphSettings>) {
    const project = await resolveProject(this.registry, params.projectId);
    const current = await readSemanticGraphSettings(project);
    const { projectId: _projectId, settings: nestedSettings, ...directSettings } = params;
    const next = normalizeSettingsPatch({
      ...current,
      ...(nestedSettings || directSettings),
      version: 1
    });
    return writeSemanticGraphSettings(project, next);
  }

  async getStatus(params: { projectId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const [settings, edgeFile, runs] = await Promise.all([
      readSemanticGraphSettings(project),
      readSemanticEdges(project),
      listSemanticRuns(project)
    ]);
    const edgeCounts = countByStatus(edgeFile.edges);
    return {
      projectId: project.id,
      settings,
      edgeCounts,
      runCounts: {
        total: runs.length,
        latest: runs[0]
      },
      updated: edgeFile.updated
    };
  }

  async listEdges(params: {
    projectId: string;
    status?: SemanticGraphEdgeStatus | SemanticGraphEdgeStatus[];
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const edgeFile = await readSemanticEdges(project);
    const statuses = statusSet(params.status);
    return statuses
      ? edgeFile.edges.filter((edge) => statuses.has(edge.status))
      : edgeFile.edges;
  }

  async updateEdgeStatus(params: {
    projectId: string;
    edgeIds: string[];
    status: SemanticGraphEdgeStatus;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const edgeFile = await readSemanticEdges(project);
    const edgeIds = new Set(params.edgeIds);
    const now = nowIso();
    let updated = 0;
    const edges = edgeFile.edges.map((edge) => {
      if (!edgeIds.has(edge.id)) return edge;
      updated += 1;
      return {
        ...edge,
        status: params.status,
        updated: now
      };
    });
    if (updated !== params.edgeIds.length) {
      const known = new Set(edgeFile.edges.map((edge) => edge.id));
      const missing = params.edgeIds.filter((edgeId) => !known.has(edgeId));
      throw new Error(`Semantic edge not found: ${missing.join(", ")}`);
    }
    const next = await writeSemanticEdges(project, edges);
    return {
      updated,
      edges: next.edges.filter((edge) => edgeIds.has(edge.id))
    };
  }

  async listRuns(params: { projectId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    return listSemanticRuns(project);
  }

  async getRun(params: { projectId: string; runId: string }) {
    const project = await resolveProject(this.registry, params.projectId);
    const run = await readSemanticRun(project, params.runId);
    if (!run) throw new Error(`Semantic graph run not found: ${params.runId}`);
    return run;
  }

  async proposeEdges(params: {
    projectId: string;
    runId?: string;
    sourceAgent?: string;
    confidence?: ProposedMemoryUpdate["confidence"];
    affectedFiles?: string[];
    reason?: string;
    edges: Array<{
      from: string;
      to: string;
      type: SemanticGraphEdgeType;
      confidence: number;
      reason: string;
      evidence?: Array<string | SemanticGraphEvidence>;
      deterministicEdgeId?: string;
    }>;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    if (!Array.isArray(params.edges) || params.edges.length === 0) {
      throw new Error("At least one semantic edge proposal is required.");
    }

    const runId = params.runId || createId("external-semantic-run");
    const now = nowIso();
    const edges: SemanticGraphEdge[] = params.edges.map((edge) => ({
      id: createId("sem-edge"),
      projectId: project.id,
      from: String(edge.from || ""),
      to: String(edge.to || ""),
      type: edge.type,
      status: "proposed",
      confidence: clampConfidence(edge.confidence),
      reason: edge.reason,
      evidence: normalizeEvidence(edge.evidence),
      source: {
        kind: "external-ai",
        runId,
        sourceAgent: params.sourceAgent
      },
      created: now,
      updated: now,
      deterministicEdgeId: edge.deterministicEdgeId
    }));

    const invalid = edges.find((edge) => !edge.from || !edge.to || !edge.reason);
    if (invalid) {
      throw new Error("Each semantic edge proposal requires from, to, and reason.");
    }

    return proposeMemoryUpdate({
      project,
      type: "graph-update",
      sourceKind: "external-ai",
      sourceAgent: params.sourceAgent,
      confidence: params.confidence || confidenceForEdges(edges),
      affectedFiles: params.affectedFiles || [],
      proposedPatch: semanticEdgesProposalPatch(runId, edges),
      reason: params.reason || `Semantic graph relationship proposal (${edges.length} edge${edges.length === 1 ? "" : "s"})`
    });
  }
}

function normalizeSettingsPatch(settings: SemanticGraphSettings): SemanticGraphSettings {
  return {
    ...settings,
    autoAcceptThreshold: clampConfidence(settings.autoAcceptThreshold),
    reviewThreshold: clampConfidence(settings.reviewThreshold),
    discardBelowThreshold: clampConfidence(settings.discardBelowThreshold),
    maxCandidatesPerDocument: clampInteger(settings.maxCandidatesPerDocument, 1, 100),
    maxClusterSize: clampInteger(settings.maxClusterSize, 1, 100)
  };
}

function countByStatus(edges: SemanticGraphEdge[]): Record<SemanticGraphEdgeStatus, number> {
  return edges.reduce<Record<SemanticGraphEdgeStatus, number>>(
    (counts, edge) => {
      counts[edge.status] += 1;
      return counts;
    },
    {
      proposed: 0,
      accepted: 0,
      rejected: 0,
      "auto-accepted": 0
    }
  );
}

function statusSet(input: SemanticGraphEdgeStatus | SemanticGraphEdgeStatus[] | undefined): Set<SemanticGraphEdgeStatus> | undefined {
  if (!input) return undefined;
  return new Set(Array.isArray(input) ? input : [input]);
}

function normalizeEvidence(input: Array<string | SemanticGraphEvidence> | undefined): SemanticGraphEvidence[] {
  return (input || []).map((item) => {
    if (typeof item === "string") {
      return { quote: item };
    }
    return {
      documentId: item.documentId,
      quote: item.quote,
      location: item.location,
      sourcePath: item.sourcePath
    };
  });
}

function confidenceForEdges(edges: SemanticGraphEdge[]): ProposedMemoryUpdate["confidence"] {
  const average = edges.reduce((sum, edge) => sum + edge.confidence, 0) / edges.length;
  if (average >= 0.82) return "high";
  if (average >= 0.55) return "medium";
  return "low";
}

function clampConfidence(input: number): number {
  if (Number.isNaN(input)) return 0;
  return Math.max(0, Math.min(1, input));
}

function clampInteger(input: number, min: number, max: number): number {
  const value = Number.isFinite(input) ? Math.round(input) : min;
  return Math.max(min, Math.min(max, value));
}
