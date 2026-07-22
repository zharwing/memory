import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const distDir = path.join(repoRoot, "apps", "desktop", "dist");
const htmlPath = path.join(distDir, "index.html");
const entryBudget = Number(process.env.ZHARWING_MEMORY_ENTRY_BUDGET_BYTES || 450_000);
const chunkBudget = Number(process.env.ZHARWING_MEMORY_CHUNK_BUDGET_BYTES || 1_200_000);

const html = await readFile(htmlPath, "utf8").catch(() => {
  throw new Error(`Desktop build not found at ${htmlPath}. Run the web build first.`);
});
const entryMatch = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i);
if (!entryMatch) throw new Error("Could not identify the desktop entry script in index.html.");

const entryPath = path.resolve(distDir, entryMatch[1].replace(/^\//, ""));
const entryBytes = (await stat(entryPath)).size;
const assetsDir = path.join(distDir, "assets");
const chunks = (await readdir(assetsDir))
  .filter((file) => file.endsWith(".js"))
  .map(async (file) => ({ file, bytes: (await stat(path.join(assetsDir, file))).size }));
const largest = (await Promise.all(chunks)).sort((left, right) => right.bytes - left.bytes)[0];

const failures = [];
if (entryBytes > entryBudget) failures.push(`startup entry ${entryBytes} > ${entryBudget} bytes`);
if (largest && largest.bytes > chunkBudget) failures.push(`largest chunk ${largest.file} ${largest.bytes} > ${chunkBudget} bytes`);
if (failures.length) throw new Error(`Desktop bundle budget exceeded: ${failures.join("; ")}`);

console.log(
  `Desktop bundle budgets passed: entry ${entryBytes}/${entryBudget} bytes; largest chunk ${largest?.bytes ?? 0}/${chunkBudget} bytes.`
);
