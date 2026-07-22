import { spawn } from "node:child_process";

const devUrl =
  process.env.ZHARWING_MEMORY_DESKTOP_DEV_URL || process.env.AIMEM_DESKTOP_DEV_URL || "http://localhost:5174/";
const expectedTitle = "<title>Zharwing Memory</title>";

async function readExistingServer() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1_000);
  try {
    const response = await fetch(devUrl, { signal: controller.signal });
    const body = await response.text();
    return { ok: response.ok, body };
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

const existing = await readExistingServer();
if (existing) {
  if (existing.ok && existing.body.includes(expectedTitle)) {
    console.log(`Using existing Zharwing Memory web dev server at ${devUrl}`);
    process.exit(0);
  }

  console.error(`Port ${new URL(devUrl).port} is already in use, but it does not look like Zharwing Memory.`);
  console.error("Stop that process, or set ZHARWING_MEMORY_DESKTOP_DEV_URL to another Zharwing Memory dev server URL.");
  process.exit(1);
}

function packageManagerScriptCommand(scriptName) {
  const npmExecPath = process.env.npm_execpath;

  if (npmExecPath && /\.(?:cjs|mjs|js)$/i.test(npmExecPath)) {
    return {
      command: process.execPath,
      args: [npmExecPath, scriptName]
    };
  }

  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", `pnpm ${scriptName}`]
    };
  }

  return {
    command: "pnpm",
    args: [scriptName]
  };
}

// This starts only the React/Vite dev server for Tauri's devUrl. The native
// Tauri process starts or reuses the daemon separately.
const { command, args } = packageManagerScriptCommand("dev");
const child = spawn(command, args, {
  stdio: "inherit",
  shell: false
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
