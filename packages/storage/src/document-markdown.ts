import { promises as fs } from "node:fs";
import type { DocumentId } from "@zharwing/memory-core";

export interface RawDocumentMarkdown {
  raw: string;
  bom: string;
  eol: "\n" | "\r\n";
  hasFrontmatter: boolean;
  /** Offset immediately after the closing delimiter line. */
  frontmatterEnd: number;
  /** The decoded value of the first top-level id field, when present. */
  id: string | undefined;
  /** Count is used by explicit migration to report duplicate owned fields. */
  idFieldCount: number;
}

export async function readRawDocumentMarkdown(filePath: string): Promise<RawDocumentMarkdown> {
  return inspectRawDocumentMarkdown(await fs.readFile(filePath, "utf8"));
}

/**
 * Finds frontmatter by complete lines rather than fixed byte offsets. This is
 * deliberately lexical: callers can preserve the original YAML and body
 * bytes while still reading the one field owned by the document repository.
 */
export function inspectRawDocumentMarkdown(raw: string): RawDocumentMarkdown {
  const bom = raw.startsWith("\uFEFF") ? "\uFEFF" : "";
  const text = bom ? raw.slice(1) : raw;
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const opening = /^(---)(\r\n|\n|$)/.exec(text);
  if (!opening) return { raw, bom, eol, hasFrontmatter: false, frontmatterEnd: 0, id: undefined, idFieldCount: 0 };

  const contentStart = opening[0].length;
  const closing = findClosingDelimiter(text, contentStart);
  if (!closing) return { raw, bom, eol, hasFrontmatter: false, frontmatterEnd: 0, id: undefined, idFieldCount: 0 };

  const frontmatter = text.slice(contentStart, closing.start);
  const ids = frontmatter.split(/\r?\n/).filter((line) => /^id:(?:\s|$)/.test(line));
  const id = ids.length ? decodeScalar(ids[0]!.slice(3)) : undefined;
  return {
    raw,
    bom,
    eol,
    hasFrontmatter: true,
    // The public offset addresses the original raw string, including BOM.
    frontmatterEnd: closing.end + bom.length,
    id,
    idFieldCount: ids.length
  };
}

/** Explicit write only: insert a missing id without rewriting existing syntax. */
export function materializeDocumentId(raw: RawDocumentMarkdown, id: DocumentId): string {
  // A present blank, malformed, or duplicate field is an explicit migration
  // finding, not permission to silently add a second durable identity.
  if (raw.hasFrontmatter && raw.idFieldCount > 0) return raw.raw;
  const text = raw.bom ? raw.raw.slice(1) : raw.raw;
  if (raw.hasFrontmatter) {
    const opening = /^---(\r\n|\n|$)/.exec(text);
    if (!opening) return raw.raw;
    return `${raw.bom}---${opening[1]}id: ${id}${opening[1]}${text.slice(opening[0].length)}`;
  }
  return `${raw.bom}---${raw.eol}id: ${id}${raw.eol}---${raw.eol}${text}`;
}

function findClosingDelimiter(text: string, start: number): { start: number; end: number } | undefined {
  let cursor = start;
  while (cursor <= text.length) {
    const lineEnd = text.indexOf("\n", cursor);
    const end = lineEnd === -1 ? text.length : lineEnd + 1;
    const line = text.slice(cursor, lineEnd === -1 ? text.length : lineEnd).replace(/\r$/, "");
    if (line === "---") return { start: cursor, end };
    cursor = end;
    if (lineEnd === -1) break;
  }
  return undefined;
}

function decodeScalar(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
    } catch {
      // Preserve the historical text rather than treating malformed YAML as absent.
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  return trimmed;
}
