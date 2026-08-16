import {
  arraySchema,
  booleanSchema,
  enumSchema,
  literalSchema,
  nullableSchema,
  numberSchema,
  objectSchema,
  optionalSchema,
  stringSchema,
  unionSchema,
  type InferSchema,
  type RuntimeSchema
} from "./runtime-schema.js";
import { documentIdSchema, projectIdSchema } from "./identifiers.js";
import { visibilitySchema } from "./entities.js";
import {
  AGENT_OPERATIONS,
  operationAcceptsAudience,
  type OperationName
} from "./operation-registry.js";

const strings = arraySchema(stringSchema);
const completenessSchema = objectSchema({
  status: enumSchema(["complete", "partial"]),
  excludedItems: numberSchema,
  redactions: numberSchema,
  truncatedItems: numberSchema
});

const checkpointSchema = objectSchema({
  id: stringSchema,
  created: stringSchema,
  summary: stringSchema,
  nextSteps: strings,
  blockers: strings,
  proposedUpdateIds: strings,
  visibility: optionalSchema(visibilitySchema),
  stateFields: optionalSchema(arraySchema(enumSchema(["nextSteps", "blockers"])))
});

const sessionSummarySchema = objectSchema({
  id: stringSchema,
  projectId: projectIdSchema,
  status: enumSchema(["active", "closed", "archived"]),
  visibility: optionalSchema(visibilitySchema),
  taskTitle: stringSchema,
  goal: optionalSchema(stringSchema),
  branch: optionalSchema(stringSchema),
  agent: optionalSchema(stringSchema),
  client: optionalSchema(stringSchema),
  started: stringSchema,
  updated: stringSchema,
  closed: optionalSchema(stringSchema),
  closedReason: optionalSchema(stringSchema),
  summary: optionalSchema(stringSchema),
  topics: strings,
  summaryGeneratedAt: optionalSchema(stringSchema),
  summarySource: optionalSchema(enumSchema(["manual", "assistant", "deterministic", "import"])),
  nextSteps: strings,
  blockers: strings,
  checkpointCount: numberSchema,
  totalTouchedFiles: numberSchema,
  workstreamIds: strings,
  includeInGraph: booleanSchema,
  revision: stringSchema
});

const sessionSchema = objectSchema({
  id: stringSchema,
  projectId: projectIdSchema,
  branch: optionalSchema(stringSchema),
  agent: optionalSchema(stringSchema),
  client: optionalSchema(stringSchema),
  status: enumSchema(["active", "closed", "archived"]),
  visibility: optionalSchema(visibilitySchema),
  started: stringSchema,
  updated: stringSchema,
  closed: optionalSchema(stringSchema),
  closedReason: optionalSchema(stringSchema),
  taskTitle: stringSchema,
  includeInGraph: booleanSchema,
  goal: optionalSchema(stringSchema),
  summary: optionalSchema(stringSchema),
  topics: strings,
  summaryGeneratedAt: optionalSchema(stringSchema),
  summarySource: optionalSchema(enumSchema(["manual", "assistant", "deterministic", "import"])),
  summaryModel: optionalSchema(stringSchema),
  nextSteps: strings,
  blockers: strings,
  workstreamIds: strings,
  relatedDocs: arraySchema(documentIdSchema),
  relatedTasks: strings,
  contextBundleId: optionalSchema(stringSchema),
  checkpoints: arraySchema(checkpointSchema),
  body: optionalSchema(stringSchema),
  importSourceHash: optionalSchema(stringSchema),
  importedAt: optionalSchema(stringSchema),
  importProfile: optionalSchema(stringSchema),
  stateSemanticsVersion: optionalSchema(literalSchema(2))
});

const sessionDetailSchema = objectSchema({
  schema: literalSchema("zharwing.memory.session-detail.v1"),
  session: sessionSummarySchema,
  body: optionalSchema(stringSchema),
  checkpoints: optionalSchema(arraySchema(checkpointSchema)),
  nextCursor: optionalSchema(stringSchema),
  visibility: optionalSchema(visibilitySchema)
});

const searchResultSchema = objectSchema({
  id: stringSchema,
  projectId: projectIdSchema,
  type: enumSchema(["workstream", "session", "document", "proposed-update", "context-bundle"]),
  title: stringSchema,
  status: optionalSchema(stringSchema),
  visibility: optionalSchema(visibilitySchema),
  updated: optionalSchema(stringSchema),
  snippet: stringSchema,
  score: numberSchema
});

const startupWorkstreamSchema = objectSchema({
  id: stringSchema,
  visibility: optionalSchema(visibilitySchema),
  name: stringSchema,
  slug: stringSchema,
  status: enumSchema(["active", "paused", "done", "archived"]),
  summary: optionalSchema(stringSchema),
  goal: optionalSchema(stringSchema),
  topics: strings,
  updated: stringSchema
});

const startupSnapshotSchema = objectSchema({
  schema: literalSchema("zharwing.memory.startup.v2"),
  projectStatus: literalSchema("resolved"),
  revision: optionalSchema(stringSchema),
  projectId: optionalSchema(projectIdSchema),
  activeSession: optionalSchema(sessionSummarySchema),
  latestSession: optionalSchema(sessionSummarySchema),
  recentSessions: arraySchema(sessionSummarySchema),
  workstreams: arraySchema(startupWorkstreamSchema),
  counts: objectSchema({
    recentSessionsReturned: numberSchema,
    workstreamsReturned: numberSchema
  }),
  recommendedAction: enumSchema(["resume-active", "resume-latest", "start-new"]),
  contextReadiness: enumSchema(["ready", "needs-session"]),
  safetyStatus: enumSchema(["clean", "needs-review", "blocked", "index-stale"]),
  messageForClient: stringSchema
});

const startupNotModifiedSchema = objectSchema({
  schema: literalSchema("zharwing.memory.startup.v2"),
  notModified: literalSchema(true),
  revision: optionalSchema(stringSchema),
  projectId: optionalSchema(projectIdSchema)
});

const agentBundleSectionSchema = objectSchema({
  id: stringSchema,
  type: enumSchema(["project", "session", "document", "diagram", "command", "gotcha", "global"]),
  title: stringSchema,
  sourcePath: optionalSchema(stringSchema),
  visibility: visibilitySchema,
  reason: stringSchema,
  mode: enumSchema(["raw", "summary", "metadata"]),
  content: stringSchema,
  tokenEstimate: numberSchema
});

const agentBundleSchema = objectSchema({
  schema: literalSchema("zharwing.memory.bundle.v1"),
  status: literalSchema("ok"),
  projectId: projectIdSchema,
  sessionId: optionalSchema(stringSchema),
  created: stringSchema,
  idempotencyKey: optionalSchema(stringSchema),
  budget: objectSchema({ maxTokens: numberSchema, usedTokens: numberSchema, truncated: booleanSchema }),
  sections: arraySchema(agentBundleSectionSchema),
  completeness: completenessSchema,
  safetyStatus: enumSchema(["clean", "needs-review", "blocked", "index-stale"])
});

function projectionSchema<Data>(data: RuntimeSchema<Data>) {
  return objectSchema({
    schema: literalSchema("zharwing.agent-projection.v1"),
    status: literalSchema("ok"),
    data,
    completeness: completenessSchema
  });
}

function withheldEffectSchema<const Name extends string>(operation: Name) {
  return objectSchema({
    status: literalSchema("accepted"),
    operation: literalSchema(operation),
    projectId: optionalSchema(projectIdSchema),
    resultVisibility: literalSchema("withheld")
  });
}

/**
 * The complete public agent wire registry. Every object schema is closed at
 * every level, so domain fields added in the future stay daemon-local until a
 * deliberate public-contract change registers them here.
 */
export const AGENT_RESULT_SCHEMAS = Object.freeze({
  "memory.health": projectionSchema(objectSchema({ status: literalSchema("ok") })),
  "memory.get_startup_state": projectionSchema(unionSchema([startupSnapshotSchema, startupNotModifiedSchema])),
  "memory.get_latest_session": projectionSchema(nullableSchema(sessionSummarySchema)),
  "memory.get_recent_sessions": projectionSchema(arraySchema(sessionSummarySchema)),
  "memory.get_session_detail": projectionSchema(sessionDetailSchema),
  "memory.start_session": unionSchema([projectionSchema(sessionSchema), withheldEffectSchema("memory.start_session")]),
  "memory.save_checkpoint": unionSchema([projectionSchema(sessionSchema), withheldEffectSchema("memory.save_checkpoint")]),
  "memory.close_session": unionSchema([projectionSchema(sessionSchema), withheldEffectSchema("memory.close_session")]),
  "memory.search": projectionSchema(arraySchema(searchResultSchema)),
  "memory.preview_context_bundle": agentBundleSchema,
  "memory.get_context_bundle": unionSchema([agentBundleSchema, withheldEffectSchema("memory.get_context_bundle")])
} satisfies Readonly<Record<string, RuntimeSchema<unknown>>>);

export type AgentOperationName = keyof typeof AGENT_RESULT_SCHEMAS;
export type AgentResult = InferSchema<(typeof AGENT_RESULT_SCHEMAS)[AgentOperationName]>;

export function isAgentOperationName(value: OperationName): value is AgentOperationName {
  return operationAcceptsAudience(value, "agent") && value in AGENT_RESULT_SCHEMAS;
}

export function parseAgentOperationResult(name: AgentOperationName, value: unknown): AgentResult {
  return AGENT_RESULT_SCHEMAS[name].parse(value, `${name}.agentOutput`) as AgentResult;
}

/** Runtime drift assertion used by tests and startup diagnostics. */
export function agentResultSchemaRegistryIsComplete(): boolean {
  return AGENT_OPERATIONS.length === Object.keys(AGENT_RESULT_SCHEMAS).length &&
    AGENT_OPERATIONS.every((name) => name in AGENT_RESULT_SCHEMAS);
}
