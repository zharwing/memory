# Semantic Graph Analysis

Semantic graph analysis is the optional AI-assisted relationship layer for the
Graph page. It does not replace the normal graph. The normal graph remains
available without any model.

## Product Model

The Graph page is the trusted project map. It shows saved relationships only:

- deterministic relationships from project metadata, imported paths, graph
  rules, docs, topics, related files, and repo links
- accepted or auto-accepted semantic relationships

Pending AI relationship suggestions are not drawn on the main graph. They live
in Memory Inbox until accepted. After acceptance, those relationships become
trusted graph links and appear in Graph.

Each project has only one current pending AI relationship proposal. Running the
relationship review again replaces older pending AI relationship batches instead
of stacking duplicate approvals in Inbox.

Sessions are not shown as normal graph nodes by default. A session is activity
history and provenance, not durable project structure. Closed sessions should
receive searchable TLDR metadata, and durable docs/relationships should carry
the long-lived project knowledge.

The URL keeps the active project, library section, and focus, for example:

```text
/p/<project-id>/library/graph?focus=package%3Amy-package
```

## Recommended Flow

1. Import or create project docs.
2. Add Graph Rules if imported paths should become service, package, topic, or
   diagram-group hubs.
3. Open Graph and confirm the saved map is useful.
4. Open Assistant and configure an OpenAI-compatible provider, such as
   llama.cpp, Ollama, LM Studio, or another local endpoint.
5. Open Graph Details.
6. In **AI relationship review**, choose the scope and click **Run review**.
7. Review the generated proposal in Inbox.
8. Accept the useful relationships.
9. Return to Graph to see accepted relationships as trusted links.

Provider overrides, dry-run mode, auto mode, document/candidate limits,
timeouts, output-token limits, and provider JSON mode are available under
**Advanced**.

## Should LM Studio Be Running?

Only start LM Studio, Ollama, llama.cpp, or another OpenAI-compatible provider
when you are testing model-backed behavior:

- provider checks
- dry-run semantic analysis
- review-mode semantic analysis
- auto semantic analysis

Do not start a model for Graph or semantic graph preview. Preview
builds the document extraction and candidate plan without calling a model.

If using LM Studio, load a model, start its local OpenAI-compatible server, and
copy the endpoint and model name into **Settings -> Assistant** or pass them to
the semantic graph CLI/RPC calls. See [Testing With AI Providers](AI_TESTING.md)
for the full smoke test.

## Local Small-LLM Strategy

Small local models should not receive hundreds of full documents in one prompt.
AI Memory breaks the task into smaller steps:

- select eligible documents by scope
- apply privacy and secret gates first
- split large documents into bounded Markdown/line-aware chunks
- extract compact facts per chunk
- merge chunk facts into one document-level extraction
- cache merged extractions by content hash
- build a deterministic candidate list
- ask the model to judge one candidate relationship at a time
- require confidence, reason, and evidence
- route reviewable edges through Inbox instead of silently mutating the graph

Chunk metadata keeps the chunk id, heading path, and line range so evidence can
point back to the source area. Use a focused node, changed-docs scope, and low
document/candidate limits when testing a 12 GB VRAM local model. Increase limits
only after the model returns stable JSON and useful evidence.

## Relationship Quality

Semantic graph quality depends on the candidate list as much as the model. The
candidate builder prioritizes richer relationship targets, such as docs,
services, packages, and code areas, before metadata-only targets such as files
and topics. When richer candidates exist, file/topic candidates are capped so
they do not crowd out actual conceptual relationships.

Review-mode proposals should usually contain:

- direct document-to-document or document-to-service/package/code relationships
- file/topic edges only when they add useful evidence
- no duplicate inverse `related` pairs for the same two documents
- relationship types and directions that match the evidence

Do not accept noisy proposals just because they are high confidence. If the
proposal is mostly metadata links, narrow the scope, improve document titles,
topics, and related files, then rerun dry-run or review mode.

## Standalone Chunking

llm-memory owns a built-in chunked extraction pipeline so semantic graph remains
usable as a standalone open-source project:

```text
large document
-> privacy gate and redaction
-> Markdown/line-aware chunks
-> model extracts compact facts per chunk
-> llm-memory merges chunk facts into one document extraction
-> deterministic candidate builder
-> model judges candidate relationships
-> Inbox proposal or durable semantic edge
```

The chunking path does not require a vector database or another companion
service. It is intentionally simple: split by Markdown structure and line
budget, keep source locations, merge duplicate entities/hints, and cache the
document-level result.

## Companion Context Adapter

`small-contwxt-manager` can be integrated later as an optional evidence provider,
but it should not be required for semantic graph. The clean boundary is:

```text
llm-memory owns project memory, graph schema, review workflow, and accepted edges
small-contwxt-manager optionally supplies budgeted evidence packs
```

An adapter can ask `small-contwxt-manager` for evidence around a document,
candidate target, or relationship query. llm-memory would still judge the
relationship, write Inbox proposals, and store accepted/rejected edges. This
proves the companion services work together without making standalone
llm-memory depend on another local service.

## Vector Store Decision

AI Memory does not require a vector store for semantic graph relationships.
The default candidate builder intentionally uses deterministic project signals
first:

- document topics
- workstreams
- related files
- imported paths
- graph rules
- repo/package/service names
- extracted mentions and entities
- existing deterministic graph links

This keeps relationship analysis explainable, cheap to run locally, and easier
to review. The LLM judges likely relationships; it is not asked to compare the
entire document corpus at once.

A vector store can be added later as an optional candidate source, but it should
not be part of the default workflow. It is useful only when deterministic
signals are not enough, for example:

- imported docs have poor or missing metadata
- related docs use different names for the same concept
- users have very large, messy corpora
- the graph misses obvious conceptual relationships after graph rules and
  extraction are tuned
- the product needs a separate "find similar docs" feature

For normal project memory, deterministic candidates plus LLM judging are the
preferred approach. Vector search would add storage, dependency, privacy, and
rebuild complexity without clear value for small and medium project-memory
sets.

## Local OpenAI-Compatible Example

Start an OpenAI-compatible server separately. This can be LM Studio, Ollama,
llama.cpp, or another local endpoint. The exact model and command depend on
your local install. AI Memory only needs the HTTP endpoint and model name.

In Assistant:

```text
Runtime: Custom OpenAI-compatible
Endpoint: <local-openai-compatible-endpoint>
Model: <local-model-name>
```

Then use **Test provider**. If the provider responds with valid JSON, Graph can
use it for semantic analysis. In Graph Details, **Run review** creates an Inbox
proposal instead of immediately trusting every relationship. Dry-run and tuning
controls are under **Advanced**.

## Review And Approval

Semantic edges are not trusted just because a model produced them.

Each edge must include:

- source node
- target node
- relationship type
- confidence
- reason
- evidence quote

In Inbox:

- **Accept All Edges** accepts the whole semantic proposal.
- **Accept High Confidence** accepts only high-confidence edges.
- **Accept Review+** accepts high and review-confidence edges.
- **Accept link** accepts one suggested relationship.
- **Remove link** drops one suggested relationship from the current approval.
- **Regenerate review** reruns the AI relationship review and replaces the
  current pending approval.
- **Reject all** rejects the proposal.

New review-mode proposals include a provider-generated reviewer summary stored
with the proposal. The UI displays that summary directly. It does not synthesize
AI reasoning in the browser. Proposals created before this summary field existed
show that no AI summary is available and should be rerun if a real summary is
needed.

When only some edges are accepted, the proposal remains edited with the
remaining edges.

## Session TLDRs

Sessions are summarized separately from graph relationships. On close, AI Memory
generates a compact searchable TLDR for the session when a local assistant
provider is configured. If no safe local provider is available, it writes a
deterministic metadata summary instead. The summary is stored on the session
frontmatter/body, not as a graph node.

Session TLDR metadata includes:

- `summary`
- `topics`
- `summary_generated_at`
- `summary_source`
- `summary_model`

The Sessions UI can:

- generate or refresh one selected session TLDR
- summarize only sessions missing generated TLDR metadata
- regenerate all session TLDRs from the Advanced control

CLI equivalents:

```text
corepack pnpm dev:cli assistant generate-session-summary --project <project-id> --session <session-id>
corepack pnpm dev:cli assistant generate-session-summaries --project <project-id>
corepack pnpm dev:cli assistant generate-session-summaries --project <project-id> --all
```

## Storage

AI Memory keeps Markdown documents as the source of truth for human-authored
knowledge. Semantic graph data is stored as project metadata beside that
Markdown because it is structured relationship data.

Durable accepted/rejected semantic edges:

```text
<memory-root>/projects/<project>/semantic-graph/edges.json
```

Project semantic graph settings:

```text
<memory-root>/projects/<project>/semantic-graph/settings.json
```

Generated run records and caches:

```text
<memory-root>/projects/<project>/generated/semantic/runs/
<memory-root>/projects/<project>/generated/semantic/doc-extractions/
<memory-root>/projects/<project>/generated/semantic/candidate-index.json
```

Inbox proposals:

```text
<memory-root>/projects/<project>/inbox/proposed-updates/
```

Generated extraction and candidate files can be rebuilt. Accepted semantic
edges should be treated as durable project metadata because they represent
reviewed user decisions.

## CLI

The CLI exposes the same semantic graph operations:

```bash
corepack pnpm dev:cli semantic-graph status --project <project-id>
corepack pnpm dev:cli semantic-graph analyze --project <project-id> --mode dry-run --max-docs 8
corepack pnpm dev:cli semantic-graph analyze --project <project-id> --mode review --max-docs 8
corepack pnpm dev:cli semantic-graph analyze --project <project-id> --mode dry-run --no-json-mode
corepack pnpm dev:cli semantic-graph runs --project <project-id>
corepack pnpm dev:cli semantic-graph edges --project <project-id>
```

Use the Graph context map without a provider for saved metadata relationships.
Semantic analysis is an advanced layer for users who want model-assisted
relationship cleanup; suggestions stay in Inbox until accepted.
