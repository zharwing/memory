import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { inventoryArtifacts, scanArtifactText } from "./lib/artifact-scan.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const distDir = path.join(repoRoot, "apps", "desktop", "dist");
const htmlPath = path.join(distDir, "index.html");
const budgets = Object.freeze({
  entry: 450_000,
  chunk: 1_200_000,
  javascript: 4_500_000,
  css: 500_000,
  files: 256
});

const html = await readFile(htmlPath, "utf8").catch(() => {
  throw new Error(`Desktop build not found at ${htmlPath}. Run the web build first.`);
});
const entryMatch = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']+)["']/i);
if (!entryMatch) throw new Error("Could not identify the desktop entry script in index.html.");
if (/<script(?![^>]+src=)[^>]*>/i.test(html)) throw new Error("Desktop output contains an inline script forbidden by CSP.");

const inventory = inventoryArtifacts(distDir);
const entryPath = path.resolve(distDir, entryMatch[1].replace(/^\//, ""));
const entryBytes = (await stat(entryPath)).size;
const javascript = inventory.filter((file) => file.path.endsWith(".js"));
const css = inventory.filter((file) => file.path.endsWith(".css"));
const totalJavaScript = javascript.reduce((total, file) => total + file.bytes, 0);
const totalCss = css.reduce((total, file) => total + file.bytes, 0);
const largest = [...javascript].sort((left, right) => right.bytes - left.bytes)[0];
const failures = [];

if (entryBytes > budgets.entry) failures.push(`startup entry ${entryBytes} > ${budgets.entry} bytes`);
if (largest && largest.bytes > budgets.chunk) failures.push(`largest chunk ${largest.path} ${largest.bytes} > ${budgets.chunk} bytes`);
if (totalJavaScript > budgets.javascript) failures.push(`total JavaScript ${totalJavaScript} > ${budgets.javascript} bytes`);
if (totalCss > budgets.css) failures.push(`total CSS ${totalCss} > ${budgets.css} bytes`);
if (inventory.length > budgets.files) failures.push(`artifact count ${inventory.length} > ${budgets.files}`);

for (const file of inventory) {
  if (file.path.endsWith(".map")) failures.push(`source map emitted: ${file.path}`);
  if (/(^|\/)(testing|fixtures|__tests__|playwright-report)(\/|$)/i.test(file.path)) {
    failures.push(`test-only path emitted: ${file.path}`);
  }
}

const reachability = scanArtifactText(inventory, {
  patterns: [
    { id: "test-fixture-marker", pattern: /zharwing\.(?:fixture|scenario)\./i },
    {
      id: "node-runtime-import",
      pattern: /(?:\bnode:(?:child_process|crypto|fs|http|https|net|os|path|tls|worker_threads)\b|\b(?:require|import)\s*\(\s*["'](?:node:)?(?:child_process|crypto|fs|http|https|net|os|path|tls|worker_threads)["'])/i
    },
    {
      id: "node-owned-workspace-import",
      pattern: /@zharwing\/memory-(?:assistant|context-engine|mcp|privacy\/node|storage)(?:[/'"]|$)/i
    },
    { id: "non-browser-credential-transport", pattern: /NonBrowserCredentialTransport|ZHARWING_MEMORY_AGENT_CREDENTIAL/ },
    { id: "private-test-canary", pattern: /(?:PRIVATE|SECRET|NEVER_SEND|HUMAN|SAME_TYPE)[A-Z0-9_]*_CANARY/i }
  ]
});
for (const finding of reachability) failures.push(`${finding.rule}: ${finding.path}`);

if (failures.length) throw new Error(`Desktop artifact policy failed:\n- ${failures.join("\n- ")}`);

console.log(JSON.stringify({
  status: "pass",
  budgets,
  observed: {
    entryBytes,
    largestChunkBytes: largest?.bytes ?? 0,
    totalJavaScript,
    totalCss,
    files: inventory.length
  }
}));
