#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { ZharwingMemoryClient } from "@zharwing/memory-api-client";
import { doctorMcpSetup, installMcpAuto, installMcpClient, serveMcpStdio, type McpClientTarget, type McpInstallTarget, type McpInstallTransport } from "@zharwing/memory-mcp";
import {
  defaultInstructionFile,
  normalizeAgentTarget,
  renderAgentInstructions
} from "./agent-instructions.js";
import { flagBool, flagString, parseArgs } from "./args.js";
import { printHelp, printJson, printTable } from "./format.js";

const args = parseArgs(process.argv.slice(2));
const client = new ZharwingMemoryClient();

try {
  await run();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

async function run(): Promise<void> {
  switch (args.command) {
    case "help":
    case "--help":
    case "-h":
      printHelp();
      return;
    case "projects":
      return projects();
    case "detect":
      return printJson(await client.call("memory.detect_project", { workingDirectory: args.positional[0] || process.cwd() }));
    case "status":
      return status();
    case "repos":
      return repos();
    case "link-repo":
      return linkRepo();
    case "unlink-repo":
      return unlinkRepo();
    case "workstreams":
      return workstreams();
    case "create-workstream":
      return createWorkstream();
    case "workstream":
      return workstreamDetail();
    case "init":
      return init();
    case "start":
      return start();
    case "resume":
      return printJson(await client.call("memory.get_startup_state", { projectId: requireProjectId() }));
    case "sessions":
      return sessions();
    case "context":
      return context();
    case "checkpoint":
      return checkpoint();
    case "close":
      return close();
    case "search":
      return printJson(await client.call("memory.search", { projectId: requireProjectId(), query: args.positional.join(" ") }));
    case "inbox":
      return printJson(await client.call("memory.list_inbox", { projectId: requireProjectId() }));
    case "graph":
      return printJson(await client.call("memory.get_graph", { projectId: requireProjectId() }));
    case "semantic-graph":
      return semanticGraph();
    case "backup":
      return printJson(await client.call("memory.backup_project", { projectId: requireProjectId() }));
    case "validate":
      return printJson(await client.call("memory.validate_project", { projectId: requireProjectId() }));
    case "rebuild-index":
      return printJson(await client.call("memory.rebuild_index", { projectId: requireProjectId() }));
    case "assistant":
      return assistant();
    case "import":
      return importDoc();
    case "import-profiles":
      return printJson(await client.call("memory.list_import_profiles"));
    case "import-folder":
      return importFolder();
    case "import-commit":
      return importCommit();
    case "agent-instructions":
    case "generate-agent-instructions":
      return agentInstructions();
    case "mcp":
      return mcp();
    default:
      printHelp();
      process.exitCode = 1;
  }
}

async function mcp(): Promise<void> {
  const subcommand = args.positional[0] || "doctor";
  switch (subcommand) {
    case "serve":
      serveMcpStdio();
      return;
    case "doctor":
      return printJson(await doctorMcpSetup({
        daemonUrl: flagString(args.flags, "daemon-url"),
        workingDirectory: process.cwd()
      }));
    case "install": {
      const target = normalizeMcpInstallTarget(args.positional[1]);
      const transport = normalizeMcpTransport(flagString(args.flags, "transport") || "http");
      if (target === "auto") {
        if (flagString(args.flags, "config")) throw new Error("--config cannot be used with `mcp install auto`; use a specific client target.");
        return printJson(await installMcpAuto({
          transport,
          daemonUrl: flagString(args.flags, "daemon-url"),
          authMode: normalizeMcpAuthMode(flagString(args.flags, "auth") || "auto"),
          serverName: flagString(args.flags, "name") || "zharwing-memory",
          workingDirectory: process.cwd(),
          dryRun: flagBool(args.flags, "dry-run")
        }));
      }
      return printJson(await installMcpClient({
        client: target,
        transport,
        configPath: flagString(args.flags, "config"),
        daemonUrl: flagString(args.flags, "daemon-url"),
        authMode: normalizeMcpAuthMode(flagString(args.flags, "auth") || "auto"),
        serverName: flagString(args.flags, "name") || "zharwing-memory",
        workingDirectory: process.cwd(),
        dryRun: flagBool(args.flags, "dry-run")
      }));
    }
    default:
      throw new Error(`Unknown mcp command: ${subcommand}`);
  }
}

async function assistant(): Promise<void> {
  const subcommand = args.positional[0] || "status";
  switch (subcommand) {
    case "status":
      return printJson(await client.call("memory.assistant_status", { projectId: requireProjectId() }));
    case "summarize-session":
      return printJson(await client.call("memory.summarize_session", {
        projectId: requireProjectId(),
        sessionId: requireSessionId()
      }));
    case "generate-session-summary":
      return printJson(await client.call("memory.generate_session_summary", {
        projectId: requireProjectId(),
        sessionId: requireSessionId(),
        force: !flagBool(args.flags, "skip-existing"),
        ...assistantProviderParams()
      }));
    case "generate-session-summaries":
      return printJson(await client.call("memory.generate_session_summaries", {
        projectId: requireProjectId(),
        mode: flagBool(args.flags, "all") ? "all" : "missing",
        limit: numericFlag("limit"),
        ...assistantProviderParams()
      }));
    case "return-summary":
      return printJson(await client.call("memory.prepare_return_summary", { projectId: requireProjectId() }));
    case "classify-doc":
      return printJson(await client.call("memory.classify_imported_doc", {
        projectId: requireProjectId(),
        documentId: requireDocId()
      }));
    default:
      throw new Error(`Unknown assistant command: ${subcommand}`);
  }
}

async function semanticGraph(): Promise<void> {
  const subcommand = args.positional[0] || "status";
  switch (subcommand) {
    case "status":
      return semanticGraphStatus();
    case "analyze":
      return semanticGraphAnalyze();
    case "runs":
      return semanticGraphRuns();
    case "edges":
      return semanticGraphEdges();
    default:
      throw new Error(`Unknown semantic-graph command: ${subcommand}`);
  }
}

async function semanticGraphStatus(): Promise<void> {
  const projectId = requireProjectId();
  const [settings, status] = await Promise.all([
    client.call("memory.get_semantic_graph_settings", { projectId }) as Promise<Record<string, unknown>>,
    client.call("memory.get_semantic_graph_status", { projectId }) as Promise<Record<string, any>>
  ]);
  if (flagBool(args.flags, "json")) return printJson({ settings, status });

  const edgeCounts = status.edgeCounts || {};
  const runCounts = status.runCounts || {};
  const latest = runCounts.latest || {};
  printTable([
    {
      enabled: settings.enabled ? "yes" : "no",
      mode: settings.mode || "review",
      accepted: Number(edgeCounts.accepted || 0) + Number(edgeCounts["auto-accepted"] || 0),
      proposed: edgeCounts.proposed || 0,
      rejected: edgeCounts.rejected || 0,
      runs: runCounts.total || 0,
      latest: latest.started || ""
    }
  ], ["enabled", "mode", "accepted", "proposed", "rejected", "runs", "latest"]);
}

async function semanticGraphAnalyze(): Promise<void> {
  const mode = flagString(args.flags, "mode") || (flagBool(args.flags, "review") ? "review" : flagBool(args.flags, "auto") ? "auto" : "dry-run");
  const result = await client.call("memory.analyze_semantic_graph", {
    projectId: requireProjectId(),
    scope: semanticGraphScope(),
    mode,
    dryRun: mode === "dry-run" || flagBool(args.flags, "dry-run"),
    endpoint: flagString(args.flags, "endpoint"),
    model: flagString(args.flags, "model"),
    apiKey: flagString(args.flags, "api-key"),
    maxDocuments: numericFlag("max-docs"),
    maxCandidates: numericFlag("max-candidates"),
    maxCandidatesPerDocument: numericFlag("per-doc"),
    timeoutMs: numericFlag("timeout-ms"),
    maxOutputTokens: numericFlag("max-output-tokens"),
    jsonMode: flagBool(args.flags, "no-json-mode") ? false : undefined
  }) as Record<string, any>;
  if (flagBool(args.flags, "json")) return printJson(result);
  printSemanticGraphRunResult(result);
}

async function semanticGraphRuns(): Promise<void> {
  const result = (await client.call("memory.list_semantic_graph_runs", {
    projectId: requireProjectId()
  })) as Array<Record<string, any>>;
  if (flagBool(args.flags, "json")) return printJson(result);
  printTable(result.map((run) => ({
    id: run.id,
    status: run.status,
    mode: run.mode,
    started: run.started,
    finished: run.finished || "",
    docs: run.counts?.documentsAnalyzed || 0,
    judged: run.counts?.judged || 0,
    accepted: run.counts?.accepted || 0,
    proposed: run.counts?.proposed || 0
  })), ["id", "status", "mode", "started", "finished", "docs", "judged", "accepted", "proposed"]);
}

async function semanticGraphEdges(): Promise<void> {
  const status = flagString(args.flags, "status");
  const result = (await client.call("memory.list_semantic_edges", {
    projectId: requireProjectId(),
    status: status ? status.split(",").map((item) => item.trim()).filter(Boolean) : undefined
  })) as Array<Record<string, any>>;
  if (flagBool(args.flags, "json")) return printJson(result);
  printTable(result.map((edge) => ({
    id: edge.id,
    status: edge.status,
    type: edge.type,
    confidence: typeof edge.confidence === "number" ? `${Math.round(edge.confidence * 100)}%` : "",
    from: compactValue(edge.from),
    to: compactValue(edge.to),
    reason: compactValue(edge.reason, 64)
  })), ["id", "status", "type", "confidence", "from", "to", "reason"]);
}

async function projects(): Promise<void> {
  const result = (await client.call("memory.list_projects")) as Array<Record<string, unknown>>;
  if (flagBool(args.flags, "json")) return printJson(result);
  printTable(
    result.map((project) => ({
      id: project.id,
      name: project.name,
      memoryRoot: project.memoryRoot
    })),
    ["id", "name", "memoryRoot"]
  );
}

async function status(): Promise<void> {
  const result = await client.call("memory.get_project_summary", { projectId: requireProjectId() });
  printJson(result);
}

async function repos(): Promise<void> {
  const result = (await client.call("memory.list_project_repos", { projectId: requireProjectId() })) as Array<Record<string, unknown>>;
  if (flagBool(args.flags, "json")) return printJson(result);
  printTable(
    result.map((repo) => ({
      role: repo.role,
      path: repo.path,
      branch: repo.defaultBranch || ""
    })),
    ["role", "path", "branch"]
  );
}

async function linkRepo(): Promise<void> {
  const repoPath = args.positional[0];
  if (!repoPath) throw new Error("Missing repo path.");
  const result = await client.call("memory.link_repo", {
    projectId: requireProjectId(),
    repoPath: resolveInputPath(repoPath),
    role: flagString(args.flags, "role") || "other",
    name: flagString(args.flags, "name"),
    description: flagString(args.flags, "description"),
    defaultBranch: flagString(args.flags, "branch"),
    writePointerFile: !flagBool(args.flags, "no-pointer")
  });
  printJson(result);
}

async function unlinkRepo(): Promise<void> {
  const repoPath = args.positional[0];
  if (!repoPath) throw new Error("Missing repo path.");
  const result = await client.call("memory.unlink_repo", {
    projectId: requireProjectId(),
    repoPath: resolveInputPath(repoPath),
    removePointerFile: !flagBool(args.flags, "keep-pointer")
  });
  printJson(result);
}

async function workstreams(): Promise<void> {
  const result = (await client.call("memory.list_workstreams", { projectId: requireProjectId() })) as Array<Record<string, unknown>>;
  if (flagBool(args.flags, "json")) return printJson(result);
  printTable(
    result.map((workstream) => ({
      id: workstream.id,
      name: workstream.name,
      status: workstream.status,
      topics: Array.isArray(workstream.topics) ? workstream.topics.join(",") : ""
    })),
    ["id", "name", "status", "topics"]
  );
}

async function createWorkstream(): Promise<void> {
  const name = args.positional.join(" ");
  if (!name) throw new Error("Missing workstream name.");
  const result = await client.call("memory.create_workstream", {
    projectId: requireProjectId(),
    name,
    summary: flagString(args.flags, "summary"),
    goal: flagString(args.flags, "goal"),
    topics: listFlag("topic"),
    repoRoles: listFlag("repo-role"),
    relatedTasks: listFlag("task"),
    relatedFiles: listFlag("file")
  });
  printJson(result);
}

async function workstreamDetail(): Promise<void> {
  const workstreamId = args.positional[0] || flagString(args.flags, "workstream");
  if (!workstreamId) throw new Error("Missing workstream id or slug.");
  return printJson(await client.call("memory.get_workstream_detail", {
    projectId: requireProjectId(),
    workstreamId
  }));
}

async function init(): Promise<void> {
  const projectOnly = flagBool(args.flags, "project-only");
  const workingDirectory = args.positional[0] ? path.resolve(args.positional[0]) : projectOnly ? undefined : process.cwd();
  const preview = await client.call("memory.prepare_project_creation", {
    workingDirectory,
    projectName: flagString(args.flags, "name"),
    createPointerFile: !flagBool(args.flags, "no-pointer"),
    bootstrapFiles: bootstrapFiles()
  });
  const project = await client.call("memory.create_project", { preview });
  printJson({ preview, project });
}

async function start(): Promise<void> {
  const taskTitle = args.positional.join(" ").trim();
  const session = await client.call("memory.start_session", {
    projectId: requireProjectId(),
    taskTitle: taskTitle || undefined,
    workingDirectory: process.cwd(),
    branch: flagString(args.flags, "branch"),
    agent: flagString(args.flags, "agent") || "manual",
    client: "zharwing-memory-cli",
    goal: flagString(args.flags, "goal"),
    workstreamIds: listFlag("workstream")
  });
  printJson(session);
}

async function sessions(): Promise<void> {
  const result = (await client.call("memory.list_project_sessions", {
    projectId: requireProjectId(),
    limit: Number(flagString(args.flags, "limit") || "20")
  })) as Array<Record<string, unknown>>;
  if (flagBool(args.flags, "json")) return printJson(result);
  printTable(
    result.map((session) => ({
      id: session.id,
      status: session.status,
      updated: session.updated,
      task: session.taskTitle
    })),
    ["id", "status", "updated", "task"]
  );
}

async function context(): Promise<void> {
  const method = flagBool(args.flags, "preview") ? "memory.preview_context_bundle" : "memory.get_context_bundle";
  const bundle = (await client.call(method, {
    projectId: requireProjectId(),
    sessionId: flagString(args.flags, "session"),
    taskText: flagString(args.flags, "task"),
    requestedBy: "zharwing-memory-cli"
  })) as { markdown: string };
  if (flagBool(args.flags, "json")) return printJson(bundle);
  process.stdout.write(`${bundle.markdown}\n`);
}

async function checkpoint(): Promise<void> {
  const summary = args.positional.join(" ");
  if (!summary) throw new Error("Missing checkpoint summary.");
  const result = await client.call("memory.save_checkpoint", {
    projectId: requireProjectId(),
    sessionId: requireSessionId(),
    summary,
    nextSteps: listFlag("next"),
    blockers: listFlag("blocker"),
    touchedFiles: listFlag("file")
  });
  printJson(result);
}

async function close(): Promise<void> {
  const result = await client.call("memory.close_session", {
    projectId: requireProjectId(),
    sessionId: requireSessionId(),
    summary: args.positional.join(" ") || undefined,
    nextSteps: listFlag("next"),
    autoSummarize: !flagBool(args.flags, "no-auto-summary")
  });
  printJson(result);
}

async function importDoc(): Promise<void> {
  const source = args.positional[0];
  if (!source) throw new Error("Missing file to import.");
  const body = await fs.readFile(resolveInputPath(source), "utf8");
  const result = await client.call("memory.create_doc", {
    projectId: requireProjectId(),
    title: flagString(args.flags, "title") || path.basename(source, path.extname(source)),
    type: flagString(args.flags, "type") || "scratch-note",
    body,
    visibility: flagString(args.flags, "visibility") || "ai-eligible"
  });
  printJson(result);
}

async function importFolder(): Promise<void> {
  const sourceRoot = args.positional[0];
  if (!sourceRoot) throw new Error("Missing folder to import.");
  const params = {
    projectId: requireProjectId(),
    sourceRoot: resolveInputPath(sourceRoot),
    profile: flagString(args.flags, "profile") || "generic-markdown",
    limit: numericFlag("limit")
  };
  if (flagBool(args.flags, "commit")) {
    return printJson(await client.call("memory.commit_import", {
      ...params,
      conflictStrategy: flagString(args.flags, "conflict") || "skip"
    }));
  }

  const plan = await client.call("memory.prepare_import", params);
  if (flagBool(args.flags, "json")) return printJson(plan);
  printImportPlan(plan as Record<string, unknown>);
}

async function importCommit(): Promise<void> {
  const planPath = flagString(args.flags, "plan");
  const plan = planPath ? JSON.parse(await fs.readFile(resolveInputPath(planPath), "utf8")) : undefined;
  const sourceRoot = args.positional[0] ? resolveInputPath(args.positional[0]) : undefined;
  if (!plan && !sourceRoot) throw new Error("Missing folder to import or --plan <file>.");

  const result = await client.call("memory.commit_import", {
    projectId: requireProjectId(),
    plan,
    sourceRoot,
    profile: flagString(args.flags, "profile") || "generic-markdown",
    conflictStrategy: flagString(args.flags, "conflict") || "skip",
    limit: numericFlag("limit")
  });
  printJson(result);
}

async function agentInstructions(): Promise<void> {
  const agent = normalizeAgentTarget(flagString(args.flags, "agent") || args.positional[0]);
  const projectId = requireProjectId();
  const [project, workstreams] = await Promise.all([
    client.call("memory.get_project", { projectId }) as Promise<Record<string, unknown>>,
    client.call("memory.list_workstreams", { projectId }) as Promise<Array<Record<string, unknown>>>
  ]);
  const markdown = renderAgentInstructions({ agent, project, workstreams });
  const output = flagString(args.flags, "output");
  const outputPath = output === "default" ? defaultInstructionFile(agent) : output;

  if (outputPath) {
    const resolved = resolveInputPath(outputPath);
    await fs.writeFile(resolved, markdown, "utf8");
    return printJson({ agent, projectId, output: resolved });
  }

  process.stdout.write(markdown);
}

function requireProjectId(): string {
  const projectId = flagString(args.flags, "project");
  if (!projectId) throw new Error("Missing --project <id>.");
  return projectId;
}

function normalizeMcpInstallTarget(value: string | undefined): McpInstallTarget {
  if (!value || value === "auto" || value === "all") return "auto";
  if (value === "codex" || value === "claude-code" || value === "claude-desktop") return value;
  throw new Error("Invalid MCP client. Use auto, codex, claude-code, or claude-desktop.");
}

function normalizeMcpTransport(value: string): McpInstallTransport {
  if (value === "http" || value === "stdio") return value;
  throw new Error("Invalid --transport. Use http or stdio.");
}

function normalizeMcpAuthMode(value: string): "none" | "token" | "auto" {
  if (value === "none" || value === "token" || value === "auto") return value;
  throw new Error("Invalid --auth. Use auto, none, or token.");
}

function requireSessionId(): string {
  const sessionId = flagString(args.flags, "session");
  if (!sessionId) throw new Error("Missing --session <id>.");
  return sessionId;
}

function requireDocId(): string {
  const docId = flagString(args.flags, "doc");
  if (!docId) throw new Error("Missing --doc <id>.");
  return docId;
}

function listFlag(name: string): string[] {
  const value = flagString(args.flags, name);
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function numericFlag(name: string): number | undefined {
  const value = flagString(args.flags, name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function assistantProviderParams(): Record<string, unknown> {
  return {
    endpoint: flagString(args.flags, "endpoint"),
    model: flagString(args.flags, "model"),
    apiKey: flagString(args.flags, "api-key"),
    timeoutMs: numericFlag("timeout-ms"),
    maxOutputTokens: numericFlag("max-output-tokens"),
    jsonMode: flagBool(args.flags, "json-mode") ? true : flagBool(args.flags, "no-json-mode") ? false : undefined
  };
}

function semanticGraphScope(): Record<string, unknown> {
  const docs = listFlag("doc");
  if (docs.length > 0) return { kind: "selected-docs", documentIds: docs };

  const nodeId = flagString(args.flags, "node") || flagString(args.flags, "focus");
  if (nodeId) return { kind: "focused-graph-node", nodeId };

  const workstreamId = flagString(args.flags, "workstream");
  if (workstreamId) return { kind: "workstream", workstreamId };

  const repoPath = flagString(args.flags, "repo");
  if (repoPath) return { kind: "repo", repoPath: resolveInputPath(repoPath) };

  if (flagBool(args.flags, "changed")) return { kind: "changed-docs" };
  return { kind: "all-docs" };
}

function printSemanticGraphRunResult(result: Record<string, any>): void {
  const run = result.run || {};
  const counts = run.counts || {};
  process.stdout.write(`Semantic graph run: ${run.id || "unknown"}\n`);
  process.stdout.write(`Status: ${run.status || "unknown"}\n`);
  process.stdout.write(`Mode: ${run.mode || "unknown"}\n`);
  process.stdout.write(`Documents: ${counts.documentsAnalyzed || 0} analyzed, ${counts.extractionsReused || 0} cached\n`);
  process.stdout.write(`Relationships: ${counts.judged || 0} judged, ${counts.accepted || 0} accepted, ${counts.proposed || 0} proposed, ${counts.discarded || 0} discarded\n`);
  if (result.proposal?.id) {
    process.stdout.write(`Proposal: ${result.proposal.id}\n`);
  }
}

function compactValue(input: unknown, maxLength = 44): string {
  const value = String(input || "");
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - 3))}...` : value;
}

function bootstrapFiles(): string[] {
  const value = flagString(args.flags, "bootstrap");
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function resolveInputPath(input: string): string {
  return path.resolve(input);
}

function printImportPlan(plan: Record<string, unknown>): void {
  const counts = plan.counts as Record<string, unknown> | undefined;
  process.stdout.write(`Import plan: ${plan.id}\n`);
  process.stdout.write(`Profile: ${plan.profileName}\n`);
  process.stdout.write(`Source: ${plan.sourceRoot}\n`);
  process.stdout.write(
    `Candidates: ${counts?.total ?? 0} total, ${counts?.documents ?? 0} documents, ${counts?.sessions ?? 0} sessions, ${counts?.skipped ?? 0} skipped, ${counts?.warnings ?? 0} warnings\n\n`
  );

  const candidates = Array.isArray(plan.candidates) ? plan.candidates : [];
  printTable(
    candidates.slice(0, 30).map((candidate) => {
      const item = candidate as Record<string, unknown>;
      return {
        kind: item.kind,
        title: item.title,
        path: item.relativePath,
        warnings: Array.isArray(item.warnings) ? item.warnings.length : 0
      };
    }),
    ["kind", "title", "path", "warnings"]
  );
  if (candidates.length > 30) {
    process.stdout.write(`\nShowing 30 of ${candidates.length} candidates. Re-run with --json for the full plan.\n`);
  }
}
