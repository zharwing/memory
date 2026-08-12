import {
  type ProjectRegistry,
  createSemanticGraphRun,
  deleteProposedUpdates,
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
} from "@zharwing/memory-store";
import { buildProjectGraph } from "@zharwing/memory-graph";
import {
  callAiProviderJson,
  checkAiProvider,
  providerKindFromAssistantRuntime,
  type AiProviderConfig,
  type ProviderCheckResult
} from "@zharwing/memory-assistant";
import { scanSecrets } from "@zharwing/memory-privacy";
import {
  applySemanticEdgePolicy,
  baselineSemanticExtractionFromPlanItem,
  buildSemanticCandidateIndex,
  buildSemanticExtractionPlan,
  mergeSemanticDocumentExtractions,
  semanticDecisionFromProviderJson,
  semanticEdgesFromProposalPatch,
  semanticEdgesProposalPatch,
  semanticExtractionFromProviderJson,
  semanticExtractionMessagesForChunk,
  semanticExtractionMessagesForItem,
  semanticJudgementMessages,
  normalizeEvidence,
  semanticProposalSummaryFromProviderJson,
  semanticProposalSummaryMessages,
  type SemanticCandidateIndex,
  type SemanticExtractionPlanItem,
  type SemanticRelationshipCandidate,
  type SemanticRelationshipDecision
} from "@zharwing/memory-semantic-graph";
import {
  clamp01,
  createId,
  isLocalProviderEndpoint,
  nowIso,
  PROVIDER_DEFAULTS,
  type ProviderDefault,
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
} from "@zharwing/memory-core";
import { resolveProject } from "./project-resolver.js";
import type { ProviderSecretService } from "./provider-secret-service.js";

export class SemanticGraphService {
  constructor(
    private readonly registry: ProjectRegistry,
    private readonly providerSecrets?: ProviderSecretService
  ) {}

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
    providerKind?: string;
    timeoutMs?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const settings = await readSemanticGraphSettings(project);
    const configured = semanticProviderCheckConfig(project, settings, {
      ...params,
      timeoutMs: params.timeoutMs || 30000,
      maxOutputTokens: params.maxOutputTokens || 128
    });
    const config = {
      ...configured,
      apiKey: this.providerSecrets?.read(project.id, configured.providerKind)
    };
    return sanitizeSemanticProviderCheckResult(await checkAiProvider(config), {
      endpoint: config.endpoint,
      model: config.model
    });
  }

  async analyze(params: {
    projectId: string;
    scope?: SemanticGraphScope;
    mode?: SemanticGraphMode;
    dryRun?: boolean;
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
    const providerKind = semanticProviderKind(project, settings);
    const provider = semanticProviderConfig(
      project,
      settings,
      params,
      this.providerSecrets?.read(project.id, providerKind)
    );

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
      providerId: settings.providerId,
      providerKind,
      model: provider.model,
      counts: {
        documentsTotal: selectedPlanItems.length,
        extractionsReused
      }
    });
    run = await writeSemanticRun(project, { ...run, status: "running" });

    try {
      for (const item of extractionItems) {
        const chunkExtractions: SemanticDocumentExtraction[] = [];
        let model = provider.model;
        for (const chunk of item.chunks) {
          const result = await callAiProviderJson(
            provider,
            item.chunks.length === 1
              ? semanticExtractionMessagesForItem(item)
              : semanticExtractionMessagesForChunk(item, chunk),
            { schemaName: "semantic document extraction", retryOnInvalidJson: true }
          );
          model = result.model || model;
          chunkExtractions.push(semanticExtractionFromProviderJson(result.value, {
            project,
            item,
            chunk: item.chunks.length === 1 ? undefined : chunk,
            providerId: run.providerId,
            providerKind: run.providerKind,
            model
          }));
        }
        const extraction = mergeSemanticDocumentExtractions({
          project,
          item,
          extractions: chunkExtractions,
          providerId: run.providerId,
          providerKind: run.providerKind,
          model
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
      run = await writeSemanticRun(project, {
        ...run,
        counts: {
          ...run.counts,
          candidates: candidates.length
        }
      });
      const extractionByDocument = new Map(extractions.map((extraction) => [extraction.documentId, extraction]));
      const decisions: SemanticRelationshipDecision[] = [];

      for (const candidate of candidates) {
        const source = extractionByDocument.get(candidate.sourceDocumentId);
        if (!source) continue;
        const targetSummary = targetExtractionSummary(candidate, extractionByDocument);
        const result = await callAiProviderJson(
          provider,
          semanticJudgementMessages({ source, candidate, targetSummary }),
          { schemaName: "semantic relationship decision", retryOnInvalidJson: true }
        );
        decisions.push(semanticDecisionFromProviderJson(result.value, candidate.id));
        run = await writeSemanticRun(project, {
          ...run,
          counts: {
            ...run.counts,
            candidates: candidates.length,
            judged: decisions.length
          }
        });
      }

      const policy = applySemanticEdgePolicy({
        project,
        settings,
        run,
        candidates,
        decisions,
        sourceAgent: params.sourceAgent || "zharwing-memory-semantic-graph",
        promptVersion: "semantic-graph-v1"
      });
      const acceptedPolicyEdges = refineSemanticReviewEdges(policy.acceptedEdges);
      const proposedPolicyEdges = refineSemanticReviewEdges(policy.proposedEdges);
      const dryRunPolicyEdges = refineSemanticReviewEdges(policy.dryRunEdges);
      const qualityFilteredEdges =
        policy.acceptedEdges.length + policy.proposedEdges.length + policy.dryRunEdges.length
        - acceptedPolicyEdges.length - proposedPolicyEdges.length - dryRunPolicyEdges.length;

      const acceptedEdges = acceptedPolicyEdges.length > 0
        ? await mergeAcceptedSemanticEdges(project, acceptedPolicyEdges)
        : [];
      const proposalSummary = proposedPolicyEdges.length > 0
        ? semanticProposalSummaryFromProviderJson((await callAiProviderJson(
            provider,
            semanticProposalSummaryMessages({
              graph,
              edges: proposedPolicyEdges
            }),
            { schemaName: "semantic relationship proposal summary", retryOnInvalidJson: true }
          )).value)
        : undefined;
      const proposal = proposedPolicyEdges.length > 0
        ? await proposeCurrentSemanticEdges({
            project,
            sourceKind: "memory-assistant",
            sourceAgent: params.sourceAgent || "zharwing-memory-semantic-graph",
            confidence: confidenceForEdges(proposedPolicyEdges),
            affectedFiles: affectedFilesForEdges(proposedPolicyEdges, documents),
            proposedPatch: semanticEdgesProposalPatch(run.id, proposedPolicyEdges, proposalSummary),
            reason: `Semantic graph relationship proposal from ${run.id} (${proposedPolicyEdges.length} edge${proposedPolicyEdges.length === 1 ? "" : "s"})`
          })
        : undefined;

      run = await writeSemanticRun(project, {
        ...run,
        status: "completed",
        finished: nowIso(),
        outputPath: params.persistCandidateIndex ?? true ? semanticCandidateIndexPath(project) : undefined,
        counts: {
          documentsTotal: selectedPlanItems.length,
          documentsAnalyzed: extractionItems.length,
          extractionsReused,
          candidates: candidates.length,
          judged: decisions.length,
          accepted: acceptedEdges.length,
          proposed: proposedPolicyEdges.length + dryRunPolicyEdges.length,
          rejected: policy.counts.rejected,
          discarded: policy.counts.discarded + qualityFilteredEdges
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
        proposedEdges: proposedPolicyEdges,
        dryRunEdges: dryRunPolicyEdges,
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
      confidence: clamp01(edge.confidence),
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

    const refinedEdges = refineSemanticReviewEdges(edges);
    const invalid = refinedEdges.find((edge) => !edge.from || !edge.to || !edge.reason);
    if (invalid) {
      throw new Error("Each semantic edge proposal requires from, to, and reason.");
    }
    if (refinedEdges.length === 0) {
      throw new Error("No semantic edge proposals remained after quality filtering.");
    }

    return proposeCurrentSemanticEdges({
      project,
      sourceKind: "external-ai",
      sourceAgent: params.sourceAgent,
      confidence: params.confidence || confidenceForEdges(refinedEdges),
      affectedFiles: params.affectedFiles || [],
      proposedPatch: semanticEdgesProposalPatch(runId, refinedEdges),
      reason: params.reason || `Semantic graph relationship proposal (${refinedEdges.length} edge${refinedEdges.length === 1 ? "" : "s"})`
    });
  }

  async acceptProposal(params: {
    projectId: string;
    proposalId: string;
    status?: Extract<SemanticGraphEdgeStatus, "accepted" | "auto-accepted">;
    minConfidence?: number;
    maxConfidence?: number;
    edgeIndexes?: number[];
  }) {
    const project = await resolveProject(this.registry, params.projectId);
    const proposals = await listProposedUpdates(project);
    const proposal = proposals.find((candidate) => candidate.id === params.proposalId);
    if (!proposal) throw new Error(`Inbox proposal not found: ${params.proposalId}`);

    const patch = semanticEdgesFromProposalPatch(proposal.proposedPatch);
    if (!patch) throw new Error(`Inbox proposal is not a semantic graph edge proposal: ${params.proposalId}`);

    const requestedIndexes = Array.isArray(params.edgeIndexes)
      ? new Set(params.edgeIndexes.map((index) => Math.floor(Number(index))).filter((index) => Number.isFinite(index) && index >= 0))
      : undefined;
    const selectedPatchEdges = patch.edges.filter((edge, index) => {
      if (requestedIndexes && !requestedIndexes.has(index)) return false;
      if (params.minConfidence !== undefined && edge.confidence < clamp01(params.minConfidence)) return false;
      if (params.maxConfidence !== undefined && edge.confidence > clamp01(params.maxConfidence)) return false;
      return true;
    });
    if (selectedPatchEdges.length === 0) {
      throw new Error("No semantic proposal edges matched the requested accept filter.");
    }

    const acceptedIndexes = new Set<number>();
    patch.edges.forEach((edge, index) => {
      if (selectedPatchEdges.includes(edge)) acceptedIndexes.add(index);
    });
    const remainingPatchEdges = patch.edges.filter((_, index) => !acceptedIndexes.has(index));
    const edgeFile = await readSemanticEdges(project);
    const now = nowIso();
    const status = params.status || "accepted";
    const acceptedEdges = selectedPatchEdges.map((edge): SemanticGraphEdge => ({
      id: createId("sem-edge"),
      projectId: project.id,
      from: edge.from,
      to: edge.to,
      type: edge.type,
      status,
      confidence: clamp01(edge.confidence),
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
    const proposalStatus = remainingPatchEdges.length === 0 ? "accepted" : "edited";
    const updatedProposal = await updateProposalStatus({
      project,
      proposalId: params.proposalId,
      status: proposalStatus,
      editedPatch: remainingPatchEdges.length > 0
        ? semanticGraphProposalPatch(patch.runId, remainingPatchEdges)
        : undefined
    });

    return {
      created,
      updated,
      accepted: acceptedEdges.length,
      remaining: remainingPatchEdges.length,
      edges: next.edges.filter((edge) => acceptedEdges.some((accepted) => semanticEdgeKey(accepted) === semanticEdgeKey(edge))),
      proposal: updatedProposal
    };
  }
}

const MAX_PUBLIC_PROVIDER_IDENTIFIER = 160;
const MAX_PUBLIC_PROVIDER_ENDPOINT = 2_048;

/**
 * Converts provider-controlled discovery/check output into the closed public
 * contract before any browser, desktop, admin, or provider principal can
 * observe it. Provider prose is never forwarded as product copy.
 */
export function sanitizeSemanticProviderCheckResult(
  result: ProviderCheckResult,
  serverOwned: { endpoint: string; model: string }
): ProviderCheckResult {
  return {
    ok: result.ok === true,
    endpoint: sanitizeProviderEndpoint(serverOwned.endpoint),
    model: safeProviderIdentifier(serverOwned.model) ?? "provider-model-withheld",
    latencyMs: Number.isFinite(result.latencyMs)
      ? Math.min(Math.max(0, result.latencyMs), 24 * 60 * 60 * 1_000)
      : 0,
    message: result.ok === true
      ? "Provider connection check succeeded."
      : "Provider connection check was refused."
  };
}

function safeProviderIdentifier(value: string | undefined): string | undefined {
  const candidate = value?.trim();
  if (
    !candidate ||
    candidate.length > MAX_PUBLIC_PROVIDER_IDENTIFIER ||
    /[\u0000-\u001f\u007f]/.test(candidate) ||
    scanSecrets(candidate).length > 0
  ) return undefined;
  return candidate;
}

function sanitizeProviderEndpoint(value: string): string {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "provider-endpoint-withheld";
    }
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    const endpoint = parsed.toString();
    return endpoint.length <= MAX_PUBLIC_PROVIDER_ENDPOINT
      ? endpoint
      : "provider-endpoint-withheld";
  } catch {
    return "provider-endpoint-withheld";
  }
}

async function proposeCurrentSemanticEdges(args: {
  project: Project;
  sourceKind: ProposedMemoryUpdate["sourceKind"];
  sourceAgent?: string;
  confidence?: ProposedMemoryUpdate["confidence"];
  affectedFiles?: string[];
  proposedPatch: string;
  reason: string;
}): Promise<ProposedMemoryUpdate> {
  const existing = await listProposedUpdates(args.project);
  const obsoleteIds = existing
    .filter((proposal) =>
      proposal.type === "graph-update" &&
      Boolean(semanticEdgesFromProposalPatch(proposal.proposedPatch))
    )
    .map((proposal) => proposal.id);
  await deleteProposedUpdates(args.project, obsoleteIds);
  return proposeMemoryUpdate({
    project: args.project,
    type: "graph-update",
    sourceKind: args.sourceKind,
    sourceAgent: args.sourceAgent,
    confidence: args.confidence,
    affectedFiles: args.affectedFiles,
    proposedPatch: args.proposedPatch,
    reason: args.reason
  });
}

function semanticProviderConfig(
  project: Project,
  settings: SemanticGraphSettings,
  params: {
    timeoutMs?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
  },
  apiKey?: string
): AiProviderConfig & { endpoint: string; model: string; providerKind: string } {
  const providerKind = semanticProviderKind(project, settings);
  const endpoint = project.assistantPolicy.endpoint || defaultEndpointForProviderKind(providerKind);
  const model = settings.model || project.assistantPolicy.modelName;
  if (!endpoint) {
    throw new Error("No AI provider endpoint configured in project settings.");
  }
  if (!model) {
    throw new Error("No model configured in project settings.");
  }
  if (!settings.remoteProvidersEnabled && !isLocalProviderEndpoint(endpoint)) {
    throw new Error("Remote semantic graph providers are disabled for this project. Enable remoteProvidersEnabled before sending eligible documents to a remote endpoint.");
  }

  return {
    providerKind,
    endpoint,
    model,
    apiKey,
    timeoutMs: params.timeoutMs || 60000,
    maxOutputTokens: params.maxOutputTokens || 1024,
    temperature: 0,
    jsonMode: params.jsonMode
  };
}

export function semanticProviderCheckConfig(
  project: Project,
  settings: SemanticGraphSettings,
  params: {
    endpoint?: string;
    model?: string;
    providerKind?: string;
    timeoutMs?: number;
    maxOutputTokens?: number;
    jsonMode?: boolean;
  }
): AiProviderConfig & { endpoint: string; model: string; providerKind: string } {
  const configuredProviderKind = semanticProviderKind(project, settings);
  if (params.providerKind && normalizeProviderKind(params.providerKind) !== normalizeProviderKind(configuredProviderKind)) {
    throw new Error("Provider check cannot override the project provider kind.");
  }
  const providerKind = configuredProviderKind;
  const configuredEndpoint = project.assistantPolicy.endpoint || defaultEndpointForProviderKind(providerKind);
  if (!configuredEndpoint) {
    throw new Error("No AI provider endpoint configured for this project.");
  }
  const endpoint = exactProviderEndpoint(configuredEndpoint);
  if (params.endpoint && exactProviderEndpoint(params.endpoint) !== endpoint) {
    throw new Error("Provider check cannot override the configured endpoint.");
  }
  const model = settings.model || project.assistantPolicy.modelName;
  if (!model) {
    throw new Error("No AI provider model configured for this project.");
  }
  if (params.model && params.model !== model) {
    throw new Error("Provider check cannot override the configured model.");
  }
  if (!settings.remoteProvidersEnabled && !isLocalProviderEndpoint(endpoint)) {
    throw new Error("Remote semantic graph providers are disabled for this project.");
  }

  return {
    providerKind,
    endpoint,
    model,
    timeoutMs: Math.min(Math.max(1, params.timeoutMs || 30000), 60_000),
    maxOutputTokens: Math.min(Math.max(1, params.maxOutputTokens || 128), 512),
    temperature: 0,
    jsonMode: params.jsonMode
  };
}

function exactProviderEndpoint(value: string): string {
  const parsed = new URL(value);
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Provider endpoint must be a credential-free HTTP(S) base URL.");
  }
  return parsed.toString();
}

function normalizeProviderKind(value: string): string {
  return PROVIDER_KIND_ALIASES[value] || value;
}

function semanticProviderKind(
  project: Project,
  settings: SemanticGraphSettings,
  providerKind?: string
): string {
  return providerKind || settings.providerKind || providerKindFromAssistantRuntime(project.assistantPolicy.runtimeType) || "openai-compatible";
}

// Endpoints come from the shared provider table; only the historical alias
// spellings ("llama.cpp", "claude") remain daemon-side.
const PROVIDER_KIND_ALIASES: Record<string, string> = {
  "llama.cpp": "llama-cpp",
  claude: "anthropic"
};

function defaultEndpointForProviderKind(providerKind?: string): string | undefined {
  if (!providerKind) return undefined;
  const defaults: Record<string, ProviderDefault | undefined> = PROVIDER_DEFAULTS;
  return defaults[PROVIDER_KIND_ALIASES[providerKind] || providerKind]?.endpoint;
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

function refineSemanticReviewEdges(edges: SemanticGraphEdge[]): SemanticGraphEdge[] {
  const byKey = new Map<string, SemanticGraphEdge>();
  for (const edge of edges) {
    const key = semanticEdgeKey(edge);
    const existing = byKey.get(key);
    if (!existing || edge.confidence > existing.confidence || edge.evidence.length > existing.evidence.length) {
      byKey.set(key, edge);
    }
  }

  const deduped = [...byKey.values()];
  if (!deduped.some((edge) => !isMetadataOnlySemanticEdge(edge))) return deduped;

  const metadataCounts = new Map<string, number>();
  const refined: SemanticGraphEdge[] = [];
  for (const edge of deduped) {
    if (!isMetadataOnlySemanticEdge(edge)) {
      refined.push(edge);
      continue;
    }

    const owner = metadataOwnerKey(edge);
    const count = metadataCounts.get(owner) || 0;
    if (count >= 1) continue;
    metadataCounts.set(owner, count + 1);
    refined.push(edge);
  }

  return refined;
}

function isMetadataOnlySemanticEdge(edge: Pick<SemanticGraphEdge, "from" | "to">): boolean {
  return isMetadataOnlyNode(edge.from) || isMetadataOnlyNode(edge.to);
}

function isMetadataOnlyNode(nodeId: string): boolean {
  return nodeId.startsWith("file:") || nodeId.startsWith("topic:");
}

function metadataOwnerKey(edge: Pick<SemanticGraphEdge, "from" | "to">): string {
  if (edge.from.startsWith("doc:")) return edge.from;
  if (edge.to.startsWith("doc:")) return edge.to;
  return `${edge.from}\u0000${edge.to}`;
}

function normalizeSettingsPatch(settings: SemanticGraphSettings): SemanticGraphSettings {
  return {
    ...settings,
    autoAcceptThreshold: clamp01(settings.autoAcceptThreshold),
    reviewThreshold: clamp01(settings.reviewThreshold),
    discardBelowThreshold: clamp01(settings.discardBelowThreshold),
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
  return {
    ...safeItem,
    chunks: item.chunks.map(({ content: _chunkContent, ...chunk }) => chunk)
  };
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

function semanticSourceKindForProposal(proposal: ProposedMemoryUpdate): SemanticGraphEdge["source"]["kind"] {
  if (proposal.sourceKind === "manual") return "manual";
  if (proposal.sourceKind === "memory-assistant") return "llm";
  return "external-ai";
}

function semanticEdgeKey(edge: Pick<SemanticGraphEdge, "from" | "to" | "type">): string {
  if (edge.type === "related" && edge.from.startsWith("doc:") && edge.to.startsWith("doc:")) {
    return `related\u0000${[edge.from, edge.to].sort().join("\u0000")}`;
  }
  return `${edge.from}\u0000${edge.to}\u0000${edge.type}`;
}

function semanticGraphProposalPatch(
  runId: string,
  edges: Array<{
    from: string;
    to: string;
    type: SemanticGraphEdgeType;
    confidence: number;
    reason: string;
    evidence: SemanticGraphEvidence[];
  }>
): string {
  return `${JSON.stringify({
    kind: "semantic-graph-edges",
    runId,
    edges: edges.map((edge) => ({
      from: edge.from,
      to: edge.to,
      type: edge.type,
      confidence: edge.confidence,
      reason: edge.reason,
      evidence: edge.evidence
    }))
  }, null, 2)}\n`;
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

function clampInteger(input: number, min: number, max: number): number {
  const value = Number.isFinite(input) ? Math.round(input) : min;
  return Math.max(min, Math.min(max, value));
}
