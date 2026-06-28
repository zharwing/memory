export function parseMarkdown(raw) {
    if (!raw.startsWith("---\n")) {
        return { frontmatter: {}, body: raw };
    }
    const end = raw.indexOf("\n---", 4);
    if (end === -1) {
        return { frontmatter: {}, body: raw };
    }
    const yaml = raw.slice(4, end).trim();
    const body = raw.slice(end + 4).replace(/^\n/, "");
    const frontmatter = {};
    const lines = yaml.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
        if (!match)
            continue;
        const [, key, rawValue] = match;
        if (rawValue === "") {
            const list = [];
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
export function formatMarkdown(frontmatter, body) {
    const yaml = Object.entries(frontmatter)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => formatYamlLine(key, value))
        .join("\n");
    return `---\n${yaml}\n---\n\n${body.trim()}\n`;
}
function formatYamlLine(key, value) {
    if (Array.isArray(value)) {
        if (value.length === 0)
            return `${key}: []`;
        return `${key}:\n${value.map((item) => `  - ${quote(item)}`).join("\n")}`;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return `${key}: ${String(value)}`;
    }
    return `${key}: ${quote(String(value ?? ""))}`;
}
function quote(input) {
    if (/^[A-Za-z0-9_.:/\\ -]+$/.test(input)) {
        return input;
    }
    return JSON.stringify(input);
}
function unquote(input) {
    if ((input.startsWith('"') && input.endsWith('"')) || (input.startsWith("'") && input.endsWith("'"))) {
        return input.slice(1, -1);
    }
    return input;
}
function coerceScalar(input) {
    if (input === "true")
        return true;
    if (input === "false")
        return false;
    if (/^-?\d+(\.\d+)?$/.test(input))
        return Number(input);
    return input;
}
//# sourceMappingURL=markdown.js.map