import type {
  AssistantPolicy,
  GraphExtractionRule,
  ImportPlan,
  MemoryWritePolicy,
  PrincipalAudience,
  Project,
  ProjectCreationPreview,
  SemanticGraphSettings
} from "../types.js";
import {
  ContractDecodeError,
  arraySchema,
  booleanSchema,
  emptyObjectSchema,
  enumSchema,
  integerSchema,
  jsonObjectSchema,
  jsonValueSchema,
  literalSchema,
  nullableSchema,
  numberSchema,
  numberRangeSchema,
  objectSchema,
  optionalSchema,
  stringSchema,
  unionSchema,
  undefinedSchema,
  type InferSchema,
  type JsonObject,
  type RuntimeSchema
} from "./runtime-schema.js";
import {
  assistantPolicySchema,
  backupSnapshotItemSchema,
  contextBundleSchema,
  graphExtractionRuleSchema,
  importCommitResultSchema,
  jsonObjectArraySchema,
  importPlanSchema,
  importProfileSchema,
  memoryDocumentSchema,
  memoryWritePolicySchema,
  projectCreationPreviewSchema,
  projectGraphSchema,
  projectSchema,
  projectSummarySnapshotSchema,
  proposedMemoryUpdateSchema,
  repoLinkSchema,
  searchResultSchema,
  semanticGraphEdgeSchema,
  semanticGraphRunSchema,
  semanticGraphScopeSchema,
  semanticGraphSettingsSchema,
  semanticGraphStatusSchema,
  sessionDetailSchema,
  sessionSchema,
  sessionSummarySchema,
  startupStateSchema,
  trashItemSchema,
  workstreamDetailSchema,
  workstreamSchema
} from "./entities.js";
import { PUBLIC_ERROR_REGISTRY, type PublicErrorCode } from "./public-errors.js";
import {
  assistantStatusResultSchema,
  semanticAnalysisPreviewResultSchema,
  semanticAnalysisResultSchema,
  semanticProviderCheckResultSchema
} from "./operation-results.js";
import { documentIdSchema, projectIdSchema } from "./identifiers.js";
import type { ResourceId } from "./resources.js";
export type { ResourceId } from "./resources.js";

export const RPC_COMPATIBILITY_VERSION = 1 as const;

export type EffectClass = "read" | "proposal" | "mutation" | "destructive";
export type OperationAudience = PrincipalAudience;
/** @deprecated Prefer OperationAudience or PrincipalAudience. */
export type Audience = OperationAudience;
export type OperationProjectScope = "none" | "required";

export interface OperationDefinition<Input, Output> {
  readonly input: RuntimeSchema<Input>;
  readonly output: RuntimeSchema<Output>;
  readonly effect: EffectClass;
  readonly audiences: readonly Audience[];
  readonly projectScope: OperationProjectScope;
  readonly projectScopeByAudience: Readonly<Partial<Record<OperationAudience, OperationProjectScope>>>;
  readonly privacyProjection: "none" | "human" | "agent" | "provider";
  readonly cancellation: "supported" | "best-effort" | "not-supported";
  readonly idempotency: "not-applicable" | "required";
  readonly timeoutMs: number;
  readonly maximumResponseBytes: number;
  readonly invalidates: readonly ResourceId[];
  readonly compatibilityVersion: typeof RPC_COMPATIBILITY_VERSION;
  readonly publicErrors: readonly PublicErrorCode[];
}

type OperationOptions<Input, Output> = Pick<OperationDefinition<Input, Output>, "input" | "output"> &
  Partial<Omit<OperationDefinition<Input, Output>, "input" | "output" | "compatibilityVersion">>;

const standardPublicErrors = Object.keys(PUBLIC_ERROR_REGISTRY) as PublicErrorCode[];

function defineOperation<Input, Output>(options: OperationOptions<Input, Output>): OperationDefinition<Input, Output> {
  const effect = options.effect ?? "read";
  return {
    input: options.input,
    output: options.output,
    effect,
    audiences: options.audiences ?? ["browser", "desktop", "admin"],
    projectScope: options.projectScope ?? "required",
    projectScopeByAudience: Object.freeze({ ...(options.projectScopeByAudience ?? {}) }),
    privacyProjection: options.privacyProjection ?? "human",
    cancellation: options.cancellation ?? (effect === "read" ? "supported" : "best-effort"),
    idempotency: options.idempotency ?? "not-applicable",
    timeoutMs: options.timeoutMs ?? 15_000,
    maximumResponseBytes: options.maximumResponseBytes ?? 2 * 1024 * 1024,
    invalidates: options.invalidates ?? [],
    compatibilityVersion: RPC_COMPATIBILITY_VERSION,
    publicErrors: options.publicErrors ?? standardPublicErrors
  };
}

const optionalString = optionalSchema(stringSchema);
const optionalBoolean = optionalSchema(booleanSchema);
const optionalNumber = optionalSchema(numberSchema);
const optionalPositiveNumber = optionalSchema(numberRangeSchema(1));
const optionalInteger = optionalSchema(integerSchema);
const strings = arraySchema(stringSchema);
const optionalStrings = optionalSchema(strings);
const nonNegativeIntegerSchema: RuntimeSchema<number> = {
  description: "a non-negative integer",
  parse(value, path = "value") {
    const parsed = integerSchema.parse(value, path);
    if (parsed < 0) throw new ContractDecodeError(path, "a non-negative integer", value);
    return parsed;
  }
};
const projectIdInput = objectSchema({ projectId: projectIdSchema });
const graphExtractionRuleInputSchema: RuntimeSchema<GraphExtractionRule | JsonObject> =
  jsonObjectSchema;
const optionalSessionOutput = unionSchema([sessionSchema, nullableSchema(sessionSchema), undefinedSchema]);

const providerFields = {
  timeoutMs: optionalNumber,
  maxOutputTokens: optionalNumber,
  jsonMode: optionalBoolean
} as const;

const providerCheckFields = {
  endpoint: optionalString,
  model: optionalString,
  providerKind: optionalString,
  timeoutMs: optionalNumber,
  maxOutputTokens: optionalNumber,
  jsonMode: optionalBoolean
} as const;

const providerSecretStatusSchema = objectSchema({
  configured: booleanSchema,
  providerKind: stringSchema,
  revision: nullableSchema(stringSchema),
  updatedAt: nullableSchema(stringSchema)
});

const destructiveIntentSchema = objectSchema({
  intentId: stringSchema,
  operation: stringSchema,
  projectId: projectIdSchema,
  targetDigest: stringSchema,
  acknowledgement: stringSchema,
  expiresAt: stringSchema
});
const providerSecretIdentitySchema = objectSchema({
  projectId: projectIdSchema,
  providerKind: stringSchema
});

const assistantPolicyPatchSchema: RuntimeSchema<Partial<AssistantPolicy>> = objectSchema(
  {
    enabled: optionalBoolean,
    runtimeType: optionalSchema(enumSchema([
      "app-managed-llamacpp",
      "llama-cpp",
      "ollama",
      "lm-studio",
      "openai",
      "anthropic",
      "custom-openai-compatible",
      "disabled"
    ])),
    modelName: optionalString,
    modelDisplayName: optionalString,
    modelPath: optionalString,
    endpoint: optionalString,
    autoAcceptLowRiskMetadata: optionalBoolean
  }
);

const semanticSettingsPatchSchema: RuntimeSchema<Partial<SemanticGraphSettings>> = objectSchema(
  {
    version: optionalSchema(literalSchema(1)),
    enabled: optionalBoolean,
    mode: optionalSchema(enumSchema(["review", "auto", "dry-run"])),
    providerId: optionalString,
    providerKind: optionalString,
    model: optionalString,
    autoAcceptThreshold: optionalNumber,
    reviewThreshold: optionalNumber,
    discardBelowThreshold: optionalNumber,
    maxCandidatesPerDocument: optionalNumber,
    maxClusterSize: optionalNumber,
    includeDeterministicSignals: optionalBoolean,
    includeVectorCandidates: optionalBoolean,
    remoteProvidersEnabled: optionalBoolean,
    updated: optionalString
  }
) as RuntimeSchema<Partial<SemanticGraphSettings>>;

const projectCreationPreviewInputSchema: RuntimeSchema<{ preview: ProjectCreationPreview }> = objectSchema({
  preview: projectCreationPreviewSchema
});

const importCommitInputSchema = objectSchema({
  projectId: projectIdSchema,
  plan: optionalSchema(importPlanSchema),
  sourceRoot: optionalString,
  profile: optionalString,
  conflictStrategy: optionalSchema(enumSchema(["skip", "overwrite", "duplicate"])),
  limit: optionalNumber
});

const semanticAnalysisInputSchema = objectSchema({
  projectId: projectIdSchema,
  scope: optionalSchema(semanticGraphScopeSchema),
  mode: optionalSchema(enumSchema(["review", "auto", "dry-run"])),
  dryRun: optionalBoolean,
  ...providerFields,
  sourceAgent: optionalString,
  maxDocumentChars: optionalNumber,
  maxDocuments: optionalNumber,
  maxCandidates: optionalNumber,
  maxCandidatesPerDocument: optionalNumber,
  autoAcceptThreshold: optionalNumber,
  reviewThreshold: optionalNumber,
  discardBelowThreshold: optionalNumber,
  persistCandidateIndex: optionalBoolean
});

export const OPERATION_REGISTRY = {
  "memory.health": defineOperation({ input: emptyObjectSchema, output: objectSchema({ status: stringSchema, memoryRoot: stringSchema }, { unknownKeys: "passthrough" }), audiences: ["browser", "desktop", "agent", "admin"], projectScope: "none", privacyProjection: "agent" }),
  "memory.mcp_doctor": defineOperation({ input: emptyObjectSchema, output: jsonObjectSchema, audiences: ["desktop", "admin"], projectScope: "none" }),
  "memory.mcp_install": defineOperation({
    input: objectSchema({
      client: optionalSchema(enumSchema(["auto", "codex", "claude-code", "claude-desktop"])),
      transport: optionalSchema(enumSchema(["http", "stdio"])),
      authMode: optionalSchema(enumSchema(["auto", "none", "token"])),
      configPath: optionalString,
      daemonUrl: optionalString,
      serverName: optionalString,
      workingDirectory: optionalString,
      dryRun: optionalBoolean
    }),
    output: jsonObjectSchema,
    effect: "mutation",
    audiences: ["desktop", "admin"],
    projectScope: "none",
    invalidates: ["mcp-installation"]
  }),
  "memory.list_projects": defineOperation({ input: emptyObjectSchema, output: arraySchema(projectSchema), projectScope: "none", maximumResponseBytes: 4 * 1024 * 1024 }),
  "memory.get_project": defineOperation({ input: projectIdInput, output: projectSchema, audiences: ["desktop", "admin"] }),
  "memory.detect_project": defineOperation({ input: objectSchema({ workingDirectory: stringSchema }), output: jsonObjectSchema, audiences: ["desktop", "admin"], projectScope: "none" }),
  "memory.get_startup_state": defineOperation({
    input: objectSchema({ workingDirectory: optionalString, projectId: optionalSchema(projectIdSchema), clientName: optionalString, knownRevision: optionalString }),
    output: startupStateSchema,
    audiences: ["browser", "desktop", "agent", "admin"],
    projectScopeByAudience: { agent: "required", browser: "required" },
    privacyProjection: "agent",
    projectScope: "none",
    maximumResponseBytes: 4 * 1024 * 1024
  }),
  "memory.prepare_project_creation": defineOperation({
    input: objectSchema({ workingDirectory: optionalString, projectName: optionalString, createPointerFile: optionalBoolean, bootstrapFiles: optionalStrings }),
    output: projectCreationPreviewSchema,
    projectScope: "none"
  }),
  "memory.create_project": defineOperation({ input: projectCreationPreviewInputSchema, output: projectSchema, effect: "mutation", projectScope: "none", invalidates: ["projects"] }),
  "memory.delete_project": defineOperation({ input: projectIdInput, output: trashItemSchema, effect: "destructive", invalidates: ["projects", "trash"] }),
  "memory.get_project_summary": defineOperation({ input: projectIdInput, output: projectSummarySnapshotSchema, maximumResponseBytes: 4 * 1024 * 1024 }),
  "memory.update_memory_write_policy": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, allowAgentDirectWrites: optionalBoolean, reviewMode: optionalSchema(enumSchema(["off", "risky-only", "all"])) }),
    output: memoryWritePolicySchema,
    effect: "mutation",
    invalidates: ["project-summary", "project-policy"]
  }),
  "memory.update_assistant_policy": defineOperation({
    input: objectSchema({
      projectId: projectIdSchema,
      enabled: optionalBoolean,
      runtimeType: optionalSchema(enumSchema(["app-managed-llamacpp", "llama-cpp", "ollama", "lm-studio", "openai", "anthropic", "custom-openai-compatible", "disabled"])),
      modelName: optionalString,
      modelDisplayName: optionalString,
      modelPath: optionalString,
      endpoint: optionalString,
      autoAcceptLowRiskMetadata: optionalBoolean,
      policy: optionalSchema(assistantPolicyPatchSchema)
    }),
    output: assistantPolicySchema,
    effect: "mutation",
    invalidates: ["assistant-policy", "assistant-status", "projects", "project-summary"]
  }),
  "memory.get_provider_secret_status": defineOperation({
    input: providerSecretIdentitySchema,
    output: providerSecretStatusSchema,
    audiences: ["desktop", "admin"]
  }),
  "memory.set_provider_secret": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, providerKind: stringSchema, secret: stringSchema }),
    output: providerSecretStatusSchema,
    effect: "mutation",
    audiences: ["desktop", "admin"],
    idempotency: "required",
    invalidates: ["provider-secret-status"]
  }),
  "memory.rotate_provider_secret": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, providerKind: stringSchema, secret: stringSchema, expectedRevision: stringSchema }),
    output: providerSecretStatusSchema,
    effect: "mutation",
    audiences: ["desktop", "admin"],
    idempotency: "required",
    invalidates: ["provider-secret-status"]
  }),
  "memory.clear_provider_secret": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, providerKind: stringSchema, expectedRevision: stringSchema }),
    output: providerSecretStatusSchema,
    effect: "mutation",
    audiences: ["desktop", "admin"],
    idempotency: "required",
    invalidates: ["provider-secret-status"]
  }),
  "memory.prepare_destructive_intent": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, operation: stringSchema, input: jsonObjectSchema }),
    output: destructiveIntentSchema,
    effect: "proposal",
    audiences: ["browser", "desktop", "admin", "backup"]
  }),
  "memory.commit_destructive_intent": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, intentId: stringSchema, acknowledgement: stringSchema }),
    output: jsonObjectSchema,
    effect: "destructive",
    audiences: ["browser", "desktop", "admin", "backup"],
    invalidates: ["projects", "project-content", "trash", "backups"]
  }),
  "memory.cancel_destructive_intent": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, intentId: stringSchema }),
    output: jsonObjectSchema,
    effect: "mutation",
    audiences: ["browser", "desktop", "admin", "backup"]
  }),
  "memory.update_graph_rules": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, graphRules: optionalSchema(arraySchema(graphExtractionRuleInputSchema)) }),
    output: arraySchema(graphExtractionRuleSchema),
    effect: "mutation",
    invalidates: ["project-graph", "projects", "project-summary"]
  }),
  "memory.ensure_project": defineOperation({ input: projectIdInput, output: projectSchema, effect: "mutation", audiences: ["desktop", "admin"], invalidates: ["project-workspace"] }),
  "memory.list_project_repos": defineOperation({ input: projectIdInput, output: arraySchema(repoLinkSchema) }),
  "memory.link_repo": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, repoPath: stringSchema, role: optionalString, name: optionalString, description: optionalString, defaultBranch: optionalString, writePointerFile: optionalBoolean }),
    output: jsonObjectSchema,
    effect: "mutation",
    invalidates: ["project-repos", "project-graph", "projects", "project-summary"]
  }),
  "memory.unlink_repo": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, repoPath: stringSchema, removePointerFile: optionalBoolean }),
    output: jsonObjectSchema,
    effect: "mutation",
    invalidates: ["project-repos", "project-graph", "projects", "project-summary"]
  }),
  "memory.delete_repo": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, repoPath: stringSchema, removePointerFile: optionalBoolean }),
    output: trashItemSchema,
    effect: "destructive",
    invalidates: ["project-repos", "project-graph", "projects", "project-summary", "trash"]
  }),
  "memory.list_workstreams": defineOperation({ input: projectIdInput, output: arraySchema(workstreamSchema) }),
  "memory.create_workstream": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, name: stringSchema, summary: optionalString, goal: optionalString, topics: optionalStrings, repoRoles: optionalStrings, relatedTasks: optionalStrings, relatedFiles: optionalStrings, body: optionalString }),
    output: workstreamSchema,
    effect: "mutation",
    invalidates: ["workstreams", "project-graph"]
  }),
  "memory.get_workstream_detail": defineOperation({ input: objectSchema({ projectId: projectIdSchema, workstreamId: stringSchema }), output: workstreamDetailSchema, maximumResponseBytes: 4 * 1024 * 1024 }),
  "memory.update_workstream_status": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, workstreamId: stringSchema, status: enumSchema(["active", "paused", "done", "archived"]) }),
    output: workstreamSchema,
    effect: "mutation",
    invalidates: ["workstreams", "project-graph"]
  }),
  "memory.delete_workstream": defineOperation({ input: objectSchema({ projectId: projectIdSchema, workstreamId: stringSchema }), output: trashItemSchema, effect: "destructive", invalidates: ["workstreams", "project-graph", "trash"] }),
  "memory.start_session": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, repoPath: optionalString, workingDirectory: optionalString, branch: optionalString, agent: optionalString, client: optionalString, taskTitle: optionalString, goal: optionalString, workstreamIds: optionalStrings }),
    output: sessionSchema,
    audiences: ["browser", "desktop", "agent", "admin"],
    privacyProjection: "agent",
    effect: "mutation",
    idempotency: "required",
    invalidates: ["sessions", "project-summary"]
  }),
  "memory.start_or_resume_session": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, taskTitle: optionalString, workingDirectory: optionalString, branch: optionalString, agent: optionalString, client: optionalString, goal: optionalString }),
    output: sessionSchema,
    audiences: ["desktop", "admin"],
    effect: "mutation",
    invalidates: ["sessions", "project-summary"]
  }),
  "memory.get_active_session": defineOperation({ input: projectIdInput, output: optionalSessionOutput, audiences: ["desktop", "admin"] }),
  "memory.get_latest_session": defineOperation({ input: projectIdInput, output: unionSchema([sessionSummarySchema, nullableSchema(sessionSummarySchema), undefinedSchema]), audiences: ["desktop", "agent", "admin"], privacyProjection: "agent" }),
  "memory.get_recent_sessions": defineOperation({ input: objectSchema({ projectId: projectIdSchema, limit: optionalSchema(numberRangeSchema(1, 200)) }), output: arraySchema(sessionSummarySchema), audiences: ["desktop", "agent", "admin"], privacyProjection: "agent" }),
  "memory.list_project_sessions": defineOperation({ input: objectSchema({ projectId: projectIdSchema, limit: optionalSchema(numberRangeSchema(1, 200)) }), output: arraySchema(sessionSummarySchema), maximumResponseBytes: 4 * 1024 * 1024 }),
  "memory.get_session_detail": defineOperation({ input: objectSchema({ projectId: projectIdSchema, sessionId: stringSchema, sections: optionalSchema(arraySchema(enumSchema(["body", "checkpoints"]))), checkpointLimit: optionalSchema(numberRangeSchema(1, 100)), cursor: optionalString }), output: sessionDetailSchema, audiences: ["browser", "desktop", "agent", "admin"], privacyProjection: "agent", maximumResponseBytes: 4 * 1024 * 1024 }),
  "memory.save_checkpoint": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, sessionId: stringSchema, summary: stringSchema, nextSteps: optionalStrings, blockers: optionalStrings, touchedFiles: optionalStrings, proposedUpdateIds: optionalStrings, workstreamIds: optionalStrings }),
    output: sessionSchema,
    audiences: ["browser", "desktop", "agent", "admin"],
    privacyProjection: "agent",
    effect: "mutation",
    idempotency: "required",
    invalidates: ["sessions", "project-summary"]
  }),
  "memory.update_session_graph_visibility": defineOperation({ input: objectSchema({ projectId: projectIdSchema, sessionId: stringSchema, includeInGraph: booleanSchema, compact: optionalBoolean }), output: unionSchema([sessionSchema, sessionSummarySchema]), effect: "mutation", invalidates: ["sessions", "project-graph"] }),
  "memory.close_session": defineOperation({
    input: objectSchema({ projectId: projectIdSchema, sessionId: stringSchema, summary: optionalString, nextSteps: optionalStrings, blockers: optionalStrings, touchedFiles: optionalStrings, workstreamIds: optionalStrings, includeInGraph: optionalBoolean, compact: optionalBoolean, autoSummarize: optionalBoolean, ...providerFields }),
    output: unionSchema([sessionSchema, sessionSummarySchema]),
    audiences: ["browser", "desktop", "agent", "admin"],
    privacyProjection: "agent",
    effect: "mutation",
    idempotency: "required",
    timeoutMs: 75_000,
    invalidates: ["sessions", "project-summary", "project-graph"]
  }),
  "memory.close_stale_sessions": defineOperation({ input: projectIdInput, output: jsonObjectSchema, effect: "mutation", invalidates: ["sessions", "project-summary"] }),
  "memory.generate_session_summary": defineOperation({ input: objectSchema({ projectId: projectIdSchema, sessionId: stringSchema, force: optionalBoolean, ...providerFields }), output: jsonObjectSchema, effect: "mutation", invalidates: ["sessions", "project-summary"] }),
  "memory.generate_session_summaries": defineOperation({ input: objectSchema({ projectId: projectIdSchema, mode: optionalSchema(enumSchema(["missing", "all"])), limit: optionalNumber, ...providerFields }), output: jsonObjectSchema, effect: "mutation", invalidates: ["sessions", "project-summary"] }),
  "memory.delete_session": defineOperation({ input: objectSchema({ projectId: projectIdSchema, sessionId: stringSchema }), output: trashItemSchema, effect: "destructive", invalidates: ["sessions", "project-summary", "project-graph", "trash"] }),
  "memory.search": defineOperation({ input: objectSchema({ projectId: projectIdSchema, query: stringSchema, limit: optionalNumber }), output: arraySchema(searchResultSchema), audiences: ["browser", "desktop", "agent", "admin"], privacyProjection: "agent", maximumResponseBytes: 4 * 1024 * 1024 }),
  "memory.list_docs": defineOperation({ input: projectIdInput, output: arraySchema(memoryDocumentSchema), maximumResponseBytes: 8 * 1024 * 1024 }),
  "memory.import_doc": defineOperation({ input: objectSchema({ projectId: projectIdSchema, title: stringSchema, type: stringSchema, body: stringSchema, status: optionalString, visibility: optionalString, topics: optionalStrings, workstreamIds: optionalStrings, relatedTasks: optionalStrings, relatedFiles: optionalStrings, relatedSessions: optionalStrings, format: optionalString }), output: memoryDocumentSchema, effect: "mutation", audiences: ["desktop", "admin"], invalidates: ["documents", "project-summary", "project-graph"] }),
  "memory.create_doc": defineOperation({ input: objectSchema({ projectId: projectIdSchema, title: stringSchema, type: stringSchema, body: stringSchema, status: optionalString, visibility: optionalString, topics: optionalStrings, workstreamIds: optionalStrings, relatedTasks: optionalStrings, relatedFiles: optionalStrings, relatedSessions: optionalStrings, format: optionalString }), output: memoryDocumentSchema, effect: "mutation", audiences: ["desktop", "admin"], invalidates: ["documents", "project-summary", "project-graph"] }),
  "memory.update_doc": defineOperation({ input: objectSchema({ projectId: projectIdSchema, documentId: documentIdSchema, title: optionalString, type: optionalString, body: optionalString, status: optionalString, visibility: optionalString, topics: optionalStrings, workstreamIds: optionalStrings, relatedTasks: optionalStrings, relatedFiles: optionalStrings, relatedSessions: optionalStrings, relatedDiagrams: optionalStrings, format: optionalString, lastVerified: optionalString, confidence: optionalString }), output: memoryDocumentSchema, effect: "mutation", invalidates: ["documents", "project-summary", "project-graph"] }),
  "memory.delete_doc": defineOperation({ input: objectSchema({ projectId: projectIdSchema, documentId: documentIdSchema }), output: trashItemSchema, effect: "destructive", invalidates: ["documents", "project-summary", "project-graph", "trash"] }),
  "memory.list_import_profiles": defineOperation({ input: emptyObjectSchema, output: arraySchema(importProfileSchema), projectScope: "none" }),
  "memory.prepare_import": defineOperation({ input: objectSchema({ projectId: projectIdSchema, sourceRoot: stringSchema, profile: stringSchema, limit: optionalNumber }), output: importPlanSchema, maximumResponseBytes: 8 * 1024 * 1024 }),
  "memory.commit_import": defineOperation({ input: importCommitInputSchema, output: importCommitResultSchema, effect: "mutation", timeoutMs: 60_000, invalidates: ["documents", "sessions", "project-summary", "project-graph"] }),
  "memory.preview_context_bundle": defineOperation({ input: objectSchema({ projectId: projectIdSchema, sessionId: optionalString, taskText: optionalString, requestedBy: optionalString, maxTokens: optionalPositiveNumber, idempotencyKey: optionalString }), output: contextBundleSchema, audiences: ["browser", "desktop", "agent", "admin"], privacyProjection: "agent", maximumResponseBytes: 8 * 1024 * 1024 }),
  "memory.get_context_bundle": defineOperation({ input: objectSchema({ projectId: projectIdSchema, sessionId: optionalString, taskText: optionalString, requestedBy: optionalString, maxTokens: optionalPositiveNumber, idempotencyKey: optionalString }), output: contextBundleSchema, effect: "mutation", idempotency: "required", audiences: ["browser", "desktop", "agent", "admin"], privacyProjection: "agent", maximumResponseBytes: 8 * 1024 * 1024, invalidates: ["context-bundles"] }),
  "memory.propose_memory_update": defineOperation({ input: objectSchema({ projectId: projectIdSchema, type: stringSchema, sourceSession: optionalString, sourceAgent: optionalString, sourceKind: stringSchema, confidence: optionalString, affectedFiles: optionalStrings, targetDocument: optionalString, proposedPatch: stringSchema, reason: stringSchema }), output: proposedMemoryUpdateSchema, effect: "proposal", audiences: ["desktop", "admin"], invalidates: ["inbox"] }),
  "memory.propose_graph_update": defineOperation({ input: objectSchema({ projectId: projectIdSchema, sourceSession: optionalString, sourceAgent: optionalString, confidence: optionalString, affectedFiles: optionalStrings, proposedPatch: stringSchema, reason: stringSchema }), output: proposedMemoryUpdateSchema, effect: "proposal", audiences: ["desktop", "admin"], invalidates: ["inbox"] }),
  "memory.list_inbox": defineOperation({ input: projectIdInput, output: arraySchema(proposedMemoryUpdateSchema), maximumResponseBytes: 4 * 1024 * 1024 }),
  "memory.update_inbox_status": defineOperation({ input: objectSchema({ projectId: projectIdSchema, proposalId: stringSchema, status: enumSchema(["pending", "accepted", "rejected", "deferred", "edited"]), editedPatch: optionalString }), output: proposedMemoryUpdateSchema, effect: "mutation", invalidates: ["inbox", "project-summary", "documents", "project-graph"] }),
  "memory.delete_inbox_item": defineOperation({ input: objectSchema({ projectId: projectIdSchema, proposalId: stringSchema }), output: trashItemSchema, effect: "destructive", invalidates: ["inbox", "project-summary", "trash"] }),
  "memory.get_graph": defineOperation({ input: objectSchema({ projectId: projectIdSchema, includeSemantic: optionalString, includeSemanticProposals: optionalBoolean }), output: projectGraphSchema, maximumResponseBytes: 8 * 1024 * 1024 }),
  "memory.get_semantic_graph_settings": defineOperation({ input: projectIdInput, output: semanticGraphSettingsSchema }),
  "memory.update_semantic_graph_settings": defineOperation({ input: objectSchema({ projectId: projectIdSchema, settings: optionalSchema(semanticSettingsPatchSchema), enabled: optionalBoolean, mode: optionalString, providerId: optionalString, providerKind: optionalString, model: optionalString, autoAcceptThreshold: optionalNumber, reviewThreshold: optionalNumber, discardBelowThreshold: optionalNumber, maxCandidatesPerDocument: optionalNumber, maxClusterSize: optionalNumber, includeDeterministicSignals: optionalBoolean, includeVectorCandidates: optionalBoolean, remoteProvidersEnabled: optionalBoolean }), output: semanticGraphSettingsSchema, effect: "mutation", invalidates: ["semantic-settings", "semantic-status"] }),
  "memory.get_semantic_graph_status": defineOperation({ input: projectIdInput, output: semanticGraphStatusSchema }),
  "memory.list_semantic_edges": defineOperation({ input: objectSchema({ projectId: projectIdSchema, status: optionalSchema(unionSchema([stringSchema, strings])) }), output: arraySchema(semanticGraphEdgeSchema), maximumResponseBytes: 8 * 1024 * 1024 }),
  "memory.update_semantic_edge_status": defineOperation({ input: objectSchema({ projectId: projectIdSchema, edgeIds: strings, status: enumSchema(["proposed", "accepted", "rejected", "auto-accepted"]) }), output: jsonObjectSchema, effect: "mutation", invalidates: ["semantic-edges", "semantic-status", "project-graph"] }),
  "memory.list_semantic_graph_runs": defineOperation({ input: projectIdInput, output: arraySchema(semanticGraphRunSchema), maximumResponseBytes: 4 * 1024 * 1024 }),
  "memory.get_semantic_graph_run": defineOperation({ input: objectSchema({ projectId: projectIdSchema, runId: stringSchema }), output: semanticGraphRunSchema }),
  "memory.preview_semantic_graph_analysis": defineOperation({ input: objectSchema({ projectId: projectIdSchema, scope: optionalSchema(semanticGraphScopeSchema), maxDocumentChars: optionalNumber, persistCandidateIndex: optionalBoolean }), output: semanticAnalysisPreviewResultSchema, timeoutMs: 60_000, maximumResponseBytes: 8 * 1024 * 1024 }),
  "memory.analyze_semantic_graph": defineOperation({ input: semanticAnalysisInputSchema, output: semanticAnalysisResultSchema, effect: "mutation", timeoutMs: 180_000, maximumResponseBytes: 8 * 1024 * 1024, invalidates: ["semantic-runs", "semantic-edges", "semantic-status", "inbox", "project-graph"] }),
  "memory.check_semantic_graph_provider": defineOperation({ input: objectSchema({ projectId: projectIdSchema, ...providerCheckFields }), output: semanticProviderCheckResultSchema, audiences: ["browser", "desktop", "admin", "provider"], timeoutMs: 60_000, privacyProjection: "provider" }),
  "memory.propose_semantic_edges": defineOperation({ input: objectSchema({ projectId: projectIdSchema, edges: jsonObjectArraySchema, sourceAgent: optionalString }), output: jsonObjectSchema, effect: "proposal", invalidates: ["inbox", "semantic-edges"] }),
  "memory.accept_semantic_edges_proposal": defineOperation({ input: objectSchema({ projectId: projectIdSchema, proposalId: stringSchema, status: optionalSchema(enumSchema(["accepted", "auto-accepted"])), minConfidence: optionalNumber, maxConfidence: optionalNumber, edgeIndexes: optionalSchema(arraySchema(nonNegativeIntegerSchema)) }), output: jsonObjectSchema, effect: "mutation", invalidates: ["inbox", "semantic-edges", "semantic-status", "project-graph"] }),
  "memory.backup_project": defineOperation({ input: projectIdInput, output: backupSnapshotItemSchema, effect: "mutation", audiences: ["browser", "desktop", "admin", "backup"], timeoutMs: 60_000, invalidates: ["backups"] }),
  "memory.list_backups": defineOperation({ input: projectIdInput, output: arraySchema(backupSnapshotItemSchema), audiences: ["browser", "desktop", "admin", "backup"] }),
  "memory.delete_backup": defineOperation({ input: objectSchema({ projectId: projectIdSchema, snapshotPath: stringSchema }), output: trashItemSchema, effect: "destructive", audiences: ["browser", "desktop", "admin", "backup"], invalidates: ["backups", "trash"] }),
  "memory.list_trash": defineOperation({ input: projectIdInput, output: arraySchema(trashItemSchema), audiences: ["desktop", "admin"], maximumResponseBytes: 4 * 1024 * 1024 }),
  "memory.restore_trash_item": defineOperation({ input: objectSchema({ projectId: projectIdSchema, trashItemId: stringSchema }), output: jsonObjectSchema, effect: "destructive", audiences: ["desktop", "admin"], invalidates: ["projects", "trash", "project-content"] }),
  "memory.purge_trash_item": defineOperation({ input: objectSchema({ projectId: projectIdSchema, trashItemId: stringSchema }), output: jsonObjectSchema, effect: "destructive", audiences: ["desktop", "admin"], invalidates: ["trash"] }),
  "memory.empty_trash": defineOperation({ input: objectSchema({ projectId: projectIdSchema, trashItemIds: optionalStrings }), output: jsonObjectSchema, effect: "destructive", audiences: ["desktop", "admin"], invalidates: ["trash"] }),
  "memory.validate_project": defineOperation({ input: projectIdInput, output: arraySchema(stringSchema), audiences: ["desktop", "admin"] }),
  "memory.rebuild_index": defineOperation({ input: projectIdInput, output: jsonObjectSchema, effect: "mutation", audiences: ["desktop", "admin"], invalidates: ["project-index", "search", "project-graph"] }),
  "memory.assistant_status": defineOperation({ input: projectIdInput, output: assistantStatusResultSchema }),
  "memory.summarize_session": defineOperation({ input: objectSchema({ projectId: projectIdSchema, sessionId: stringSchema }), output: proposedMemoryUpdateSchema, effect: "proposal", audiences: ["desktop", "admin"], invalidates: ["inbox"] }),
  "memory.prepare_return_summary": defineOperation({ input: projectIdInput, output: proposedMemoryUpdateSchema, effect: "proposal", audiences: ["desktop", "admin"], invalidates: ["inbox"] }),
  "memory.classify_imported_doc": defineOperation({ input: objectSchema({ projectId: projectIdSchema, documentId: documentIdSchema }), output: proposedMemoryUpdateSchema, effect: "proposal", audiences: ["desktop", "admin"], invalidates: ["inbox"] }),
  "memory.export_project_manifest": defineOperation({ input: projectIdInput, output: jsonObjectSchema, audiences: ["desktop", "admin"], maximumResponseBytes: 8 * 1024 * 1024 })
} as const;

export type OperationName = keyof typeof OPERATION_REGISTRY;
export type OperationInput<Name extends OperationName> = InferSchema<(typeof OPERATION_REGISTRY)[Name]["input"]>;
export type OperationOutput<Name extends OperationName> = InferSchema<(typeof OPERATION_REGISTRY)[Name]["output"]>;

export interface OperationAdmissionMetadata {
  readonly name: OperationName;
  readonly audiences: readonly OperationAudience[];
  readonly projectScope: OperationProjectScope;
  readonly projectScopeByAudience: Readonly<Partial<Record<OperationAudience, OperationProjectScope>>>;
  readonly effect: EffectClass;
  readonly privacyProjection: OperationDefinition<unknown, unknown>["privacyProjection"];
}

export const DESKTOP_OPERATIONS = [
  "memory.accept_semantic_edges_proposal",
  "memory.analyze_semantic_graph",
  "memory.assistant_status",
  "memory.backup_project",
  "memory.cancel_destructive_intent",
  "memory.check_semantic_graph_provider",
  "memory.clear_provider_secret",
  "memory.close_session",
  "memory.close_stale_sessions",
  "memory.commit_destructive_intent",
  "memory.commit_import",
  "memory.create_project",
  "memory.create_workstream",
  "memory.delete_backup",
  "memory.delete_doc",
  "memory.delete_inbox_item",
  "memory.delete_project",
  "memory.delete_repo",
  "memory.delete_session",
  "memory.delete_workstream",
  "memory.empty_trash",
  "memory.generate_session_summaries",
  "memory.generate_session_summary",
  "memory.get_context_bundle",
  "memory.get_graph",
  "memory.get_project_summary",
  "memory.get_provider_secret_status",
  "memory.get_semantic_graph_run",
  "memory.get_semantic_graph_settings",
  "memory.get_semantic_graph_status",
  "memory.get_session_detail",
  "memory.get_startup_state",
  "memory.get_workstream_detail",
  "memory.health",
  "memory.link_repo",
  "memory.list_backups",
  "memory.list_docs",
  "memory.list_import_profiles",
  "memory.list_inbox",
  "memory.list_project_repos",
  "memory.list_project_sessions",
  "memory.list_projects",
  "memory.list_semantic_edges",
  "memory.list_semantic_graph_runs",
  "memory.list_trash",
  "memory.list_workstreams",
  "memory.mcp_doctor",
  "memory.mcp_install",
  "memory.prepare_destructive_intent",
  "memory.prepare_import",
  "memory.prepare_project_creation",
  "memory.preview_context_bundle",
  "memory.preview_semantic_graph_analysis",
  "memory.propose_semantic_edges",
  "memory.purge_trash_item",
  "memory.restore_trash_item",
  "memory.rotate_provider_secret",
  "memory.save_checkpoint",
  "memory.search",
  "memory.set_provider_secret",
  "memory.start_session",
  "memory.unlink_repo",
  "memory.update_assistant_policy",
  "memory.update_doc",
  "memory.update_graph_rules",
  "memory.update_inbox_status",
  "memory.update_memory_write_policy",
  "memory.update_semantic_edge_status",
  "memory.update_semantic_graph_settings",
  "memory.update_session_graph_visibility",
  "memory.update_workstream_status"
] as const satisfies readonly OperationName[];

export type DesktopOperation = (typeof DESKTOP_OPERATIONS)[number];

const operationNames = new Set<string>(Object.keys(OPERATION_REGISTRY));
const desktopOperationNames = new Set<string>(DESKTOP_OPERATIONS);

export const AGENT_OPERATIONS = Object.freeze(
  (Object.keys(OPERATION_REGISTRY) as OperationName[])
    .filter((name) => OPERATION_REGISTRY[name].audiences.includes("agent" as never))
);

export function operationsForAudience(audience: OperationAudience): readonly OperationName[] {
  return Object.freeze(
    (Object.keys(OPERATION_REGISTRY) as OperationName[])
      .filter((name) => (OPERATION_REGISTRY[name].audiences as readonly OperationAudience[]).includes(audience))
  );
}

export function isOperationName(value: string): value is OperationName {
  return operationNames.has(value);
}

export function isDesktopOperation(value: string): value is DesktopOperation {
  return desktopOperationNames.has(value);
}

export function getOperationDefinition<Name extends OperationName>(
  name: Name
): (typeof OPERATION_REGISTRY)[Name] {
  return OPERATION_REGISTRY[name];
}

export function getOperationAdmissionMetadata(name: OperationName): OperationAdmissionMetadata {
  const definition = OPERATION_REGISTRY[name];
  return Object.freeze({
    name,
    audiences: Object.freeze([...definition.audiences]),
    projectScope: definition.projectScope,
    projectScopeByAudience: Object.freeze({ ...definition.projectScopeByAudience }),
    effect: definition.effect,
    privacyProjection: definition.privacyProjection
  });
}

export function operationAcceptsAudience(
  name: OperationName,
  audience: OperationAudience
): boolean {
  return (OPERATION_REGISTRY[name].audiences as readonly OperationAudience[]).includes(audience);
}

export function operationRequiresProject(name: OperationName): boolean {
  return OPERATION_REGISTRY[name].projectScope === "required";
}

export function getOperationProjectScope(
  name: OperationName,
  audience: OperationAudience
): OperationProjectScope {
  const definition = OPERATION_REGISTRY[name];
  return definition.projectScopeByAudience[audience] ?? definition.projectScope;
}

/** Reads only the registrar-owned top-level binding; it does not validate params. */
export function extractOperationProjectId(
  _name: OperationName,
  input: unknown
): string | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const projectId = (input as Record<string, unknown>).projectId;
  if (typeof projectId !== "string") return undefined;
  try {
    return projectIdSchema.parse(projectId, `${_name}.input.projectId`);
  } catch {
    return undefined;
  }
}

export function parseOperationInput<Name extends OperationName>(
  name: Name,
  input: unknown
): OperationInput<Name> {
  return OPERATION_REGISTRY[name].input.parse(input, `${name}.input`) as OperationInput<Name>;
}

export function parseOperationOutput<Name extends OperationName>(
  name: Name,
  output: unknown
): OperationOutput<Name> {
  return OPERATION_REGISTRY[name].output.parse(output, `${name}.output`) as OperationOutput<Name>;
}

export function operationRegistryManifest() {
  return Object.entries(OPERATION_REGISTRY).map(([name, definition]) => ({
    name: name as OperationName,
    effect: definition.effect,
    audiences: [...definition.audiences],
    projectScope: definition.projectScope,
    projectScopeByAudience: { ...definition.projectScopeByAudience },
    privacyProjection: definition.privacyProjection,
    cancellation: definition.cancellation,
    idempotency: definition.idempotency,
    timeoutMs: definition.timeoutMs,
    maximumResponseBytes: definition.maximumResponseBytes,
    invalidates: [...definition.invalidates],
    compatibilityVersion: definition.compatibilityVersion,
    publicErrors: [...definition.publicErrors]
  }));
}

// Compile-time witnesses for the public contract types most likely to drift.
void (null as unknown as OperationInput<"memory.create_project"> satisfies { preview: ProjectCreationPreview });
void (null as unknown as OperationOutput<"memory.create_project"> satisfies Project);
void (null as unknown as OperationInput<"memory.commit_import"> satisfies { projectId: string; plan?: ImportPlan });
void (null as unknown as OperationOutput<"memory.update_memory_write_policy"> satisfies MemoryWritePolicy);
