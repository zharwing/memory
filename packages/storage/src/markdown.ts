type FrontmatterValue = string | string[] | number | boolean | undefined;

export interface ParsedMarkdown {
  frontmatter: Record<string, FrontmatterValue>;
  body: string;
}

export function parseMarkdown(raw: string): ParsedMarkdown {
  if (!raw.startsWith("---\n")) {
    return { frontmatter: {}, body: raw };
  }

  const end = raw.indexOf("\n---", 4);
  if (end === -1) {
    return { frontmatter: {}, body: raw };
  }

  const yaml = raw.slice(4, end).trim();
  const body = raw.slice(end + 4).replace(/^\n/, "");
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
  if ((input.startsWith('"') && input.endsWith('"')) || (input.startsWith("'") && input.endsWith("'"))) {
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
