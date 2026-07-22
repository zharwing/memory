import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const port = Number(process.env.ZHARWING_MEMORY_DESKTOP_SMOKE_PORT || 4174);
const url = `http://127.0.0.1:${port}/projects`;
const browser = findBrowser();

if (!browser) {
  console.error("No supported Chrome/Edge executable was found. Set ZHARWING_MEMORY_BROWSER_PATH.");
  process.exit(2);
}

const viteCli = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");
if (!existsSync(viteCli)) {
  console.error("Vite is not installed. Run the repository dependency setup first.");
  process.exit(2);
}

const server = spawn(process.execPath, [viteCli, "preview", "--config", "apps/desktop/vite.config.ts", "--host", "127.0.0.1", "--port", String(port)], {
  cwd: repoRoot,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  await waitForServer(url, server);
  const profile = path.join(os.tmpdir(), `zharwing-browser-smoke-${process.pid}`);
  const result = spawnSync(browser, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    "--virtual-time-budget=5000",
    "--dump-dom",
    url
  ], {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true
  });

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Browser exited ${result.status}: ${(result.stderr || "").slice(0, 1000)}`);
  if (!result.stdout.includes('class="app-shell"')) throw new Error("React app shell did not render.");
  if (!result.stdout.includes("Zharwing Memory")) throw new Error("Zharwing Memory branding was not rendered.");
  if (!result.stdout.includes("Project")) throw new Error("Projects route did not render its navigation/content contract.");

  console.log(`Desktop browser smoke passed in ${path.basename(browser)} at ${url}.`);
} finally {
  server.kill();
}

function findBrowser() {
  const candidates = [
    process.env.ZHARWING_MEMORY_BROWSER_PATH,
    process.platform === "win32" ? path.join(process.env.PROGRAMFILES_X86 || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe") : undefined,
    process.platform === "win32" ? path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe") : undefined,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser"
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate));
}

async function waitForServer(target, child) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Vite preview exited before startup with code ${child.exitCode}.`);
    try {
      const response = await fetch(target);
      if (response.ok) return;
    } catch {
      // Retry until the preview server is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error(`Timed out waiting for Vite preview at ${target}.`);
}
