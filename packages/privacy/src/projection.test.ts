import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_PRIVACY_POLICY,
  markPrincipalAuthenticated,
  type AuthenticatedPrincipal,
  type PrincipalAudience,
  type Visibility
} from "@zharwing/memory-core";
import { projectStructuredResult, type PrivacyProjectionContext } from "./projection.js";

const PROJECT_A = "project-a";

function principal(
  audience: PrincipalAudience,
  projectId: string | null = PROJECT_A,
  operation = "memory.search"
): AuthenticatedPrincipal {
  return markPrincipalAuthenticated({
    principalId: `${audience}-principal`,
    sessionId: `${audience}-session`,
    sessionOwner: "synthetic-test",
    audience,
    operations: [operation],
    projectId,
    issuedAt: "2026-08-12T10:00:00.000Z",
    expiresAt: "2026-08-12T11:00:00.000Z",
    authorityEpoch: 3,
    policyDigest: "sha256:synthetic-policy",
    rotationId: "rotation-1",
    revocationId: "revocation-1"
  });
}

function hardened(audience: PrincipalAudience, operation = "memory.search"): PrivacyProjectionContext {
  return {
    principal: principal(audience, PROJECT_A, operation),
    projectId: PROJECT_A,
    surface: audience,
    policy: DEFAULT_PRIVACY_POLICY,
    profile: "hardened-local",
    operation
  };
}

function entity(visibility?: Visibility, overrides: Record<string, unknown> = {}) {
  return {
    id: `entity-${visibility ?? "missing"}`,
    projectId: PROJECT_A,
    type: "document",
    title: "Synthetic record",
    content: "safe content",
    ...(visibility === undefined ? {} : { visibility }),
    ...overrides
  };
}

test("agent and provider visibility matrices are default-deny", () => {
  const matrix: Array<[Visibility | undefined, boolean]> = [
    ["ai-eligible", true],
    ["ai-pinned", true],
    ["review-required", false],
    ["human-only", false],
    ["private", false],
    ["never-send", false],
    [undefined, false]
  ];

  for (const audience of ["agent", "provider"] as const) {
    for (const [visibility, expected] of matrix) {
      const result = projectStructuredResult([entity(visibility)], hardened(audience));
      assert.equal(result.allowed, true, `${audience}/${visibility ?? "missing"}`);
      assert.equal((result.data as unknown[]).length === 1, expected, `${audience}/${visibility ?? "missing"}`);
    }
  }
});

test("personal preview missing visibility requires an explicit compatibility value", () => {
  const result = projectStructuredResult([entity()], {
    principal: principal("agent"),
    projectId: PROJECT_A,
    surface: "agent",
    policy: DEFAULT_PRIVACY_POLICY,
    profile: "personal-preview",
    legacyMissingVisibility: "ai-eligible"
  });
  assert.equal((result.data as unknown[]).length, 1);
  assert.equal(result.completeness.status, "complete");
});

test("principal, surface, and nested entity project bindings are exact", () => {
  const wrongSurface = projectStructuredResult([], {
    ...hardened("agent"),
    surface: "provider"
  });
  assert.equal(wrongSurface.allowed, false);
  assert.deepEqual(wrongSurface.exclusions, [{ reason: "audience-mismatch", count: 1 }]);

  const wrongOperation = projectStructuredResult([], {
    ...hardened("agent"),
    operation: "memory.list_docs"
  });
  assert.equal(wrongOperation.allowed, false);
  assert.deepEqual(wrongOperation.exclusions, [{ reason: "operation-not-authorized", count: 1 }]);

  const wrongPrincipalProject = projectStructuredResult([], {
    ...hardened("agent"),
    principal: principal("agent", "project-b")
  });
  assert.equal(wrongPrincipalProject.allowed, false);

  const mixed = projectStructuredResult([
    entity("ai-eligible"),
    entity("ai-eligible", { id: "cross-project", projectId: "project-b" })
  ], hardened("agent"));
  assert.equal((mixed.data as unknown[]).length, 1);
  assert.equal(mixed.completeness.status, "partial");
  assert.ok(mixed.exclusions.some((entry) => entry.reason === "wrong-project"));
});

test("recursive canaries are dropped or redacted without leaking through audit metadata", () => {
  const highRiskCanary = "api_key=synthetic-canary-value";
  const mediumRiskCanary = "operator:syntheticpass@example.com";
  const result = projectStructuredResult([
    entity("ai-eligible", {
      id: "high-risk",
      title: "do-not-leak-title",
      sourcePath: "docs/high-risk.md",
      content: highRiskCanary
    }),
    entity("ai-eligible", {
      id: "medium-risk",
      sourcePath: "docs/medium.md",
      content: mediumRiskCanary,
      nested: { note: mediumRiskCanary }
    }),
    entity("ai-eligible", {
      id: "never-send-path",
      title: "do-not-leak-private-title",
      sourcePath: "private/synthetic.md"
    })
  ], {
    ...hardened("agent"),
    policy: {
      ...DEFAULT_PRIVACY_POLICY,
      neverSendPatterns: ["private/**"]
    }
  });

  const serializedData = JSON.stringify(result.data);
  const serializedAudit = JSON.stringify({ exclusions: result.exclusions, redactions: result.redactions });
  assert.equal(serializedData.includes(highRiskCanary), false);
  assert.equal(serializedData.includes(mediumRiskCanary), false);
  assert.equal(serializedData.includes("sourcePath"), false);
  assert.match(serializedData, /\[REDACTED_BASIC_AUTH_URL\]/);
  assert.equal(serializedAudit.includes("do-not-leak"), false);
  assert.equal(serializedAudit.includes("private\/synthetic"), false);
  assert.equal(result.completeness.status, "partial");
  assert.deepEqual(result.exclusions, [
    { reason: "secret-detected", count: 1 },
    { reason: "field-withheld", count: 1 },
    { reason: "never-send-pattern", count: 1 }
  ]);
});

test("modern provider, bearer, JWT, Slack, GitLab, and Google canaries fail closed", () => {
  const canaries = [
    `sk-proj-${"a".repeat(30)}`,
    `sk-ant-${"b".repeat(30)}`,
    `Bearer ${"c".repeat(32)}`,
    `eyJ${"d".repeat(12)}.${"e".repeat(12)}.${"f".repeat(12)}`,
    `xoxb-${"g".repeat(30)}`,
    `glpat-${"h".repeat(30)}`,
    `AIza${"I".repeat(32)}`
  ];
  for (const canary of canaries) {
    const result = projectStructuredResult(entity("ai-eligible", { content: canary }), hardened("agent"));
    assert.equal(result.allowed, false, canary.slice(0, 12));
    assert.doesNotMatch(JSON.stringify(result), new RegExp(canary.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("withheld path and derived fields make completeness partial", () => {
  const result = projectStructuredResult({
    projectId: PROJECT_A,
    memoryRoot: "D:/sensitive/root",
    workingDirectory: "D:/sensitive/work",
    counts: { privateSessions: 9 }
  }, hardened("agent", "memory.get_startup_state"));
  assert.equal(result.allowed, true);
  assert.equal(result.completeness.status, "partial");
  const visible = projectStructuredResult({
    projectId: PROJECT_A,
    items: [entity("ai-eligible", {
      memoryRoot: "D:/sensitive/root",
      workingDirectory: "D:/sensitive/work"
    })],
    counts: { privateSessions: 9 }
  }, hardened("agent", "memory.get_startup_state"));
  assert.equal(visible.completeness.status, "partial");
  assert.ok(visible.exclusions.some((entry) => entry.reason === "field-withheld" && entry.count >= 3));
});

test("nested visibility and deterministic budgets cannot become authoritative empty", () => {
  const result = projectStructuredResult({
    projectId: PROJECT_A,
    records: [
      entity("ai-eligible", {
        checkpoints: [
          {
            id: "checkpoint-missing",
            created: "2026-08-12T10:10:00.000Z",
            summary: "legacy checkpoint",
            nextSteps: [],
            blockers: [],
            touchedFiles: []
          }
        ]
      }),
      entity("ai-eligible", { id: "over-budget" })
    ]
  }, {
    ...hardened("agent"),
    limits: { maxItems: 2, maxBytes: 10_000, maxDepth: 16 }
  });

  assert.equal(result.allowed, true);
  assert.equal(result.completeness.status, "partial");
  assert.ok(result.exclusions.some((entry) => entry.reason === "missing-visibility"));
});

test("context-like sections without persisted visibility are excluded in hardened mode", () => {
  const result = projectStructuredResult({
    schema: "synthetic.bundle",
    projectId: PROJECT_A,
    sections: [{
      id: "section-without-visibility",
      type: "document",
      title: "Legacy section",
      content: "MISSING_VISIBILITY_CANARY"
    }]
  }, hardened("agent"));

  assert.equal(result.allowed, true);
  assert.deepEqual((result.data as { sections: unknown[] }).sections, []);
  assert.equal(JSON.stringify(result.data).includes("MISSING_VISIBILITY_CANARY"), false);
  assert.ok(result.exclusions.some((entry) => entry.reason === "missing-visibility"));
});

test("legacy startup summaries and repo roots cannot bypass hardened classification", () => {
  const result = projectStructuredResult({
    schema: "zharwing.memory.startup.v2",
    projectStatus: "resolved",
    repoRoot: "D:/PRIVATE_STARTUP_ROOT",
    project: { id: PROJECT_A, name: "PRIVATE_PROJECT_NAME", repoCount: 1, repos: [] },
    workstreams: [{ id: "ws-1", name: "PRIVATE_WORKSTREAM_NAME", slug: "private", status: "active" }],
    recentSessions: [],
    counts: { sessionsTotal: 8, recentSessionsReturned: 0, workstreamsTotal: 1, workstreamsReturned: 1 },
    recommendedAction: "resume-active",
    contextReadiness: "ready",
    safetyStatus: "clean",
    messageForClient: "PRIVATE_PROJECT_NAME is ready"
  }, hardened("agent", "memory.get_startup_state"));

  const serialized = JSON.stringify(result.data);
  assert.doesNotMatch(serialized, /PRIVATE_STARTUP_ROOT|PRIVATE_PROJECT_NAME|PRIVATE_WORKSTREAM_NAME/);
  assert.equal(result.completeness.status, "partial");
  assert.ok(result.exclusions.some((entry) => entry.reason === "missing-visibility"));
});
