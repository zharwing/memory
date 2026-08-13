import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const urls = process.env.ZHARWING_MEMORY_LOCAL_PREVIEW_URL
  ? [process.env.ZHARWING_MEMORY_LOCAL_PREVIEW_URL]
  : ["http://127.0.0.1:5174/", "http://localhost:5174/"];
const browser = [
  process.env.ZHARWING_MEMORY_BROWSER_PATH,
  process.platform === "win32"
    ? path.join(process.env.PROGRAMFILES_X86 || "C:\\Program Files (x86)", "Microsoft", "Edge", "Application", "msedge.exe")
    : undefined,
  process.platform === "win32"
    ? path.join(process.env.PROGRAMFILES || "C:\\Program Files", "Google", "Chrome", "Application", "chrome.exe")
    : undefined,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
].filter(Boolean).find((candidate) => existsSync(candidate));

if (!browser) throw new Error("No supported Chrome or Edge browser was found.");

for (const [index, url] of urls.entries()) {
  const profile = path.join(os.tmpdir(), `zharwing-local-preview-${process.pid}-${index}`);
  try {
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
      timeout: 60_000,
      windowsHide: true,
      maxBuffer: 20 * 1024 * 1024
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Browser exited with status ${result.status} for ${url}.`);
    const dom = result.stdout || "";
    const locked = dom.includes("Session locked") || dom.includes("Local session needs a refresh");
    if (locked) throw new Error(`The local preview rendered a session lock for ${url}.`);
    if (!dom.includes('class="app-shell"')) {
      throw new Error(`The local preview did not render the application shell for ${url}.`);
    }
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }
}
console.log(`Local preview startup passed for 127.0.0.1 and localhost in ${path.basename(browser)}.`);
