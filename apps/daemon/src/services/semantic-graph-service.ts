import {
  type ProjectRegistry,
  createSemanticGraphRun,
  listProjectDocuments,
  listProjectSessions,
  listProjectWorkstreams,
  listProposedUpdates,
  listSemanticRuns,
  proposeMemoryUpdate,
  readSemanticEdges,
  readSemanticExtraction,
  readSemanticGraphSettings,
  readSemanticRun,
  semanticCandidateIndexPath,
  updateProposalStatus,
  writeSemanticCandidateIndex,
  writeSemanticEdges,
  writeSemanticExtraction,
  writeSemanticGraphSettings,
  writeSemanticRun
} from "@aimem/storage";
import { buildProjectGraph } from "@aimem/graph";
import {
  callOpenAiCompatibleJson,
  checkOpenAiCompatibleProvider,
  type OpenAiCompatibleProviderConfig
} from "@aimem/assistant-runtime";
import {
  applySemanticEdgePolicy,
  baselineSemanticExtractionFromPlanItem,
  buildSemanticCandidateIndex,
  buildSemanticExtractionPlan,
  semanticDecisionFromProviderJson,
  semanticEdgesFromProposalPatch,
  semanticEdgesProposalPatch,
  semanticExtractionFromProviderJson,
  semanticExtractionMessagesForItem,
  semanticJudgementMessages,
  type SemanticCandidateIndex,
  type SemanticExtractionPlanItem,
  type SemanticRelationshipCandidate,
  type SemanticRelationshipDecision
} from "@aimem/semantic-graph";
import {
  createId,
  nowIso,
  type MemoryDocument,
  type ProposedMemoryUpdate,
  type Project,
  type ProjectGraph,
  type SemanticDocumentExtraction,
  type SemanticGraphEdge,
  type SemanticGraphEdgeStatus,
  type SemanticGraphEdgeType,
  type SemanticGraphEvidence,
  type SemanticGraphMode,
  type SemanticGraphScope,
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

  async previewAnalysis(params: {
    projectId: string;
    scope?: SemanticGraphScope;
    maxDocumentChars?: number;
    persistCandidateIndex?: boolean;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const settings = await readSemanticGraphSettings(project);
    const [documents, sessions, workstreams] = await Promise.all([
      listProjectDocuments(project),
      listProjectSessions(project),
      listProjectWorkstreams(project)
    ]);
    const graph = buildProjectGraph({ project, documents, sessions, workstreams });
    const scope = params.scope || { kind: "all-docs" };
    const scopedDocuments = documentsForSemanticScope(scope, documents, graph);
    const rawPlan = buildSemanticExtractionPlan({
      project,
      documents: scopedDocuments,
      maxDocumentChars: params.maxDocumentChars
    });

    let cachedExtractions = 0;
    let baselineExtractions = 0;
    const selectedPlanItems: SemanticExtractionPlanItem[] = [];
    const extractions: SemanticDocumentExtraction[] = [];

    for (const item of rawPlan.documents) {
      const cached = await readSemanticExtraction(project, item.documentId, item.contentHash);
      if (cached) cachedExtractions += 1;
      if (scope.kind === "changed-docs" && cached) continue;

      selectedPlanItems.push(item);
      if (cached) {
        extractions.push(cached);
      } else {
        baselineExtractions += 1;
        extractions.push(baselineSemanticExtractionFromPlanItem({ project, item }));
      }
    }

    const candidateIndex = buildSemanticCandidateIndex({
      project,
      graph,
      documents: scopedDocuments,
      extractions,
      settings
    });

    const persistCandidateIndex = params.persistCandidateIndex ?? true;
    if (persistCandidateIndex) {
      await writeSemanticCandidateIndex<SemanticCandidateIndex>(project, candidateIndex);
    }

    return {
      projectId: project.id,
      generated: nowIso(),
      scope,
      settings,
      candidateIndexPath: persistCandidateIndex ? semanticCandidateIndexPath(project) : undefined,
      extractionPlan: {
        projectId: rawPlan.projectId,
        generated: rawPlan.generated,
        documents: selectedPlanItems.map(publicPlanItem),
        excluded: rawPlan.excluded,
        counts: {
          ...rawPlan.counts,
          eligible: selectedPlanItems.length
        }
      },
      extractionCache: {
        cached: cachedExtractions,
        baseline: baselineExtractions,
        missing: baselineExtractions
      },
      candidateIndex,
      counts: {
        documentsTotal: scopedDocuments.length,
        documentsEligible: selectedPlanItems.length,
        documentsExcluded: rawPlan.excluded.length,
        cachedExtractions,
        baselineExtractions,
        candidates: candidateIndex.counts.candidates
      }
    };
  }

  async checkProvider(params: {
    projectId: string;
    endpoint?: string;
    model?: string;
    apiKey?: string;
    timeoutMs?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const settings = await readSemanticGraphSettings(project);
    const config = semanticProviderConfig(project, settings, {
      ...params,
      timeoutMs: params.timeoutMs || 30000,
      maxOutputTokens: params.maxOutputTokens || 128
    });
    return checkOpenAiCompatibleProvider(config);
  }

  async analyze(params: {
    projectId: string;
    scope?: SemanticGraphScope;
    mode?: SemanticGraphMode;
    dryRun?: boolean;
    endpoint?: string;
    model?: string;
    apiKey?: string;
    providerId?: string;
    providerKind?: string;
    sourceAgent?: string;
    timeoutMs?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
    maxDocumentChars?: number;
    maxDocuments?: number;
    maxCandidates?: number;
    maxCandidatesPerDocument?: number;
    autoAcceptThreshold?: number;
    reviewThreshold?: number;
    discardBelowThreshold?: number;
    persistCandidateIndex?: boolean;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const storedSettings = await readSemanticGraphSettings(project);
    const scope = params.scope || { kind: "all-docs" };
    const mode = params.dryRun ? "dry-run" : params.mode || storedSettings.mode;
    const settings = normalizeSettingsPatch({
      ...storedSettings,
      mode,
      maxCandidatesPerDocument: params.maxCandidatesPerDocument || storedSettings.maxCandidatesPerDocument,
      autoAcceptThreshold: params.autoAcceptThreshold ?? storedSettings.autoAcceptThreshold,
      reviewThreshold: params.reviewThreshold ?? storedSettings.reviewThreshold,
      discardBelowThreshold: params.discardBelowThreshold ?? storedSettings.discardBelowThreshold
    });
    const provider = semanticProviderConfig(project, settings, params);

    const [documents, sessions, workstreams] = await Promise.all([
      listProjectDocuments(project),
      listProjectSessions(project),
      listProjectWorkstreams(project)
    ]);
    const graph = buildProjectGraph({ project, documents, sessions, workstreams });
    const scopedDocuments = documentsForSemanticScope(scope, documents, graph);
    const rawPlan = buildSemanticExtractionPlan({
      project,
      documents: scopedDocuments,
      maxDocumentChars: params.maxDocumentChars
    });
    const maxDocuments = optionalPositiveInteger(params.maxDocuments);

    const selectedPlanItems: SemanticExtractionPlanItem[] = [];
    const extractions: SemanticDocumentExtraction[] = [];
    const extractionItems: SemanticExtractionPlanItem[] = [];
    let extractionsReused = 0;

    for (const item of rawPlan.documents) {
      const cached = await readSemanticExtraction(project, item.documentId, item.contentHash);
      if (cached && scope.kind === "changed-docs") {
        extractionsReused += 1;
        continue;
      }
      if (maxDocuments !== undefined && selectedPlanItems.length >= maxDocuments) break;

      selectedPlanItems.push(item);
      if (cached) {
        extractionsReused += 1;
        extractions.push(cached);
      } else {
        extractionItems.push(item);
      }
    }

    let run = createSemanticGraphRun({
      project,
      scope,
      mode,
      settings,
      providerId: params.providerId || settings.providerId,
      providerKind: params.providerKind || settings.providerKind || "openai-compatible",
      model: provider.model,
      counts: {
        documentsTotal: scopedDocuments.length,
        extractionsReused
      }
    });
    run = await writeSemanticRun(project, { ...run, status: "running" });

    try {
      for (const item of extractionItems) {
        const result = await callOpenAiCompatibleJson(
          provider,
          semanticExtractionMessagesForItem(item),
          { schemaName: "semantic document extraction", retryOnInvalidJson: true }
        );
        const extraction = semanticExtractionFromProviderJson(result.value, {
          project,
          item,
          providerId: run.providerId,
          providerKind: run.providerKind,
          model: result.model || provider.model
        });
        await writeSemanticExtraction(project, extraction);
        extractions.push(extraction);
        run = await writeSemanticRun(project, {
          ...run,
          counts: {
            ...run.counts,
            documentsAnalyzed: run.counts.documentsAnalyzed + 1
          }
        });
      }

      const candidateIndex = buildSemanticCandidateIndex({
        project,
        graph,
        documents: scopedDocuments,
        extractions,
        settings
      });
      if (params.persistCandidateIndex ?? true) {
        await writeSemanticCandidateIndex<SemanticCandidateIndex>(project, candidateIndex);
      }

      const maxCandidates = optionalPositiveInteger(params.maxCandidates);
      const candidates = maxCandidates === undefined
        ? candidateIndex.candidates
        : candidateIndex.candidates.slice(0, maxCandidates);
      const extractionByDocument = new Map(extractions.map((extraction) => [extraction.documentId, extraction]));
      const decisions: SemanticRelationshipDecision[] = [];

      for (const candidate of candidates) {
        const source = extractionByDocument.get(candidate.sourceDocumentId);
        if (!source) continue;
        const targetSummary = targetExtractionSummary(candidate, extractionByDocument);
        const result = await callOpenAiCompatibleJson(
          provider,
          semanticJudgementMessages({ source, candidate, targetSummary }),
          { schemaName: "semantic relationship decision", retryOnInvalidJson: true }
        );
        decisions.push(semanticDecisionFromProviderJson(result.value, candidate.id));
        if (decisions.length % 5 === 0) {
          run = await writeSemanticRun(project, {
            ...run,
            counts: {
              ...run.counts,
              candidates: candidateIndex.counts.candidates,
              judged: decisions.length
            }
          });
        }
      }

      const policy = applySemanticEdgePolicy({
        project,
        settings,
        run,
        candidates,
        decisions,
        sourceAgent: params.sourceAgent || "aimem-semantic-graph",
        promptVersion: "semantic-graph-v1"
      });

      const acceptedEdges = policy.acceptedEdges.length > 0
        ? await mergeAcceptedSemanticEdges(project, policy.acceptedEdges)
        : [];
      const proposal = policy.proposedEdges.length > 0
        ? await proposeMemoryUpdate({
            project,
            type: "graph-update",
            sourceKind: "memory-assistant",
            sourceAgent: params.sourceAgent || "aimem-semantic-graph",
            confidence: confidenceForEdges(policy.proposedEdges),
            affectedFiles: affectedFilesForEdges(policy.proposedEdges, documents),
            proposedPatch: semanticEdgesProposalPatch(run.id, policy.proposedEdges),
            reason: `Semantic graph relationship proposal from ${run.id} (${policy.proposedEdges.length} edge${policy.proposedEdges.length === 1 ? "" : "s"})`
          })
        : undefined;

      run = await writeSemanticRun(project, {
        ...run,
        status: "completed",
        finished: nowIso(),
        outputPath: params.persistCandidateIndex ?? true ? semanticCandidateIndexPath(project) : undefined,
        counts: {
          documentsTotal: scopedDocuments.length,
          documentsAnalyzed: extractionItems.length,
          extractionsReused,
          candidates: candidateIndex.counts.candidates,
          judged: decisions.length,
          accepted: acceptedEdges.length,
          proposed: policy.proposedEdges.length + policy.dryRunEdges.length,
          rejected: policy.counts.rejected,
          discarded: policy.counts.discarded
        }
      });

      return {
        projectId: project.id,
        run,
        scope,
        mode,
        candidateIndexPath: run.outputPath,
        extractionPlan: {
          projectId: rawPlan.projectId,
          generated: rawPlan.generated,
          documents: selectedPlanItems.map(publicPlanItem),
          excluded: rawPlan.excluded,
          counts: {
            ...rawPlan.counts,
            eligible: selectedPlanItems.length
          }
        },
        acceptedEdges,
        proposedEdges: policy.proposedEdges,
        dryRunEdges: policy.dryRunEdges,
        discardedDecisions: policy.discardedDecisions,
        proposal
      };
    } catch (error) {
      await writeSemanticRun(project, {
        ...run,
        status: "failed",
        finished: nowIso(),
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
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

  async acceptProposal(params: {
    projectId: string;
    proposalId: string;
    status?: Extract<SemanticGraphEdgeStatus, "accepted" | "auto-accepted">;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const proposals = await listProposedUpdates(project);
    const proposal = proposals.find((candidate) => candidate.id === params.proposalId);
    if (!proposal) throw new Error(`Inbox proposal not found: ${params.proposalId}`);

    const patch = semanticEdgesFromProposalPatch(proposal.proposedPatch);
    if (!patch) throw new Error(`Inbox proposal is not a semantic graph edge proposal: ${params.proposalId}`);

    const edgeFile = await readSemanticEdges(project);
    const now = nowIso();
    const status = params.status || "accepted";
    const acceptedEdges = patch.edges.map((edge): SemanticGraphEdge => ({
      id: createId("sem-edge"),
      projectId: project.id,
      from: edge.from,
      to: edge.to,
      type: edge.type,
      status,
      confidence: clampConfidence(edge.confidence),
      reason: edge.reason,
      evidence: edge.evidence,
      source: {
        kind: semanticSourceKindForProposal(proposal),
        runId: patch.runId,
        sourceAgent: proposal.sourceAgent
      },
      created: now,
      updated: now
    }));

    const byKey = new Map(edgeFile.edges.map((edge) => [semanticEdgeKey(edge), edge]));
    let created = 0;
    let updated = 0;
    for (const edge of acceptedEdges) {
      const key = semanticEdgeKey(edge);
      const existing = byKey.get(key);
      if (existing) {
        byKey.set(key, {
          ...existing,
          status,
          confidence: Math.max(existing.confidence, edge.confidence),
          evidence: mergeEvidence(existing.evidence, edge.evidence),
          reason: existing.reason || edge.reason,
          updated: now
        });
        updated += 1;
      } else {
        byKey.set(key, edge);
        created += 1;
      }
    }

    const next = await writeSemanticEdges(project, [...byKey.values()]);
    const updatedProposal = await updateProposalStatus({
      project,
      proposalId: params.proposalId,
      status: "accepted"
    });

    return {
      created,
      updated,
      accepted: acceptedEdges.length,
      edges: next.edges.filter((edge) => acceptedEdges.some((accepted) => semanticEdgeKey(accepted) === semanticEdgeKey(edge))),
      proposal: updatedProposal
    };
  }
}

function semanticProviderConfig(
  project: Project,
  settings: SemanticGraphSettings,
  params: {
    endpoint?: string;
    model?: string;
    apiKey?: string;
    timeoutMs?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
  }
): OpenAiCompatibleProviderConfig {
  const endpoint = params.endpoint || project.assistantPolicy.endpoint;
  const model = params.model || settings.model || project.assistantPolicy.modelName;
  if (!endpoint) {
    throw new Error("No OpenAI-compatible endpoint configured. Set assistantPolicy.endpoint or pass endpoint.");
  }
  if (!model) {
    throw new Error("No model configured. Set semantic graph model, assistantPolicy.modelName, or pass model.");
  }
  if (!settings.remoteProvidersEnabled && !isLocalProviderEndpoint(endpoint)) {
    throw new Error("Remote semantic graph providers are disabled for this project. Enable remoteProvidersEnabled before sending eligible documents to a remote endpoint.");
  }

  return {
    endpoint,
    model,
    apiKey: params.apiKey,
    timeoutMs: params.timeoutMs || 60000,
    maxOutputTokens: params.maxOutputTokens || 1024,
    temperature: 0,
    jsonMode: params.jsonMode
  };
}

function isLocalProviderEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".localhost");
  } catch {
    return false;
  }
}

function optionalPositiveInteger(input: number | undefined): number | undefined {
  if (input === undefined) return undefined;
  if (!Number.isFinite(input)) return undefined;
  return Math.max(1, Math.floor(input));
}

function targetExtractionSummary(
  candidate: SemanticRelationshipCandidate,
  extractions: Map<string, SemanticDocumentExtraction>
): string | undefined {
  if (!candidate.targetNodeId.startsWith("doc:")) return undefined;
  const documentId = candidate.targetNodeId.slice("doc:".length);
  return extractions.get(documentId)?.summary;
}

async function mergeAcceptedSemanticEdges(
  project: Project,
  acceptedEdges: SemanticGraphEdge[]
): Promise<SemanticGraphEdge[]> {
  const edgeFile = await readSemanticEdges(project);
  const byKey = new Map(edgeFile.edges.map((edge) => [semanticEdgeKey(edge), edge]));
  for (const edge of acceptedEdges) {
    const key = semanticEdgeKey(edge);
    const existing = byKey.get(key);
    if (existing) {
      byKey.set(key, {
        ...existing,
        status: edge.status,
        confidence: Math.max(existing.confidence, edge.confidence),
        evidence: mergeEvidence(existing.evidence, edge.evidence),
        reason: existing.reason || edge.reason,
        source: edge.source,
        updated: nowIso()
      });
    } else {
      byKey.set(key, edge);
    }
  }

  const next = await writeSemanticEdges(project, [...byKey.values()]);
  const acceptedKeys = new Set(acceptedEdges.map(semanticEdgeKey));
  return next.edges.filter((edge) => acceptedKeys.has(semanticEdgeKey(edge)));
}

function affectedFilesForEdges(edges: SemanticGraphEdge[], documents: MemoryDocument[]): string[] {
  const docsByNodeId = new Map(documents.map((doc) => [`doc:${doc.id}`, doc]));
  const paths = new Set<string>();
  for (const edge of edges) {
    for (const nodeId of [edge.from, edge.to]) {
      const doc = docsByNodeId.get(nodeId);
      if (doc?.filePath) paths.add(doc.filePath);
    }
    for (const evidence of edge.evidence) {
      if (evidence.sourcePath) paths.add(evidence.sourcePath);
      if (evidence.documentId) {
        const doc = docsByNodeId.get(`doc:${evidence.documentId}`);
        if (doc?.filePath) paths.add(doc.filePath);
      }
    }
  }
  return [...paths];
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

function documentsForSemanticScope(
  scope: SemanticGraphScope,
  documents: MemoryDocument[],
  graph: ProjectGraph
): MemoryDocument[] {
  if (scope.kind === "selected-docs") {
    const documentIds = new Set(scope.documentIds || []);
    return documents.filter((doc) => documentIds.has(doc.id));
  }
  if (scope.kind === "workstream" && scope.workstreamId) {
    return documents.filter((doc) => doc.workstreamIds.includes(scope.workstreamId as string));
  }
  if (scope.kind === "repo" && scope.repoPath) {
    const repoPath = normalizePathForCompare(scope.repoPath);
    const repoName = repoPath.split("/").filter(Boolean).pop() || "";
    return documents.filter((doc) => {
      const paths = [doc.filePath, doc.importSourcePath].filter(Boolean).map((value) => normalizePathForCompare(String(value)));
      return paths.some((candidate) => candidate.startsWith(repoPath) || (repoName && candidate.includes(`/${repoName}/`)));
    });
  }
  if (scope.kind === "focused-graph-node" && scope.nodeId) {
    const docNodeIds = new Set<string>();
    if (scope.nodeId.startsWith("doc:")) docNodeIds.add(scope.nodeId);
    for (const edge of graph.edges) {
      if (edge.from === scope.nodeId && edge.to.startsWith("doc:")) docNodeIds.add(edge.to);
      if (edge.to === scope.nodeId && edge.from.startsWith("doc:")) docNodeIds.add(edge.from);
    }
    return documents.filter((doc) => docNodeIds.has(`doc:${doc.id}`));
  }
  return documents;
}

function publicPlanItem(item: SemanticExtractionPlanItem) {
  const { content: _content, ...safeItem } = item;
  return safeItem;
}

function normalizePathForCompare(input: string): string {
  return input.replace(/\\/g, "/").replace(/\/+$/g, "").toLowerCase();
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

function semanticSourceKindForProposal(proposal: ProposedMemoryUpdate): SemanticGraphEdge["source"]["kind"] {
  if (proposal.sourceKind === "manual") return "manual";
  if (proposal.sourceKind === "memory-assistant") return "llm";
  return "external-ai";
}

function semanticEdgeKey(edge: Pick<SemanticGraphEdge, "from" | "to" | "type">): string {
  return `${edge.from}\u0000${edge.to}\u0000${edge.type}`;
}

function mergeEvidence(left: SemanticGraphEvidence[], right: SemanticGraphEvidence[]): SemanticGraphEvidence[] {
  const byKey = new Map<string, SemanticGraphEvidence>();
  for (const item of [...left, ...right]) {
    byKey.set(`${item.documentId || ""}\u0000${item.quote}\u0000${item.location || ""}\u0000${item.sourcePath || ""}`, item);
  }
  return [...byKey.values()];
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
