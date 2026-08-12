import type {
  AssistantState,
  ContextExcludedItem,
  DocumentStatus,
  DocumentType,
  GraphNodeType,
  ProposedMemoryUpdate,
  SemanticGraphEdge,
  SemanticGraphEdgeType,
  SemanticGraphEvidence,
  SemanticGraphRun,
  SemanticGraphScope,
  SemanticGraphSettings,
  Visibility
} from "../types.js";
import {
  arraySchema,
  booleanSchema,
  enumSchema,
  integerSchema,
  numberSchema,
  objectSchema,
  optionalSchema,
  stringSchema,
  unionSchema,
  type RuntimeSchema
} from "./runtime-schema.js";
import {
  contextExcludedItemSchema,
  documentStatusSchema,
  documentTypeSchema,
  graphEdgeTypeSchema,
  graphNodeTypeSchema,
  proposedMemoryUpdateSchema,
  semanticGraphEdgeSchema,
  semanticGraphEvidenceSchema,
  semanticGraphRunSchema,
  semanticGraphScopeSchema,
  semanticGraphSettingsSchema,
  visibilitySchema
} from "./entities.js";

const optionalString = optionalSchema(stringSchema);
const strings = arraySchema(stringSchema);

export interface AssistantRecommendedModel {
  id: string;
  label: string;
  approximateDownload: string;
  approximateRam: string;
  notes: string;
}

export interface AssistantStatusResult {
  available?: boolean;
  state: AssistantState;
  runtimeType: string;
  modelName?: string;
  modelPath?: string;
  message: string;
  jobsAvailable: string[];
  recommendedModels: AssistantRecommendedModel[];
}

const assistantRecommendedModelSchema: RuntimeSchema<AssistantRecommendedModel> = objectSchema(
  {
    id: stringSchema,
    label: stringSchema,
    approximateDownload: stringSchema,
    approximateRam: stringSchema,
    notes: stringSchema
  },
  { unknownKeys: "passthrough" }
);

export const assistantStatusResultSchema: RuntimeSchema<AssistantStatusResult> = objectSchema(
  {
    available: optionalSchema(booleanSchema),
    state: enumSchema(["off", "ready", "running", "unavailable", "external"]),
    runtimeType: stringSchema,
    modelName: optionalString,
    modelPath: optionalString,
    message: stringSchema,
    jobsAvailable: strings,
    recommendedModels: arraySchema(assistantRecommendedModelSchema)
  },
  { unknownKeys: "passthrough" }
);

export interface SemanticProviderCheckResult {
  ok: boolean;
  endpoint: string;
  model: string;
  modelDisplayName?: string;
  availableModels?: string[];
  latencyMs: number;
  message: string;
}

export const semanticProviderCheckResultSchema: RuntimeSchema<SemanticProviderCheckResult> = objectSchema(
  {
    ok: booleanSchema,
    endpoint: stringSchema,
    model: stringSchema,
    modelDisplayName: optionalString,
    availableModels: optionalSchema(strings),
    latencyMs: numberSchema,
    message: stringSchema
  },
  { unknownKeys: "reject" }
);

export interface SemanticExtractionPlanChunkResult {
  chunkId: string;
  index: number;
  headingPath: string[];
  location: string;
  startLine: number;
  endLine: number;
  originalCharCount: number;
  promptCharCount: number;
}

export interface SemanticExtractionPlanDocumentResult {
  documentId: string;
  nodeId: string;
  title: string;
  type: DocumentType;
  status: DocumentStatus;
  visibility: Visibility;
  topics: string[];
  relatedFiles: string[];
  filePath: string;
  updated: string;
  contentHash: string;
  originalCharCount: number;
  promptCharCount: number;
  truncated: boolean;
  redactionCount: number;
  chunks: SemanticExtractionPlanChunkResult[];
}

export interface SemanticExtractionPlanResult {
  projectId: string;
  generated: string;
  documents: SemanticExtractionPlanDocumentResult[];
  excluded: ContextExcludedItem[];
  counts: {
    total: number;
    eligible: number;
    excluded: number;
    redacted: number;
  };
}

const semanticExtractionPlanChunkResultSchema: RuntimeSchema<SemanticExtractionPlanChunkResult> = objectSchema(
  {
    chunkId: stringSchema,
    index: integerSchema,
    headingPath: strings,
    location: stringSchema,
    startLine: integerSchema,
    endLine: integerSchema,
    originalCharCount: integerSchema,
    promptCharCount: integerSchema
  },
  { unknownKeys: "passthrough" }
);

const semanticExtractionPlanDocumentResultSchema: RuntimeSchema<SemanticExtractionPlanDocumentResult> = objectSchema(
  {
    documentId: stringSchema,
    nodeId: stringSchema,
    title: stringSchema,
    type: documentTypeSchema,
    status: documentStatusSchema,
    visibility: visibilitySchema,
    topics: strings,
    relatedFiles: strings,
    filePath: stringSchema,
    updated: stringSchema,
    contentHash: stringSchema,
    originalCharCount: integerSchema,
    promptCharCount: integerSchema,
    truncated: booleanSchema,
    redactionCount: integerSchema,
    chunks: arraySchema(semanticExtractionPlanChunkResultSchema)
  },
  { unknownKeys: "passthrough" }
);

const semanticExtractionPlanResultSchema: RuntimeSchema<SemanticExtractionPlanResult> = objectSchema(
  {
    projectId: stringSchema,
    generated: stringSchema,
    documents: arraySchema(semanticExtractionPlanDocumentResultSchema),
    excluded: arraySchema(contextExcludedItemSchema),
    counts: objectSchema({
      total: integerSchema,
      eligible: integerSchema,
      excluded: integerSchema,
      redacted: integerSchema
    })
  },
  { unknownKeys: "passthrough" }
);

export interface SemanticRelationshipCandidateResult {
  id: string;
  projectId: string;
  sourceDocumentId: string;
  sourceNodeId: string;
  targetNodeId: string;
  targetLabel: string;
  targetType: GraphNodeType;
  targetPath?: string;
  suggestedType: SemanticGraphEdgeType;
  score: number;
  reasons: string[];
  deterministicEdgeIds: string[];
}

export interface SemanticDocumentCandidateSetResult {
  documentId: string;
  sourceNodeId: string;
  candidates: SemanticRelationshipCandidateResult[];
}

export interface SemanticCandidateIndexResult {
  projectId: string;
  generated: string;
  maxCandidatesPerDocument: number;
  documents: SemanticDocumentCandidateSetResult[];
  candidates: SemanticRelationshipCandidateResult[];
  counts: {
    documents: number;
    candidates: number;
  };
}

const semanticRelationshipCandidateResultSchema: RuntimeSchema<SemanticRelationshipCandidateResult> = objectSchema(
  {
    id: stringSchema,
    projectId: stringSchema,
    sourceDocumentId: stringSchema,
    sourceNodeId: stringSchema,
    targetNodeId: stringSchema,
    targetLabel: stringSchema,
    targetType: graphNodeTypeSchema,
    targetPath: optionalString,
    suggestedType: graphEdgeTypeSchema,
    score: numberSchema,
    reasons: strings,
    deterministicEdgeIds: strings
  },
  { unknownKeys: "passthrough" }
);

const semanticDocumentCandidateSetResultSchema: RuntimeSchema<SemanticDocumentCandidateSetResult> = objectSchema(
  {
    documentId: stringSchema,
    sourceNodeId: stringSchema,
    candidates: arraySchema(semanticRelationshipCandidateResultSchema)
  },
  { unknownKeys: "passthrough" }
);

const semanticCandidateIndexResultSchema: RuntimeSchema<SemanticCandidateIndexResult> = objectSchema(
  {
    projectId: stringSchema,
    generated: stringSchema,
    maxCandidatesPerDocument: integerSchema,
    documents: arraySchema(semanticDocumentCandidateSetResultSchema),
    candidates: arraySchema(semanticRelationshipCandidateResultSchema),
    counts: objectSchema({ documents: integerSchema, candidates: integerSchema })
  },
  { unknownKeys: "passthrough" }
);

export interface SemanticAnalysisPreviewResult {
  projectId: string;
  generated: string;
  scope: SemanticGraphScope;
  settings: SemanticGraphSettings;
  candidateIndexPath?: string;
  extractionPlan: SemanticExtractionPlanResult;
  extractionCache: {
    cached: number;
    baseline: number;
    missing: number;
  };
  candidateIndex: SemanticCandidateIndexResult;
  counts: {
    documentsTotal: number;
    documentsEligible: number;
    documentsExcluded: number;
    cachedExtractions: number;
    baselineExtractions: number;
    candidates: number;
  };
}

export const semanticAnalysisPreviewResultSchema: RuntimeSchema<SemanticAnalysisPreviewResult> = objectSchema(
  {
    projectId: stringSchema,
    generated: stringSchema,
    scope: semanticGraphScopeSchema,
    settings: semanticGraphSettingsSchema,
    candidateIndexPath: optionalString,
    extractionPlan: semanticExtractionPlanResultSchema,
    extractionCache: objectSchema({ cached: integerSchema, baseline: integerSchema, missing: integerSchema }),
    candidateIndex: semanticCandidateIndexResultSchema,
    counts: objectSchema({
      documentsTotal: integerSchema,
      documentsEligible: integerSchema,
      documentsExcluded: integerSchema,
      cachedExtractions: integerSchema,
      baselineExtractions: integerSchema,
      candidates: integerSchema
    })
  },
  { unknownKeys: "passthrough" }
);

export interface SemanticRelationshipDecisionResult {
  candidateId?: string;
  from?: string;
  to?: string;
  type: SemanticGraphEdgeType | "none";
  confidence: number;
  reason: string;
  evidence?: Array<string | SemanticGraphEvidence>;
  deterministicEdgeId?: string;
}

export interface SemanticAnalysisResult {
  projectId: string;
  run: SemanticGraphRun;
  scope: SemanticGraphScope;
  mode: "review" | "auto" | "dry-run";
  candidateIndexPath?: string;
  extractionPlan: SemanticExtractionPlanResult;
  acceptedEdges: SemanticGraphEdge[];
  proposedEdges: SemanticGraphEdge[];
  dryRunEdges: SemanticGraphEdge[];
  discardedDecisions: SemanticRelationshipDecisionResult[];
  proposal?: ProposedMemoryUpdate;
}

const semanticDecisionTypeSchema = unionSchema([graphEdgeTypeSchema, enumSchema(["none"])]);

const semanticRelationshipDecisionResultSchema: RuntimeSchema<SemanticRelationshipDecisionResult> = objectSchema(
  {
    candidateId: optionalString,
    from: optionalString,
    to: optionalString,
    type: semanticDecisionTypeSchema,
    confidence: numberSchema,
    reason: stringSchema,
    evidence: optionalSchema(arraySchema(unionSchema([stringSchema, semanticGraphEvidenceSchema]))),
    deterministicEdgeId: optionalString
  },
  { unknownKeys: "passthrough" }
);

export const semanticAnalysisResultSchema: RuntimeSchema<SemanticAnalysisResult> = objectSchema(
  {
    projectId: stringSchema,
    run: semanticGraphRunSchema,
    scope: semanticGraphScopeSchema,
    mode: enumSchema(["review", "auto", "dry-run"]),
    candidateIndexPath: optionalString,
    extractionPlan: semanticExtractionPlanResultSchema,
    acceptedEdges: arraySchema(semanticGraphEdgeSchema),
    proposedEdges: arraySchema(semanticGraphEdgeSchema),
    dryRunEdges: arraySchema(semanticGraphEdgeSchema),
    discardedDecisions: arraySchema(semanticRelationshipDecisionResultSchema),
    proposal: optionalSchema(proposedMemoryUpdateSchema)
  },
  { unknownKeys: "passthrough" }
);
