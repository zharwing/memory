import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test, type TestContext } from "node:test";
import { MemoryService } from "../memory-service.js";

test("semantic graph analysis uses an OpenAI-compatible provider and writes review proposals", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const provider = installFakeOpenAiProvider(t);
  const service = new MemoryService({ memoryRoot });
  const preview = await service.prepareProjectCreation({
    projectName: "Semantic Provider",
    createPointerFile: false
  });
  const project = await service.createProject({ preview });

  await service.createDocument({
    projectId: project.id,
    title: "Billing Overview",
    type: "architecture-note",
    visibility: "ai-eligible",
    topics: ["billing"],
    relatedFiles: ["services/billing.ts"],
    body: "Billing Service owns invoices and refers to services/billing.ts."
  });
  await service.createDocument({
    projectId: project.id,
    title: "Billing Runtime",
    type: "technical-spec",
    visibility: "ai-eligible",
    topics: ["billing"],
    relatedFiles: ["services/billing.ts"],
    body: "Runtime details for services/billing.ts and invoice processing."
  });

  const check = await service.checkSemanticGraphProvider({
    projectId: project.id,
    endpoint: provider.endpoint,
    model: "fake-semantic-model",
    timeoutMs: 5000,
    maxOutputTokens: 128
  });
  assert.equal(check.ok, true);
  assert.equal(check.model, "fake-semantic-model");

  const result = await service.analyzeSemanticGraph({
    projectId: project.id,
    endpoint: provider.endpoint,
    model: "fake-semantic-model",
    mode: "review",
    maxDocuments: 2,
    maxCandidates: 4,
    maxCandidatesPerDocument: 4,
    timeoutMs: 5000,
    maxOutputTokens: 256
  });

  assert.equal(result.run.status, "completed");
  assert.equal(result.run.mode, "review");
  assert.ok(result.run.counts.documentsAnalyzed >= 1);
  assert.ok(result.run.counts.judged >= 1);
  assert.ok(result.proposedEdges.length >= 1);
  assert.equal(result.acceptedEdges.length, 0);
  assert.equal(provider.calls.some((call) => call.kind === "provider-check"), true);
  assert.equal(provider.calls.some((call) => call.kind === "extraction"), true);
  assert.equal(provider.calls.some((call) => call.kind === "judgement"), true);
  assert.equal(provider.calls.some((call) => call.kind === "summary"), true);

  const inbox = await service.listInbox({ projectId: project.id });
  const semanticProposal = inbox.find((item) => item.type === "graph-update" && item.proposedPatch.includes("semantic-graph-edges"));
  assert.ok(semanticProposal);
  assert.match(semanticProposal.proposedPatch, /Provider evidence links the relationship/);
  assert.match(semanticProposal.proposedPatch, /The provider summary says these billing documents belong together/);
});

test("semantic graph proposals deduplicate inverse related docs and cap metadata edges", async (t) => {
  const memoryRoot = await tempMemoryRoot(t);
  const service = new MemoryService({ memoryRoot });
  const preview = await service.prepareProjectCreation({
    projectName: "Semantic Proposal Quality",
    createPointerFile: false
  });
  const project = await service.createProject({ preview });

  const proposal = await service.proposeSemanticEdges({
    projectId: project.id,
    runId: "run-quality",
    sourceAgent: "quality-test",
    edges: [
      semanticEdgeInput("doc:overview", "doc:runtime", "related", 0.72),
      semanticEdgeInput("doc:runtime", "doc:overview", "related", 0.91),
      semanticEdgeInput("doc:overview", "file:services/billing.ts", "supports", 0.95),
      semanticEdgeInput("doc:overview", "topic:billing", "mentions", 0.95),
      semanticEdgeInput("doc:runtime", "topic:billing", "mentions", 0.95)
    ]
  });
  const patch = JSON.parse(proposal.proposedPatch) as {
    edges: Array<{ from: string; to: string; type: string; confidence: number }>;
  };

  assert.equal(patch.edges.length, 3);
  assert.equal(patch.edges.filter((edge) => edge.type === "related").length, 1);
  assert.equal(patch.edges.find((edge) => edge.type === "related")?.confidence, 0.91);
  assert.equal(patch.edges.filter((edge) => edge.from === "doc:overview" && (edge.to.startsWith("file:") || edge.to.startsWith("topic:"))).length, 1);
});

function installFakeOpenAiProvider(t: TestContext): {
  endpoint: string;
  calls: Array<{ kind: FakeProviderCallKind; content: string }>;
} {
  const calls: Array<{ kind: FakeProviderCallKind; content: string }> = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (_input, init) => {
    const raw = String(init?.body || "{}");
    const payload = JSON.parse(raw) as {
      messages?: Array<{ role: string; content: string }>;
      model?: string;
    };
    const content = payload.messages?.map((message) => message.content).join("\n") || "";
    const kind = content.includes('Return {"ok":true')
      ? "provider-check"
      : content.includes("reviewer-facing summary")
        ? "summary"
      : content.includes("Allowed relationship values")
        ? "judgement"
        : "extraction";
    calls.push({ kind, content });

    const responseContent = JSON.stringify(responseFor(kind));
    return new Response(JSON.stringify({
      model: payload.model || "fake-semantic-model",
      choices: [{ message: { content: responseContent } }]
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }) as typeof fetch;

  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  return {
    endpoint: "http://127.0.0.1:11434/v1",
    calls
  };
}

type FakeProviderCallKind = "provider-check" | "extraction" | "judgement" | "summary";

function responseFor(kind: FakeProviderCallKind) {
  if (kind === "provider-check") {
    return {
      ok: true,
      message: "ready"
    };
  }
  if (kind === "extraction") {
    return {
      summary: "Billing Service owns invoices and references services/billing.ts.",
      entities: [
        {
          name: "Billing Service",
          kind: "service",
          confidence: 0.92
        }
      ],
      concepts: ["billing", "invoices"],
      mentionedFiles: ["services/billing.ts"],
      mentionedPackages: [],
      candidateHints: []
    };
  }
  if (kind === "summary") {
    return {
      title: "Billing relationship review",
      summary: "The provider summary says these billing documents belong together because they describe invoice ownership and the same billing implementation file.",
      keyRelationships: [
        "Billing Overview and Billing Runtime should be reviewed as related billing docs.",
        "The billing docs point to services/billing.ts."
      ],
      reviewNotes: []
    };
  }
  return {
    relationship: "supports",
    confidence: 0.81,
    reason: "The source document supports the candidate through shared billing implementation evidence.",
    evidence: ["Provider evidence links the relationship to services/billing.ts."]
  };
}

function semanticEdgeInput(
  from: string,
  to: string,
  type: "supports" | "mentions" | "related",
  confidence: number
) {
  return {
    from,
    to,
    type,
    confidence,
    reason: `${from} ${type} ${to}.`,
    evidence: [`${from} ${type} ${to}.`]
  };
}

async function tempMemoryRoot(t: TestContext): Promise<string> {
  const memoryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aimem-semantic-provider-test-"));
  t.after(() => fs.rm(memoryRoot, { recursive: true, force: true }));
  return memoryRoot;
}
