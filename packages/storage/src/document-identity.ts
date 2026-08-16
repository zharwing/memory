import { createHash } from "node:crypto";
import path from "node:path";
import {
  createId,
  createLegacyDerivedDocumentId,
  createStoredDocumentId,
  type DocumentId,
  type Project,
  type StoredDocumentId
} from "@zharwing/memory-core";
import { normalizeInteropPath } from "./fs.js";

/** Normalizes a relative durable identity path. Absolute and traversing inputs are never accepted. */
export function normalizeDocumentRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/").normalize("NFC");
  if (
    !normalized ||
    normalized === "." ||
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(normalized) ||
    normalized.startsWith("//")
  ) {
    throw new Error("Document identity requires a non-empty relative project path.");
  }
  const segments = normalized.split("/").filter((segment) => segment && segment !== ".");
  if (!segments.length || segments.some((segment) => segment === "..")) {
    throw new Error("Document path traversal is not allowed.");
  }
  return segments.join("/");
}

/** Pure legacy identity derivation. It never writes and accepts no filesystem path outside the exact project root. */
export function normalizedDocumentRelativePath(project: Project, filePath: string): string {
  const root = path.resolve(normalizeInteropPath(project.memoryRoot));
  const input = normalizeInteropPath(filePath);
  const lexical = input.replace(/\\/g, "/");
  if (lexical.split("/").some((segment) => segment === "..")) {
    throw new Error("Document path traversal is not allowed.");
  }
  // A foreign drive path that interop normalization could not map must not be
  // interpreted as a relative filename on this platform.
  if (/^[A-Za-z]:\//.test(lexical) && !path.isAbsolute(input)) {
    throw new Error("Document path uses an unsupported absolute path form.");
  }
  const candidate = path.isAbsolute(input) ? path.resolve(input) : path.resolve(root, input);
  const relative = path.relative(root, candidate).replace(/\\/g, "/");
  if (
    !relative ||
    relative === "." ||
    relative === ".." ||
    relative.startsWith("../") ||
    path.isAbsolute(relative) ||
    path.win32.isAbsolute(relative)
  ) {
    throw new Error("Document path must be a non-empty path within the exact project memory root.");
  }
  return normalizeDocumentRelativePath(relative);
}

/** The only random durable document-ID factory. Reads never call it. */
export function createStoredDocumentIdentity(prefix: "doc" | "diagram" = "doc"): StoredDocumentId {
  const id = createStoredDocumentId(createId(prefix));
  if (!id) throw new Error("Could not create a stored document identity.");
  return id;
}

export function deriveLegacyDocumentId(project: Project, filePath: string): DocumentId {
  const relative = normalizedDocumentRelativePath(project, filePath);
  const digest = createHash("sha256")
    .update(`zharwing-document-id-v1\0${project.id}\0${relative}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  const id = createLegacyDerivedDocumentId(digest);
  if (!id) throw new Error("Could not derive legacy document identity.");
  return id;
}
