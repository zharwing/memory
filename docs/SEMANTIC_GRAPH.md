# Semantic Graph Analysis

Semantic graph analysis is the optional AI-assisted relationship layer for the
Graph page. It does not replace the normal graph. The normal graph remains
available without any model.

## Modes

The Graph page has three relationship modes:

- **Basic**
  Uses deterministic project metadata, imported paths, graph rules, sessions,
  docs, topics, related files, and repo links. This is the default and works
  without an LLM.

- **AI reviewed**
  Shows Basic links plus semantic relationships that were accepted by a user or
  auto-accepted by an enabled local/approved provider.

- **AI review**
  Shows Basic links plus accepted semantic links and pending semantic proposals
  from the Memory Inbox. Use this mode to inspect proposed links before
  accepting them.

The URL keeps the active mode and focus, for example:

```text
/graph?focus=package%3Amy-package&relationships=ai-review
```

## Recommended Flow

1. Import or create project docs.
2. Add Graph Rules if imported paths should become service, package, topic, or
   diagram-group hubs.
3. Open Graph in **Basic** mode and confirm the deterministic map is useful.
4. Open Assistant and configure an OpenAI-compatible provider, such as
   llama.cpp, Ollama, LM Studio, or another local endpoint.
5. Open Graph Details.
6. Run **Preview** first. Preview builds the extraction and candidate plan
   without calling the model.
7. Run **Dry run** on a focused node or a small project slice.
8. Run **Review** when the dry-run shape looks reasonable.
9. Open **AI review** mode and inspect proposed edges in Graph Details.
10. Accept individual edges from Graph Details or review the full proposal in
    Inbox.
11. Switch to **AI reviewed** mode to see only accepted AI relationships.

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

## llama.cpp Example

Start a llama.cpp OpenAI-compatible server separately. The exact model and
command depend on your local install. AI Memory only needs the HTTP endpoint.

In Assistant:

```text
Runtime: Custom OpenAI-compatible
Endpoint: http://127.0.0.1:8080/v1
Model: <your-local-model-name>
```

Then use **Test provider**. If the provider responds with valid JSON, Graph can
use it for semantic analysis.

For first runs in Graph Details:

```text
Mode: Dry run
Scope: Focused node
Max docs: 8
Max candidates: 24
Per doc: 8
```

If the result is useful, switch to:

```text
Mode: Review
```

Review mode creates an Inbox proposal instead of immediately trusting every
relationship.

## Review And Approval

Semantic edges are not trusted just because a model produced them.

Each edge must include:

- source node
- target node
- relationship type
- confidence
- reason
- evidence quote

In Graph Details:

- **Accept Edge** accepts one selected proposed relationship.
- **Hide Edge** marks an accepted durable relationship as rejected.
- **Open Inbox** opens the full proposal for grouped review.

In Inbox:

- **Accept All Edges** accepts the whole semantic proposal.
- **Accept High Confidence** accepts only high-confidence edges.
- **Accept Review+** accepts high and review-confidence edges.
- **Reject** rejects the proposal.

When only some edges are accepted, the proposal remains edited with the
remaining edges.

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
corepack pnpm dev:cli semantic-graph runs --project <project-id>
corepack pnpm dev:cli semantic-graph edges --project <project-id>
```

Use Basic graph mode when no provider is configured. Semantic analysis is an
advanced layer for users who want model-assisted relationship cleanup.
