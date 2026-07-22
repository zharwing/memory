import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const desktopDir = path.resolve("apps/desktop");
const tauriCli = path.join(desktopDir, "node_modules", "@tauri-apps", "cli", "tauri.js");

if (!existsSync(tauriCli)) {
  console.error("Tauri CLI not found. Run the repository dependency setup first.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [tauriCli, "build", ...process.argv.slice(2)], {
  cwd: desktopDir,
  stdio: "inherit",
  env: process.env
});

process.exit(result.status ?? 1);
