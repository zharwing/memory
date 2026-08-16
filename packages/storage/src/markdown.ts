type FrontmatterValue = string | string[] | number | boolean | undefined;

export interface ParsedMarkdown {
  frontmatter: Record<string, FrontmatterValue>;
  body: string;
}

export function parseMarkdown(raw: string): ParsedMarkdown {
  const text = raw.startsWith("\uFEFF") ? raw.slice(1) : raw;
  const opening = /^---(\r\n|\n|$)/.exec(text);
  if (!opening) {
    return { frontmatter: {}, body: raw };
  }
  const contentStart = opening[0].length;
  const closing = findClosingDelimiter(text, contentStart);
  if (!closing) {
    return { frontmatter: {}, body: raw };
  }
  const yaml = text.slice(contentStart, closing.start).replace(/^\r?\n/, "").replace(/\r?\n$/, "");
  const body = text.slice(closing.end);
  const frontmatter: Record<string, FrontmatterValue> = {};
  const lines = yaml.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (rawValue === "") {
      const list: string[] = [];
      while (lines[index + 1]?.startsWith("  - ")) {
        index += 1;
        list.push(unquote(lines[index].slice(4).trim()));
      }
      frontmatter[key] = list;
      continue;
    }

    if (rawValue.startsWith("[") && rawValue.endsWith("]")) {
      frontmatter[key] = rawValue
        .slice(1, -1)
        .split(",")
        .map((item) => unquote(item.trim()))
        .filter(Boolean);
      continue;
    }

    frontmatter[key] = coerceScalar(unquote(rawValue));
  }

  return { frontmatter, body };
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

export function formatMarkdown(frontmatter: Record<string, FrontmatterValue>, body: string): string {
  const yaml = Object.entries(frontmatter)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => formatYamlLine(key, value))
    .join("\n");

  return `---\n${yaml}\n---\n${body}`;
}

function formatYamlLine(key: string, value: FrontmatterValue): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return `${key}: []`;
    return `${key}:\n${value.map((item) => `  - ${quote(item)}`).join("\n")}`;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return `${key}: ${String(value)}`;
  }
  return `${key}: ${quote(String(value ?? ""))}`;
}

function quote(input: string): string {
  if (/^[A-Za-z0-9_.:/\\ -]+$/.test(input)) {
    return input;
  }
  return JSON.stringify(input);
}

function unquote(input: string): string {
  if (input.startsWith('"') && input.endsWith('"')) {
    try {
      const parsed = JSON.parse(input);
      if (typeof parsed === "string") {
        return parsed;
      }
    } catch {
      // Preserve compatibility with previously stored, non-JSON quoted values.
    }
    return input.slice(1, -1);
  }
  if (input.startsWith("'") && input.endsWith("'")) {
    return input.slice(1, -1);
  }
  return input;
}

function coerceScalar(input: string): FrontmatterValue {
  if (input === "true") return true;
  if (input === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(input)) return Number(input);
  return input;
}
