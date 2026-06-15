#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { AimemClient } from "@aimem/api-client";
import { flagBool, flagString, parseArgs } from "./args.js";
import { printHelp, printJson, printTable } from "./format.js";

const args = parseArgs(process.argv.slice(2));
const client = new AimemClient();

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
    default:
      printHelp();
      process.exitCode = 1;
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

async function init(): Promise<void> {
  const workingDirectory = args.positional[0] ? path.resolve(args.positional[0]) : process.cwd();
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
  const taskTitle = args.positional.join(" ");
  if (!taskTitle) throw new Error("Missing task title.");
  const session = await client.call("memory.start_session", {
    projectId: requireProjectId(),
    taskTitle,
    workingDirectory: process.cwd(),
    branch: flagString(args.flags, "branch"),
    agent: flagString(args.flags, "agent") || "manual",
    client: "aimem-cli",
    goal: flagString(args.flags, "goal")
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
    requestedBy: "aimem-cli"
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
    nextSteps: listFlag("next")
  });
  printJson(result);
}

async function importDoc(): Promise<void> {
  const source = args.positional[0];
  if (!source) throw new Error("Missing file to import.");
  const body = await fs.readFile(source, "utf8");
  const result = await client.call("memory.create_doc", {
    projectId: requireProjectId(),
    title: flagString(args.flags, "title") || path.basename(source, path.extname(source)),
    type: flagString(args.flags, "type") || "scratch-note",
    body,
    visibility: flagString(args.flags, "visibility") || "ai-eligible"
  });
  printJson(result);
}

function requireProjectId(): string {
  const projectId = flagString(args.flags, "project");
  if (!projectId) throw new Error("Missing --project <id>.");
  return projectId;
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

function bootstrapFiles(): string[] {
  const value = flagString(args.flags, "bootstrap");
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}
