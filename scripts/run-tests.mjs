import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const roots = ["apps", "packages"];
const tests = [];

for (const root of roots) {
  collectTests(path.resolve(root));
}

if (tests.length === 0) {
  console.log("No compiled test files found.");
  process.exit(0);
}

const result = spawnSync(process.execPath, ["--test", ...tests], {
  stdio: "inherit"
});

process.exit(result.status ?? 1);

function collectTests(current) {
  let entries;
  try {
    entries = readdirSync(current);
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(current, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      collectTests(fullPath);
      continue;
    }

    if (/\.test\.js$/i.test(entry) && fullPath.includes(`${path.sep}dist${path.sep}`)) {
      tests.push(fullPath);
    }
  }
}
