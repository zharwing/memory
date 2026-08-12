import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

import {
  artifactInventoryDigest,
  inventoryArtifacts,
  sha256File
} from "./lib/artifact-scan.mjs";

const repoRoot = path.resolve(import.meta.dirname, "..");
const distDir = path.join(repoRoot, "apps", "desktop", "dist");
const pnpmLock = path.join(repoRoot, "pnpm-lock.yaml");
const cargoLock = path.join(repoRoot, "apps", "desktop", "src-tauri", "Cargo.lock");
const inventory = inventoryArtifacts(distDir);
const artifactDigest = artifactInventoryDigest(inventory);
const pnpmBytes = readFileSync(pnpmLock);
const cargoBytes = existsSync(cargoLock) ? readFileSync(cargoLock) : undefined;
const pnpmLockSha256 = sha256(pnpmBytes);
const cargoLockSha256 = cargoBytes ? sha256(cargoBytes) : undefined;
const closureDigest = sha256(Buffer.from(`${pnpmLockSha256}\0${cargoLockSha256 ?? "absent"}`, "utf8"));
const outputRoot = path.join(
  repoRoot,
  "EXECUTION",
  "evidence",
  "frontend-v2",
  "MEM-FEV2-10",
  "candidates",
  artifactDigest
);

const components = deduplicateComponents([
  ...workspaceComponents(),
  ...pnpmComponents(pnpmBytes.toString("utf8")),
  ...(cargoBytes ? cargoComponents(cargoBytes.toString("utf8")) : [])
]);

const document = {
  bomFormat: "CycloneDX",
  specVersion: "1.5",
  serialNumber: `urn:uuid:${stableUuid(closureDigest)}`,
  version: 1,
  metadata: {
    component: {
      type: "application",
      name: "@zharwing/memory-workspace",
      version: "0.1.0",
      "bom-ref": "pkg:npm/%40zharwing%2Fmemory-workspace@0.1.0"
    },
    properties: [
      { name: "zharwing:pnpm-lock:sha256", value: pnpmLockSha256 },
      ...(cargoLockSha256 ? [{ name: "zharwing:cargo-lock:sha256", value: cargoLockSha256 }] : []),
      { name: "zharwing:dependency-closure:sha256", value: closureDigest },
      { name: "zharwing:frontend-artifact:sha256", value: artifactDigest },
      { name: "zharwing:generation", value: "lockfile-static-no-network" }
    ]
  },
  components
};

mkdirSync(outputRoot, { recursive: true });
const sbomPath = path.join(outputRoot, `dependency-closure-${closureDigest.slice(0, 16)}.cdx.json`);
const sbomBody = `${JSON.stringify(document, null, 2)}\n`;
writeImmutable(sbomPath, sbomBody);

const checksumEntries = deduplicateChecksums([
  ...inventory.map((file) => ({
    path: `apps/desktop/dist/${file.path}`,
    sha256: file.sha256
  })),
  ...explicitArtifactChecksums(process.argv.slice(2))
]);
const checksumsBody = `${checksumEntries.map((entry) => `${entry.sha256}  ${entry.path}`).join("\n")}\n`;
const releaseSetDigest = sha256(Buffer.from(checksumsBody, "utf8"));
const checksumsPath = path.join(outputRoot, `artifacts-${releaseSetDigest.slice(0, 16)}.sha256`);
writeImmutable(checksumsPath, checksumsBody);

console.log(JSON.stringify({
  status: "generated",
  artifactDigest,
  releaseSetDigest,
  dependencyClosureDigest: closureDigest,
  components: components.length,
  sbom: relative(sbomPath),
  sbomSha256: sha256File(sbomPath),
  checksums: relative(checksumsPath),
  checksumsSha256: sha256File(checksumsPath),
  cargo: cargoBytes ? "included" : "deferred_platform_validation"
}));

function workspaceComponents() {
  const manifests = [path.join(repoRoot, "package.json")];
  for (const parent of ["apps", "packages"]) {
    const directory = path.join(repoRoot, parent);
    if (!existsSync(directory)) continue;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) manifests.push(path.join(directory, entry.name, "package.json"));
    }
  }
  return manifests.filter(existsSync).map((manifest) => {
    const value = JSON.parse(readFileSync(manifest, "utf8"));
    const name = String(value.name || path.basename(path.dirname(manifest)));
    const version = String(value.version || "0.0.0-private");
    return component("npm", name, version, { type: value.private ? "library" : "application" });
  });
}

function pnpmComponents(lockfile) {
  const snapshots = section(lockfile, "snapshots");
  const keys = snapshots.split(/\r?\n/).flatMap((line) => {
    const match = /^  (\S.*):\s*$/.exec(line);
    return match ? [unquote(match[1])] : [];
  });
  return keys.flatMap((key) => {
    const base = key.replace(/\(.+\)$/, "").replace(/^\//, "");
    if (/^(?:file|link|workspace):/.test(base)) return [];
    const separator = base.lastIndexOf("@");
    if (separator <= 0 || separator === base.length - 1) return [];
    return [component("npm", base.slice(0, separator), base.slice(separator + 1))];
  });
}

function cargoComponents(lockfile) {
  return lockfile.split(/^\[\[package\]\]\s*$/m).slice(1).flatMap((block) => {
    const name = /^name\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    const version = /^version\s*=\s*"([^"]+)"/m.exec(block)?.[1];
    if (!name || !version) return [];
    const checksum = /^checksum\s*=\s*"([a-f0-9]{64})"/m.exec(block)?.[1];
    return [component("cargo", name, version, checksum ? {
      hashes: [{ alg: "SHA-256", content: checksum }]
    } : {})];
  });
}

function component(ecosystem, name, version, extras = {}) {
  const purl = ecosystem === "npm"
    ? npmPurl(name, version)
    : `pkg:cargo/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
  return {
    type: extras.type ?? "library",
    name,
    version,
    purl,
    "bom-ref": purl,
    ...(extras.hashes ? { hashes: extras.hashes } : {})
  };
}

function npmPurl(name, version) {
  if (name.startsWith("@") && name.includes("/")) {
    const [scope, packageName] = name.slice(1).split("/", 2);
    return `pkg:npm/%40${encodeURIComponent(scope)}/${encodeURIComponent(packageName)}@${encodeURIComponent(version)}`;
  }
  return `pkg:npm/${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
}

function deduplicateComponents(values) {
  return [...new Map(values.map((value) => [value["bom-ref"], value])).values()]
    .sort((left, right) => left["bom-ref"].localeCompare(right["bom-ref"]));
}

function deduplicateChecksums(values) {
  const byPath = new Map();
  for (const value of values) {
    const existing = byPath.get(value.path);
    if (existing && existing.sha256 !== value.sha256) {
      throw new Error(`Conflicting release artifact identity: ${value.path}`);
    }
    byPath.set(value.path, value);
  }
  return [...byPath.values()].sort((left, right) => left.path.localeCompare(right.path));
}

function section(text, name) {
  const match = new RegExp(`^${name}:\\s*$`, "m").exec(text);
  if (!match) throw new Error(`pnpm lockfile is missing the ${name} section.`);
  const remainder = text.slice(match.index + match[0].length);
  const next = /^\S[^\r\n]*:\s*$/m.exec(remainder);
  return next ? remainder.slice(0, next.index) : remainder;
}

function explicitArtifactChecksums(args) {
  const results = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] !== "--artifact") continue;
    const candidate = args[index + 1];
    if (!candidate) throw new Error("--artifact requires a repository-relative file.");
    index += 1;
    const absolute = path.resolve(repoRoot, candidate);
    const relativePath = relative(absolute);
    if (relativePath.startsWith("../") || path.isAbsolute(relativePath)) {
      throw new Error("Release checksum artifacts must remain inside the repository candidate tree.");
    }
    const metadata = lstatSync(absolute);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size <= 0 || metadata.size > 512 * 1024 * 1024) {
      throw new Error(`Release checksum artifact is not a bounded regular file: ${relativePath}`);
    }
    results.push({ path: relativePath, sha256: sha256File(absolute) });
  }
  return results;
}

function writeImmutable(file, body) {
  if (existsSync(file)) {
    if (readFileSync(file, "utf8") !== body) throw new Error(`Immutable release output conflicts: ${relative(file)}`);
    return;
  }
  writeFileSync(file, body, { encoding: "utf8", flag: "wx", mode: 0o600 });
}

function stableUuid(hex) {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function unquote(value) {
  return value.replace(/^['"]|['"]$/g, "");
}

function relative(file) {
  return path.relative(repoRoot, file).replaceAll("\\", "/");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
