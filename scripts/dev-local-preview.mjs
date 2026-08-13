import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = process.env.ZHARWING_MEMORY_PORT?.trim() || "37841";
const daemonOnly = process.argv.includes("--daemon-only");
const webOnly = process.argv.includes("--web-only");
if (daemonOnly && webOnly) throw new Error("Choose either daemon-only or web-only local preview mode.");
const environment = {
  ...process.env,
  // Explicit, loopback-only compatibility mode for one trusted local user.
  // Browser JavaScript receives no bearer or reusable credential.
  ZHARWING_MEMORY_PROFILE: "personal-preview",
  ZHARWING_MEMORY_AUTH_MODE: "none",
  ZHARWING_MEMORY_HOST: "127.0.0.1",
  ZHARWING_PUBLIC_PROFILE: "personal-preview",
  ZHARWING_PUBLIC_DAEMON_URL: `http://127.0.0.1:${port}`
};

const children = [];
let closing = false;

function close(exitCode = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill("SIGTERM");
  }
  process.exitCode = exitCode;
}

function startChild(args) {
  const child = spawn(process.execPath, args, {
    cwd: repositoryRoot,
    env: environment,
    stdio: "inherit"
  });
  children.push(child);
  child.once("error", () => close(1));
  child.once("exit", (code) => {
    if (!closing) close(code ?? 1);
  });
  return child;
}

async function waitForDaemon() {
  const deadline = Date.now() + 30_000;
  while (!closing && Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return true;
    } catch {
      // The daemon is still starting. Retry within the bounded launch window.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

process.once("SIGINT", () => close());
process.once("SIGTERM", () => close());

if (!webOnly) {
  startChild([
    "--env-file-if-exists=.env",
    "--import",
    "tsx",
    "apps/daemon/src/index.ts"
  ]);
}
if (!daemonOnly) {
  const daemonReady = webOnly || await waitForDaemon();
  if (!daemonReady) {
    close(1);
  } else if (!closing) {
    startChild([
      path.join(repositoryRoot, "node_modules", "vite", "bin", "vite.js"),
      "--config",
      path.join(repositoryRoot, "apps", "desktop", "vite.config.ts")
    ]);
  }
}
