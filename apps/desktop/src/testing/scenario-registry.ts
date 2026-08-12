import type { OperationName } from "@zharwing/memory-core";
import {
  FakeMemoryTransport,
  fakeMalformed,
  fakePending,
  fakePublicError,
  fakeSuccess,
  fakeTransportError,
  type FakeTransportPlan,
  type FakeTransportStep
} from "./fake-memory-transport.js";
import {
  FIXTURE_PROJECT_ID,
  fixtureDocument,
  fixtureProject,
  populatedOperationResults
} from "./fixture-data.js";

export const SCENARIO_REQUIREMENTS = [
  "initial-loading",
  "empty-complete",
  "populated-complete",
  "partial-success",
  "refreshing-known-data",
  "stale-offline",
  "unauthorized",
  "privacy-refused",
  "field-validation",
  "conflict",
  "definite-failure",
  "outcome-unknown",
  "malformed-boundary",
  "long-labels",
  "missing-optional-data",
  "large-lists",
  "large-graph",
  "light-theme",
  "dark-theme",
  "reduced-motion",
  "forced-colors",
  "pseudo-rtl",
  "dialog",
  "destructive-action",
  "graph-detail"
] as const;

export type ScenarioRequirement = (typeof SCENARIO_REQUIREMENTS)[number];
export type ScenarioTheme = "light" | "dark" | "system";

export interface ScenarioCapabilities {
  readonly theme: ScenarioTheme;
  readonly reducedMotion?: boolean;
  readonly forcedColors?: boolean;
  readonly direction?: "ltr" | "rtl";
  readonly coarsePointer?: boolean;
  readonly hover?: boolean;
}

export interface FrontendScenario {
  readonly id: string;
  readonly title: string;
  readonly route: string;
  readonly requirements: readonly ScenarioRequirement[];
  readonly transport: FakeTransportPlan;
  readonly capabilities: ScenarioCapabilities;
  readonly openSurface?:
    | "document-editor"
    | "session-closeout"
    | "destructive-confirmation"
    | "graph-detail";
  readonly formState?: "valid" | "invalid" | "conflict";
  readonly expectedRecovery?: "none" | "locked" | "offline" | "stale" | "failed" | "outcome-unknown";
}

const base = () => successPlan(populatedOperationResults());
const large = () => successPlan(populatedOperationResults({ large: true }));
const missingOptional = () => successPlan(populatedOperationResults({ omitOptional: true }));

const scenarios = [
  scenario({
    id: "initial-loading",
    title: "Initial application loading",
    route: "/projects",
    requirements: ["initial-loading"],
    responses: {
      "memory.list_projects": [fakePending()],
      "memory.health": [fakePending()]
    }
  }),
  scenario({
    id: "empty-complete",
    title: "Authoritative empty project list",
    route: "/projects",
    requirements: ["empty-complete"],
    responses: {
      "memory.list_projects": [fakeSuccess([])],
      "memory.health": [fakeSuccess({ status: "ok", memoryRoot: "synthetic-fixtures/memory" })]
    }
  }),
  scenario({
    id: "populated-complete",
    title: "Populated complete project",
    route: `/p/${FIXTURE_PROJECT_ID}/dashboard`,
    requirements: ["populated-complete"],
    responses: base()
  }),
  scenario({
    id: "partial-success",
    title: "Bounded partial session result",
    route: `/p/${FIXTURE_PROJECT_ID}/work/sessions`,
    requirements: ["partial-success"],
    responses: large()
  }),
  scenario({
    id: "refreshing-known-data",
    title: "Refreshing while known project data remains visible",
    route: "/projects",
    requirements: ["refreshing-known-data"],
    responses: {
      ...base(),
      "memory.list_projects": [fakeSuccess([fixtureProject]), fakePending()]
    }
  }),
  scenario({
    id: "stale-offline",
    title: "Known data retained while the local service is offline",
    route: `/p/${FIXTURE_PROJECT_ID}/dashboard`,
    requirements: ["stale-offline"],
    responses: {
      ...base(),
      "memory.health": [
        fakeSuccess({ status: "ok", memoryRoot: "synthetic-fixtures/memory" }),
        fakeTransportError()
      ],
      "memory.get_project_summary": [
        ...base()["memory.get_project_summary"]!,
        fakeTransportError()
      ]
    },
    expectedRecovery: "stale"
  }),
  scenario({
    id: "unauthorized-session",
    title: "Locked browser session",
    route: "/projects",
    requirements: ["unauthorized"],
    responses: {
      "memory.list_projects": [fakePublicError("unauthorized")],
      "memory.health": [fakeSuccess({ status: "ok", memoryRoot: "synthetic-fixtures/memory" })]
    },
    expectedRecovery: "locked"
  }),
  scenario({
    id: "privacy-refused",
    title: "Context projection refused by privacy policy",
    route: `/p/${FIXTURE_PROJECT_ID}/library/context`,
    requirements: ["privacy-refused"],
    responses: {
      ...base(),
      "memory.preview_context_bundle": [fakePublicError("forbidden")]
    },
    expectedRecovery: "failed"
  }),
  scenario({
    id: "invalid-form-and-conflict",
    title: "Retained document form with validation and revision conflict",
    route: `/p/${FIXTURE_PROJECT_ID}/library/docs?doc=${fixtureDocument.id}`,
    requirements: ["field-validation", "conflict"],
    responses: {
      ...base(),
      "memory.update_doc": [fakePublicError("validation"), fakePublicError("conflict")]
    },
    formState: "invalid"
  }),
  scenario({
    id: "definite-read-failure",
    title: "Definite document read failure",
    route: `/p/${FIXTURE_PROJECT_ID}/library/docs`,
    requirements: ["definite-failure"],
    responses: {
      ...base(),
      "memory.list_docs": [fakePublicError("internal")]
    },
    expectedRecovery: "failed"
  }),
  scenario({
    id: "outcome-unknown",
    title: "Mutation dispatch lost before outcome is known",
    route: `/p/${FIXTURE_PROJECT_ID}/library/docs?doc=${fixtureDocument.id}`,
    requirements: ["outcome-unknown"],
    responses: {
      ...base(),
      "memory.update_doc": [fakeTransportError()]
    },
    formState: "valid",
    expectedRecovery: "outcome-unknown"
  }),
  scenario({
    id: "malformed-boundary",
    title: "Malformed list-projects response",
    route: "/projects",
    requirements: ["malformed-boundary"],
    responses: {
      "memory.list_projects": [fakeMalformed('{"version":1,"ok":true,"result":')],
      "memory.health": [fakeSuccess({ status: "ok", memoryRoot: "synthetic-fixtures/memory" })]
    },
    expectedRecovery: "failed"
  }),
  scenario({
    id: "long-and-missing",
    title: "Long labels with absent optional metadata",
    route: `/p/${FIXTURE_PROJECT_ID}/dashboard`,
    requirements: ["long-labels", "missing-optional-data"],
    responses: missingOptional()
  }),
  scenario({
    id: "large-data",
    title: "Large document, session, and graph collections",
    route: `/p/${FIXTURE_PROJECT_ID}/library/graph`,
    requirements: ["large-lists", "large-graph"],
    responses: large()
  }),
  scenario({
    id: "light-capabilities",
    title: "Explicit light theme",
    route: `/p/${FIXTURE_PROJECT_ID}/dashboard`,
    requirements: ["light-theme"],
    responses: base(),
    capabilities: { theme: "light", direction: "ltr", hover: true }
  }),
  scenario({
    id: "dark-reduced-motion",
    title: "Dark theme with reduced motion",
    route: `/p/${FIXTURE_PROJECT_ID}/library/docs`,
    requirements: ["dark-theme", "reduced-motion"],
    responses: base(),
    capabilities: { theme: "dark", direction: "ltr", reducedMotion: true }
  }),
  scenario({
    id: "forced-colors-coarse-pointer",
    title: "Forced colors without hover on a coarse pointer",
    route: `/p/${FIXTURE_PROJECT_ID}/library/graph`,
    requirements: ["forced-colors"],
    responses: base(),
    capabilities: { theme: "system", direction: "ltr", forcedColors: true, coarsePointer: true, hover: false }
  }),
  scenario({
    id: "pseudo-rtl",
    title: "Pseudo-RTL layout stress only",
    route: `/p/${FIXTURE_PROJECT_ID}/dashboard`,
    requirements: ["pseudo-rtl"],
    responses: base(),
    capabilities: { theme: "light", direction: "rtl" }
  }),
  scenario({
    id: "document-dialog",
    title: "Document editor and discard dialog",
    route: `/p/${FIXTURE_PROJECT_ID}/library/docs?doc=${fixtureDocument.id}`,
    requirements: ["dialog"],
    responses: base(),
    openSurface: "document-editor"
  }),
  scenario({
    id: "session-closeout-dialog",
    title: "Session closeout dialog",
    route: `/p/${FIXTURE_PROJECT_ID}/work/current-work`,
    requirements: ["dialog"],
    responses: base(),
    openSurface: "session-closeout"
  }),
  scenario({
    id: "destructive-dialog",
    title: "Destructive confirmation dialog",
    route: `/p/${FIXTURE_PROJECT_ID}/trash`,
    requirements: ["dialog", "destructive-action"],
    responses: {
      ...base(),
      "memory.list_trash": [fakeSuccess([])]
    },
    openSurface: "destructive-confirmation"
  }),
  scenario({
    id: "graph-detail",
    title: "Graph detail surface",
    route: `/p/${FIXTURE_PROJECT_ID}/library/graph`,
    requirements: ["graph-detail"],
    responses: base(),
    openSurface: "graph-detail"
  })
] as const satisfies readonly FrontendScenario[];

export const FRONTEND_SCENARIOS: readonly FrontendScenario[] = Object.freeze(scenarios);

export function getFrontendScenario(id: string): FrontendScenario {
  const found = FRONTEND_SCENARIOS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown frontend scenario: ${id}`);
  return found;
}

export function createScenarioTransport(id: string): FakeMemoryTransport {
  return new FakeMemoryTransport(getFrontendScenario(id).transport);
}

function scenario(options: {
  id: string;
  title: string;
  route: string;
  requirements: readonly ScenarioRequirement[];
  responses: Readonly<Partial<Record<OperationName, readonly FakeTransportStep[]>>>;
  capabilities?: ScenarioCapabilities;
  openSurface?: FrontendScenario["openSurface"];
  formState?: FrontendScenario["formState"];
  expectedRecovery?: FrontendScenario["expectedRecovery"];
}): FrontendScenario {
  const capabilities: ScenarioCapabilities = options.capabilities ?? { theme: "system", direction: "ltr" };
  return Object.freeze({
    id: options.id,
    title: options.title,
    route: options.route,
    requirements: Object.freeze([...options.requirements]),
    transport: Object.freeze({ projectId: FIXTURE_PROJECT_ID, responses: Object.freeze(options.responses) }),
    capabilities: Object.freeze(capabilities),
    openSurface: options.openSurface,
    formState: options.formState,
    expectedRecovery: options.expectedRecovery ?? "none"
  });
}

function successPlan(results: Readonly<Partial<Record<OperationName, unknown>>>):
Readonly<Partial<Record<OperationName, readonly FakeTransportStep[]>>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(results).map(([name, result]) => [name, Object.freeze([fakeSuccess(result)])])
  ) as Partial<Record<OperationName, readonly FakeTransportStep[]>>);
}
