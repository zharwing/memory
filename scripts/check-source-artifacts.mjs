import path from "node:path";
import { fileURLToPath } from "node:url";

import { scanSourceArtifacts } from "./lib/artifact-scan.mjs";

const args = process.argv.slice(2);
const rootFlagIndex = args.indexOf("--root");
const repoRoot =
  rootFlagIndex !== -1 && args[rootFlagIndex + 1]
    ? path.resolve(args[rootFlagIndex + 1])
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const offenders = scanSourceArtifacts(repoRoot);

if (offenders.length === 0) {
  console.log("No generated artifacts found under workspace src directories.");
  process.exit(0);
}

console.error("Generated artifacts found under workspace src directories:");
for (const offender of offenders) {
  console.error(`  ${offender}`);
}
console.error(
  "src trees must contain authored source only. Compiler output belongs in ignored dist directories. " +
    "Delete these files (do not hand-edit or ignore them) and rebuild with 'pnpm build' or 'pnpm typecheck'."
);
process.exit(1);
