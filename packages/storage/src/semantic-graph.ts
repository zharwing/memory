import path from "node:path";
import {
  DEFAULT_SEMANTIC_GRAPH_SETTINGS,
  createId,
  filenameSafe,
  nowIso,
  type Project,
  type SemanticDocumentExtraction,
  type SemanticGraphEdgesFile,
  type SemanticGraphMode,
  type SemanticGraphRun,
  type SemanticGraphRunCounts,
  type SemanticGraphScope,
  type SemanticGraphSettings
} from "@aimem/core";
import { listFiles, readJson, writeJson } from "./fs.js";

export function semanticGraphRoot(project: Project): string {
  return path.join(project.memoryRoot, "semantic-graph");
}

export function semanticGraphSettingsPath(project: Project): string {
  return path.join(semanticGraphRoot(project), "settings.json");
}

export function semanticGraphEdgesPath(project: Project): string {
  return path.join(semanticGraphRoot(project), "edges.json");
}

export function semanticGraphRunsRoot(project: Project): string {
  return path.join(project.memoryRoot, "generated", "semantic", "runs");
}

export function semanticGraphRunPath(project: Project, runId: string): string {
  return path.join(semanticGraphRunsRoot(project), `${safeFilePart(runId)}.json`);
}

export function semanticExtractionsRoot(project: Project): string {
  return path.join(project.memoryRoot, "generated", "semantic", "doc-extractions");
}

export function semanticExtractionPath(project: Project, documentId: string, contentHash: string): string {
  return path.join(
    semanticExtractionsRoot(project),
    `${safeFilePart(documentId)}.${safeFilePart(contentHash)}.json`
  );
}

export async function readSemanticGraphSettings(project: Project): Promise<SemanticGraphSettings> {
  const stored = await readJson<Partial<SemanticGraphSettings> | undefined>(
    semanticGraphSettingsPath(project),
    undefined
  );

  return {
    ...DEFAULT_SEMANTIC_GRAPH_SETTINGS,
    ...stored,
    version: 1
  };
}

export async function writeSemanticGraphSettings(
  project: Project,
  settings: Partial<SemanticGraphSettings>
): Promise<SemanticGraphSettings> {
  const next: SemanticGraphSettings = {
    ...DEFAULT_SEMANTIC_GRAPH_SETTINGS,
    ...settings,
    version: 1,
    updated: nowIso()
  };
  await writeJson(semanticGraphSettingsPath(project), next);
  return next;
}

export async function readSemanticEdges(project: Project): Promise<SemanticGraphEdgesFile> {
  const stored = await readJson<SemanticGraphEdgesFile | undefined>(semanticGraphEdgesPath(project), undefined);

  if (!stored) {
    return {
      version: 1,
      projectId: project.id,
      updated: nowIso(),
      edges: []
    };
  }

  return {
    ...stored,
    version: 1,
    projectId: stored.projectId || project.id,
    updated: stored.updated || nowIso(),
    edges: stored.edges || []
  };
}

export async function writeSemanticEdges(
  project: Project,
  input: SemanticGraphEdgesFile | SemanticGraphEdgesFile["edges"]
): Promise<SemanticGraphEdgesFile> {
  const next: SemanticGraphEdgesFile = Array.isArray(input)
    ? {
        version: 1,
        projectId: project.id,
        updated: nowIso(),
        edges: input
      }
    : {
        ...input,
        version: 1,
        projectId: project.id,
        updated: nowIso(),
        edges: input.edges || []
      };

  await writeJson(semanticGraphEdgesPath(project), next);
  return next;
}

export function createSemanticGraphRun(args: {
  project: Project;
  scope: SemanticGraphScope;
  mode?: SemanticGraphMode;
  settings?: SemanticGraphSettings;
  providerId?: string;
  providerKind?: string;
  model?: string;
  counts?: Partial<SemanticGraphRunCounts>;
}): SemanticGraphRun {
  const settings = args.settings || DEFAULT_SEMANTIC_GRAPH_SETTINGS;

  return {
    id: createId("semantic-run"),
    projectId: args.project.id,
    status: "pending",
    mode: args.mode || settings.mode,
    scope: args.scope,
    providerId: args.providerId || settings.providerId,
    providerKind: args.providerKind || settings.providerKind,
    model: args.model || settings.model,
    started: nowIso(),
    thresholds: {
      autoAccept: settings.autoAcceptThreshold,
      review: settings.reviewThreshold,
      discardBelow: settings.discardBelowThreshold
    },
    counts: {
      ...emptySemanticGraphRunCounts(),
      ...args.counts
    }
  };
}

export async function readSemanticRun(project: Project, runId: string): Promise<SemanticGraphRun | undefined> {
  return readJson<SemanticGraphRun | undefined>(semanticGraphRunPath(project, runId), undefined);
}

export async function writeSemanticRun(project: Project, run: SemanticGraphRun): Promise<SemanticGraphRun> {
  const next: SemanticGraphRun = {
    ...run,
    projectId: project.id
  };
  await writeJson(semanticGraphRunPath(project, next.id), next);
  return next;
}

export async function listSemanticRuns(project: Project): Promise<SemanticGraphRun[]> {
  const files = await listFiles(semanticGraphRunsRoot(project), (file) => file.endsWith(".json"));
  const runs = await Promise.all(files.map((file) => readJson<SemanticGraphRun | undefined>(file, undefined)));
  return runs.filter(isDefined).sort((a, b) => b.started.localeCompare(a.started));
}

export async function readSemanticExtraction(
  project: Project,
  documentId: string,
  contentHash: string
): Promise<SemanticDocumentExtraction | undefined> {
  return readJson<SemanticDocumentExtraction | undefined>(
    semanticExtractionPath(project, documentId, contentHash),
    undefined
  );
}

export async function writeSemanticExtraction(
  project: Project,
  extraction: SemanticDocumentExtraction
): Promise<SemanticDocumentExtraction> {
  const next: SemanticDocumentExtraction = {
    ...extraction,
    version: 1,
    projectId: project.id
  };
  await writeJson(semanticExtractionPath(project, next.documentId, next.contentHash), next);
  return next;
}

function emptySemanticGraphRunCounts(): SemanticGraphRunCounts {
  return {
    documentsTotal: 0,
    documentsAnalyzed: 0,
    extractionsReused: 0,
    candidates: 0,
    judged: 0,
    accepted: 0,
    proposed: 0,
    rejected: 0,
    discarded: 0
  };
}

function safeFilePart(input: string): string {
  return filenameSafe(input || "unknown");
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}
