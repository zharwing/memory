import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = path.join(repoRoot, "apps", "desktop");
const sourceRoot = path.join(desktopRoot, "src");
const productionEntry = path.join(sourceRoot, "main.tsx");
const testingRoot = path.join(sourceRoot, "testing");
const syntheticCanary = "ZHARWING_FRONTEND_SYNTHETIC_CANARY_DO_NOT_SHIP_7F6C";
const sourceExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"];
const findings = [];

function posix(file) {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

function walkFiles(directory, visit) {
  if (!existsSync(directory)) return;
  for (const entry of readdirSync(directory).sort()) {
    const file = path.join(directory, entry);
    const stats = lstatSync(file);
    if (stats.isSymbolicLink()) continue;
    if (stats.isDirectory()) walkFiles(file, visit);
    else if (stats.isFile()) visit(file);
  }
}

function resolveRelativeImport(importer, specifier) {
  const unresolved = path.resolve(path.dirname(importer), specifier);
  const candidates = [unresolved];
  const extension = path.extname(unresolved);
  if (extension) {
    const withoutExtension = unresolved.slice(0, -extension.length);
    candidates.push(...sourceExtensions.map((candidate) => `${withoutExtension}${candidate}`));
  } else {
    candidates.push(...sourceExtensions.map((candidate) => `${unresolved}${candidate}`));
    candidates.push(...sourceExtensions.map((candidate) => path.join(unresolved, `index${candidate}`)));
  }
  return candidates.find((candidate) => existsSync(candidate) && lstatSync(candidate).isFile());
}

function relativeImports(source) {
  const imports = [];
  const patterns = [
    /\b(?:from|import)\s*["'](\.[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) imports.push(match[1]);
  }
  return imports;
}

function traceProductionClosure() {
  if (!existsSync(productionEntry)) {
    findings.push("production entry apps/desktop/src/main.tsx is missing");
    return new Set();
  }
  const reachable = new Set();
  const pending = [productionEntry];
  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || reachable.has(file)) continue;
    reachable.add(file);
    const normalized = file.split(path.sep).join("/");
    if (normalized.includes("/testing/") || /\.test\.[cm]?[jt]sx?$/i.test(file)) {
      findings.push(`production entry reaches test-only module ${posix(file)}`);
      continue;
    }
    if (!/\.(?:[cm]?[jt]sx?|css)$/i.test(file)) continue;
    const source = readFileSync(file, "utf8");
    for (const specifier of relativeImports(source)) {
      const resolved = resolveRelativeImport(file, specifier);
      if (!resolved) findings.push(`${posix(file)} has an unresolved relative import ${specifier}`);
      else pending.push(resolved);
    }
  }
  return reachable;
}

function scanProductionSource() {
  walkFiles(sourceRoot, (file) => {
    const normalized = file.split(path.sep).join("/");
    if (normalized.includes("/testing/") || /\.test\.[cm]?[jt]sx?$/i.test(file)) return;
    if (!/\.(?:[cm]?[jt]sx?|css|html|json)$/i.test(file)) return;
    const source = readFileSync(file, "utf8");
    if (source.includes(syntheticCanary)) findings.push(`${posix(file)} contains the synthetic privacy canary`);
    if (/from\s*["'][^"']*\/testing(?:\/|["'])|import\s*\(["'][^"']*\/testing(?:\/|["'])/i.test(source)) {
      findings.push(`${posix(file)} imports the test-only scenario foundation`);
    }
    if (/\bpreviewMode\b|\bscenarioMode\b|ZHARWING_(?:PUBLIC_)?SCENARIO/i.test(source)) {
      findings.push(`${posix(file)} contains a production scenario/preview branch`);
    }
  });
}

function scanTestingBoundaries() {
  if (!existsSync(path.join(testingRoot, "fake-memory-transport.ts"))) {
    findings.push("contract-faithful fake carrier is missing");
  }
  if (!existsSync(path.join(testingRoot, "scenario-registry.ts"))) {
    findings.push("production-composed scenario registry is missing");
  }
  const forbidden = [
    [/\bfetch\s*\(/, "network fetch"],
    [/\b(?:localStorage|sessionStorage)\b/, "browser persistence"],
    [/\b(?:BrowserMemoryTransport|TauriMemoryTransport)\b/, "live carrier"],
    [/["']node:(?:fs|child_process|net|http|https)["']/, "Node effect API"],
    [/\bprocess\.env\b/, "environment value"],
    [/\binvoke\s*\(/, "native invocation"],
    [/[A-Za-z]:[\\/](?!fictional(?:[\\/]|$))/, "machine-specific absolute path"]
  ];
  walkFiles(testingRoot, (file) => {
    if (!/\.[cm]?[jt]sx?$/i.test(file) || /\.test\.[cm]?[jt]sx?$/i.test(file)) return;
    const source = readFileSync(file, "utf8");
    for (const [pattern, label] of forbidden) {
      if (pattern.test(source)) findings.push(`${posix(file)} directly references forbidden ${label}`);
    }
  });
}

function scanViteConfiguration() {
  const viteConfig = path.join(desktopRoot, "vite.config.ts");
  if (!existsSync(viteConfig)) return findings.push("apps/desktop/vite.config.ts is missing");
  const source = readFileSync(viteConfig, "utf8");
  if (/testing|scenario-registry|fake-memory-transport|fixture-data/i.test(source)) {
    findings.push("apps/desktop/vite.config.ts references the test-only scenario foundation");
  }
}

function scanPublicAndSecuritySurfaces() {
  const protectedRoots = [
    path.join(repoRoot, "website", "memory"),
    path.join(repoRoot, "docs", "security"),
    path.join(desktopRoot, "src-tauri", "capabilities")
  ];
  const protectedFiles = [
    path.join(repoRoot, "SECURITY.md"),
    path.join(repoRoot, "scripts", "build-public-docs.mjs"),
    path.join(repoRoot, "scripts", "check-public-docs.mjs"),
    path.join(desktopRoot, "index.html"),
    path.join(desktopRoot, "vite.config.ts"),
    path.join(desktopRoot, "src-tauri", "tauri.conf.json")
  ];
  const inspect = (file) => {
    if (!/\.(?:[cm]?[jt]sx?|css|html|json|md|toml|yml|yaml)$/i.test(file)) return;
    const source = readFileSync(file, "utf8");
    if (source.includes(syntheticCanary)) findings.push(`${posix(file)} exposes the synthetic privacy canary`);
    if (/scenario-registry|fake-memory-transport|fixture-data\.[cm]?[jt]sx?|src\/testing/i.test(source)) {
      findings.push(`${posix(file)} references test-only frontend source from a public, configuration, or security surface`);
    }
  };
  for (const root of protectedRoots) walkFiles(root, inspect);
  for (const file of protectedFiles) if (existsSync(file)) inspect(file);
}

function scanEmittedOutput() {
  const distRoot = path.join(desktopRoot, "dist");
  if (!existsSync(distRoot)) return;
  const markers = [syntheticCanary, "scenario-registry", "fake-memory-transport", "fixture-data.ts"];
  walkFiles(distRoot, (file) => {
    if (!/\.(?:js|css|html|json|map|txt)$/i.test(file)) return;
    const source = readFileSync(file, "utf8");
    for (const marker of markers) {
      if (source.includes(marker)) findings.push(`${posix(file)} contains test-only marker ${marker}`);
    }
  });
}

const closure = traceProductionClosure();
scanProductionSource();
scanTestingBoundaries();
scanViteConfiguration();
scanPublicAndSecuritySurfaces();
scanEmittedOutput();

if (findings.length > 0) {
  console.error("Frontend fixture reachability check failed:");
  for (const finding of [...new Set(findings)].sort()) console.error(`  - ${finding}`);
  process.exit(1);
}

console.log(
  `Frontend fixture reachability check passed: ${closure.size} production modules are isolated from test scenarios, synthetic canaries, live carriers, and private stores.`
);
