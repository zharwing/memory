import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, "website", "memory", "docs");
const publicOrigin = "https://zharwing.barbutsa.com";
const docsBase = "/memory/docs/";
const maximumSearchIndexBytes = 128 * 1024;

const groups = [
  {
    title: "Start here",
    docs: [
      ["README.md", "project-overview", "Project overview", "What Memory does, how it is organized, and the fastest way to start."],
      ["docs/SETUP.md", "setup", "Setup", "Choose a supported local profile and start the daemon, browser UI, desktop app, or agent connection."],
      ["docs/FRONTEND_V2_IMPLEMENTATION_STATUS.md", "frontend-v2-status", "Frontend V2 status", "Separate implemented source boundaries from candidate and release/device qualification."],
      ["docs/DEVELOPER_PREVIEW.md", "developer-preview", "Developer preview", "What is ready today, current limitations, and the project boundary."],
      ["docs/MVP_WALKTHROUGH.md", "mvp-walkthrough", "First walkthrough", "Create a project, start a session, save context, and resume work."],
      ["docs/WEB_UI.md", "browser-ui", "Browser UI", "Run the frequently used local interface in a browser."],
      ["docs/DESKTOP_UI.md", "desktop-ui", "Desktop UI", "Use the native application, navigation, and folder selection workflows."]
    ]
  },
  {
    title: "Use Memory",
    docs: [
      ["docs/USER_FLOWS.md", "user-flows", "User flows", "Understand setup, daily sessions, context, review, and recovery flows."],
      ["docs/REPOSITORIES.md", "repositories", "Repositories", "Connect one or several code repositories to a Memory project."],
      ["docs/WORKSTREAMS.md", "workstreams", "Workstreams", "Group sessions and knowledge around long-running areas of work."],
      ["docs/IMPORTING.md", "importing", "Import existing memory", "Preview and import existing Markdown documents and session history."],
      ["docs/GRAPH_RULES.md", "graph-rules", "Graph rules", "Shape useful graph hubs with deterministic project rules."],
      ["docs/SEMANTIC_GRAPH.md", "semantic-graph", "Semantic graph", "Add locally reviewed semantic relationships to the context graph."]
    ]
  },
  {
    title: "Connect AI agents",
    docs: [
      ["docs/MCP_SETUP.md", "mcp-setup", "MCP setup", "Connect Codex, Claude, or another MCP-compatible client."],
      ["docs/AGENT_AUTOMATION.md", "agent-automation", "Agent automation", "Bootstrap repositories and make session memory part of agent work."],
      ["docs/AGENT_PROTOCOL.md", "agent-protocol", "Agent protocol", "Follow the shared startup, checkpoint, and closeout contract."],
      ["docs/agent-adapters/GENERIC_MCP.md", "generic-mcp-adapter", "Generic MCP adapter", "Use the project-neutral MCP integration pattern."],
      ["docs/agent-adapters/CLI.md", "cli-adapter", "CLI adapter", "Use Memory through command-line workflows."],
      ["docs/agent-adapters/JSON_RPC.md", "json-rpc-adapter", "JSON-RPC adapter", "Integrate directly with the local daemon API."]
    ]
  },
  {
    title: "Architecture and decisions",
    docs: [
      ["docs/ARCHITECTURE.md", "architecture", "Architecture", "See the local daemon, adapters, packages, and trust boundaries."],
      ["docs/DATA_MODEL.md", "data-model", "Data model", "Understand projects, sessions, documents, graph data, and storage."],
      ["docs/API_REFERENCE.md", "api-reference", "API reference", "Reference the local HTTP, JSON-RPC, and MCP surfaces."],
      ["docs/DIAGRAMS.md", "diagrams", "System diagrams", "Review the main component, data, and interaction diagrams."],
      ["docs/SOURCE_CONTEXT.md", "source-context", "Source and context boundary", "Understand which sources become public documentation and how private context stays excluded."],
      ["docs/decisions/README.md", "architecture-decisions", "Architecture decisions", "Read the decision log and the rules for changing durable system boundaries."],
      ["docs/decisions/0001-local-first-project-boundary.md", "adr-local-first", "ADR 0001: Local-first project boundary", "Keep application source, private memory, and public documentation in separate ownership domains."],
      ["docs/decisions/0002-progressive-public-documentation.md", "adr-progressive-docs", "ADR 0002: Progressive public documentation", "Generate directly addressable pages whose content and navigation do not depend on JavaScript."],
      ["docs/decisions/0003-project-bound-agent-authority.md", "adr-agent-authority", "ADR 0003: Project-bound agent authority", "Use explicit project-bound agent authority and centralized privacy projection."]
    ]
  },
  {
    title: "Security and contracts",
    docs: [
      ["SECURITY.md", "security", "Security", "Understand the local trust model and report vulnerabilities."],
      ["docs/security/principal-model.md", "principal-model", "Principal model", "Review audiences, project binding, expiry, revocation, and operation authority."],
      ["docs/security/browser-session.md", "browser-session-security", "Browser session security", "Review local browser bootstrap, CSRF, rotation, revocation, and project binding."],
      ["docs/security/native-desktop-authority.md", "native-desktop-security", "Native desktop authority", "Review the Rust-owned daemon and credential boundary outside the webview."],
      ["docs/security/provider-secrets-and-egress.md", "provider-security", "Provider secrets and egress", "Operate write-only credentials and constrained provider destinations."],
      ["docs/security/privacy-projection.md", "privacy-projection", "Privacy projection", "Understand centralized agent and provider projection, visibility, and completeness."],
      ["docs/contracts/operation-admission.md", "operation-admission", "Operation admission", "Trace requests through exact decoding, authority, idempotency, and dispatch."]
    ]
  },
  {
    title: "Operate and contribute",
    docs: [
      ["docs/OPERATIONS.md", "operations", "Operations", "Run, package, back up, restore, and troubleshoot Memory."],
      ["docs/AI_TESTING.md", "ai-testing", "AI provider testing", "Test local and external model-backed workflows safely."],
      ["docs/TESTING.md", "testing-plan", "Testing plan", "See the testing strategy and expected coverage."],
      ["docs/accessibility/FRONTEND_ACCESSIBILITY_CONTRACT.md", "frontend-accessibility", "Frontend accessibility", "Review the responsive, keyboard, focus, contrast, motion, and manual qualification contract."],
      ["docs/migration/frontend-v2-migration.md", "frontend-v2-migration", "Frontend V2 migration", "Migrate profiles, credentials, visibility, preferences, and layout caches with rollback."],
      ["docs/migration/frontend-v2-compatibility-register.md", "frontend-v2-compatibility", "Compatibility register", "See retained and removed compatibility paths, callers, dates, and removal proof."],
      ["docs/qualification/frontend-qualification-matrix.md", "frontend-qualification", "Frontend qualification", "Separate source observations from candidate, browser, WebView, assistive-device, and release evidence."],
      ["CONTRIBUTING.md", "contributing", "Contributing", "Set up the repository and follow the contribution workflow."]
    ]
  }
];

const guides = groups.flatMap((group) => group.docs.map(([file, slug, title, description]) => ({
  file: normalize(file),
  slug,
  title,
  description,
  group: group.title
})));

const byFile = new Map(guides.map((guide) => [guide.file.toLowerCase(), guide]));
byFile.set("docs/readme.md", { slug: "" });

const publicAssets = new Map([
  ["docs/assets/zharwing-memory-dashboard.png", { href: "/memory/assets/dashboard.png", width: 1280, height: 720 }],
  ["docs/assets/zharwing-memory-current-work.png", { href: "/memory/assets/zharwing-memory-current-work.png", width: 1280, height: 720 }]
]);

assertManifest();

function normalize(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#039;";
    }
  });
}

function slugify(value) {
  const input = String(value).toLowerCase();
  let output = "";
  let pendingDash = false;
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code === 60) {
      const close = input.indexOf(">", index + 1);
      if (close >= 0) {
        index = close;
        continue;
      }
    }
    if (code === 38) {
      const entityEnd = asciiEntityEnd(input, index + 1);
      if (entityEnd >= 0) {
        index = entityEnd;
        continue;
      }
    }
    const isLowercaseLetter = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    if (isLowercaseLetter || isDigit) {
      if (pendingDash && output) output += "-";
      output += input[index];
      pendingDash = false;
    } else if (output) {
      pendingDash = true;
    }
  }
  return output || "section";
}

function asciiEntityEnd(input, start) {
  let index = start;
  while (index < input.length) {
    const code = input.charCodeAt(index);
    if (code === 59) return index > start ? index : -1;
    if (code < 97 || code > 122) return -1;
    index += 1;
  }
  return -1;
}

function guidePath(slug) {
  return `${docsBase}${slug}/`;
}

function resolveLink(href, guide) {
  if (/^(https?:|mailto:)/i.test(href)) return { href, external: true };
  if (href.startsWith("#")) return { href: `#${slugify(decodeURIComponent(href.slice(1)))}`, external: false };

  const [pathname, rawHash = ""] = href.split("#");
  const absolute = path.resolve(repoRoot, path.dirname(guide.file), pathname);
  const relative = normalize(path.relative(repoRoot, absolute));
  const target = byFile.get(relative.toLowerCase());
  if (target) {
    const targetPath = target.slug ? guidePath(target.slug) : docsBase;
    return { href: `${targetPath}${rawHash ? `#${slugify(decodeURIComponent(rawHash))}` : ""}`, external: false };
  }
  const asset = publicAssets.get(relative.toLowerCase());
  if (asset) return { ...asset, external: false };

  const githubPath = relative.split("/").map(encodeURIComponent).join("/");
  return { href: `https://github.com/zharwing/memory/blob/main/${githubPath}`, external: true };
}

function renderImage(alt, href, guide, loading = "lazy") {
  const resolved = resolveLink(href, guide);
  if (!resolved.width || !resolved.height) {
    return `<a href="${escapeHtml(resolved.href)}"${resolved.external ? ' target="_blank" rel="noreferrer"' : ""}>${escapeHtml(alt || "View image")}</a>`;
  }
  return `<img src="${escapeHtml(resolved.href)}" alt="${escapeHtml(alt)}" width="${resolved.width}" height="${resolved.height}" loading="${loading}" decoding="async" />`;
}

function renderInline(value, guide) {
  const tokens = [];
  let text = value.replace(/`([^`]+)`/g, (_, code) => {
    const token = `\u0000CODE${tokens.length}\u0000`;
    tokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });
  text = escapeHtml(text);
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, href) => renderImage(alt, href, guide));
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, label, href) => {
    const resolved = resolveLink(href, guide);
    return `<a href="${escapeHtml(resolved.href)}"${resolved.external ? ' target="_blank" rel="noreferrer"' : ""}>${label}</a>`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  tokens.forEach((token, index) => { text = text.replace(`\u0000CODE${index}\u0000`, token); });
  return text;
}

function parseList(lines, start, guide) {
  const first = lines[start].match(/^(\s*)([-+*]|\d+\.)\s+(.+)$/);
  const baseIndent = first[1].length;
  const ordered = /\d+\./.test(first[2]);
  const tag = ordered ? "ol" : "ul";
  const items = [];
  let index = start;
  while (index < lines.length) {
    const match = lines[index].match(/^(\s*)([-+*]|\d+\.)\s+(.+)$/);
    if (!match || match[1].length !== baseIndent || /\d+\./.test(match[2]) !== ordered) break;
    let content = match[3].trim();
    let nested = "";
    index += 1;
    while (index < lines.length) {
      const next = lines[index].match(/^(\s*)([-+*]|\d+\.)\s+(.+)$/);
      if (next && next[1].length === baseIndent) break;
      if (next && next[1].length > baseIndent) {
        const parsed = parseList(lines, index, guide);
        nested += parsed.html;
        index = parsed.index;
        continue;
      }
      if (!lines[index].trim()) { index += 1; break; }
      if (/^\s{0,3}(?:#{1,6}\s+|```)|^\|/.test(lines[index])) break;
      if (/^\s+/.test(lines[index])) { content += ` ${lines[index].trim()}`; index += 1; continue; }
      break;
    }
    items.push(`<li>${renderInline(content, guide)}${nested}</li>`);
  }
  return { html: `<${tag}>${items.join("")}</${tag}>`, index };
}

function isBlockStart(lines, index) {
  const line = lines[index] ?? "";
  return /^(#{1,6})\s+/.test(line) || /^\s{0,3}```/.test(line) || /^>\s?/.test(line) ||
    /^\s*([-+*]|\d+\.)\s+/.test(line) || /^---+$/.test(line.trim()) ||
    (/^\|.*\|\s*$/.test(line) && /^\|?\s*:?-+/.test(lines[index + 1] ?? ""));
}

function renderMarkdown(markdown, guide) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const output = [];
  const toc = [];
  const usedIds = new Map();
  let index = 0;
  let skippedTitle = false;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const level = heading[1].length;
      const label = heading[2].trim();
      if (level === 1 && !skippedTitle) { skippedTitle = true; index += 1; continue; }
      const base = slugify(label);
      const seen = usedIds.get(base) ?? 0;
      usedIds.set(base, seen + 1);
      const id = seen ? `${base}-${seen + 1}` : base;
      output.push(`<h${level} id="${id}">${renderInline(label, guide)}<a class="heading-anchor" href="#${id}" aria-label="Link to this section">#</a></h${level}>`);
      if (level === 2 || level === 3) toc.push({ level, label: cleanPublicText(label, 160), id });
      index += 1;
      continue;
    }
    const fence = line.match(/^(\s{0,3})```([^\s]*)\s*$/);
    if (fence) {
      const code = [];
      const indent = fence[1].length;
      index += 1;
      while (index < lines.length && !/^\s{0,3}```\s*$/.test(lines[index])) {
        const codeLine = lines[index];
        code.push(codeLine.slice(0, indent).trim() ? codeLine : codeLine.slice(indent));
        index += 1;
      }
      index += 1;
      output.push(`<div class="code-block"><div class="code-label"><span>${escapeHtml(fence[2] || "text")}</span><button type="button" data-copy-code>Copy</button></div><pre><code>${escapeHtml(code.join("\n"))}</code></pre></div>`);
      continue;
    }
    if (/^\|.*\|\s*$/.test(line) && /^\|?\s*:?-+/.test(lines[index + 1] ?? "")) {
      const split = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
      const headers = split(line);
      const rows = [];
      index += 2;
      while (index < lines.length && /^\|.*\|\s*$/.test(lines[index])) { rows.push(split(lines[index])); index += 1; }
      output.push(`<div class="table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell, guide)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell, guide)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    if (/^(\s*)([-+*]|\d+\.)\s+/.test(line)) {
      const parsed = parseList(lines, index, guide);
      output.push(parsed.html);
      index = parsed.index;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) { quote.push(lines[index].replace(/^>\s?/, "")); index += 1; }
      output.push(`<blockquote><p>${renderInline(quote.join(" "), guide)}</p></blockquote>`);
      continue;
    }
    if (/^---+$/.test(line.trim())) { output.push("<hr />"); index += 1; continue; }
    const image = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
    if (image) { output.push(`<figure class="doc-image">${renderImage(image[1], image[2], guide)}</figure>`); index += 1; continue; }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) { paragraph.push(lines[index].trim()); index += 1; }
    output.push(`<p>${renderInline(paragraph.join(" "), guide)}</p>`);
  }
  return { html: output.join("\n"), toc };
}

function navigation(currentSlug) {
  return groups.map((group) => `<section class="docs-nav-group"><h2>${escapeHtml(group.title)}</h2>${group.docs.map(([, slug, title, description]) => `<a href="${guidePath(slug)}"${slug === currentSlug ? ' aria-current="page" class="active"' : ""} data-search-title="${escapeHtml(`${title} ${description}`)}">${escapeHtml(title)}</a>`).join("")}</section>`).join("");
}

function mobileNavigation(currentSlug) {
  return `<details class="docs-mobile-navigation"><summary>Browse documentation</summary><nav aria-label="Documentation navigation">${navigation(currentSlug)}</nav></details>`;
}

function searchMarkup() {
  return `<div class="docs-search" role="search"><label for="docs-search-input">Search documentation</label><input id="docs-search-input" type="search" autocomplete="off" data-docs-search /><p data-search-status aria-live="polite"></p><div class="docs-search-results" data-search-results></div></div>`;
}

function shell({ title, description, slug = "", content, toc = "", sourceFile }) {
  const route = slug ? guidePath(slug) : docsBase;
  const canonical = `${publicOrigin}${route}`;
  const fullTitle = slug ? `${title} — Zharwing Memory documentation` : "Zharwing Memory documentation";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#100f0d" />
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${escapeHtml(fullTitle)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${canonical}" />
    <meta property="og:image" content="${publicOrigin}/memory/assets/dashboard.png" />
    <link rel="canonical" href="${canonical}" />
    <link rel="icon" href="/memory/assets/brand/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/memory/styles.css?v=4" />
    <link rel="stylesheet" href="/memory/docs/docs.css?v=2" />
    <title>${escapeHtml(fullTitle)}</title>
  </head>
  <body class="docs-page" data-search-index="/memory/docs/search-index.json">
    <a class="skip-link" href="#docs-content">Skip to documentation</a>
    <header class="site-header scrolled"><div class="header-inner"><a class="brand" href="/memory/"><span>Zharwing</span><span class="brand-product">Memory</span></a><nav class="site-nav docs-primary-nav" aria-label="Primary navigation"><a href="/memory/">Overview</a><a href="/memory/#quick-start">Quick start</a><a class="active" href="/memory/docs/">Documentation</a><a class="nav-github" href="https://github.com/zharwing/memory">GitHub</a></nav></div></header>
    ${mobileNavigation(slug)}
    <div class="docs-layout">
      <aside class="docs-sidebar" aria-label="Documentation"><div class="docs-sidebar-inner"><a class="docs-home-link" href="${docsBase}">Documentation home</a>${searchMarkup()}<nav class="docs-nav" aria-label="All guides">${navigation(slug)}</nav></div></aside>
      <main class="docs-main" id="docs-content">${content}</main>
      <aside class="docs-toc" aria-label="On this page"><div><h2>On this page</h2><nav>${toc || '<span class="toc-empty">Guide index</span>'}</nav>${sourceFile ? `<a class="toc-github" href="https://github.com/zharwing/memory/blob/main/${sourceFile}" target="_blank" rel="noreferrer">View source on GitHub ↗</a>` : ""}</div></aside>
    </div>
    <footer class="site-footer docs-site-footer"><div class="page-width footer-grid"><div><a class="brand" href="/memory/">Zharwing Memory</a><p>Local-first project memory for AI-assisted coding workflows.</p></div><div class="footer-links"><a href="/memory/">Overview</a><a href="/memory/docs/">Documentation</a><a href="/memory/docs/security/">Security</a><a href="https://github.com/zharwing/memory">GitHub</a></div><div class="footer-meta"><p class="footer-note">Public documentation never includes a private memory store.</p></div></div></footer>
    <script src="/memory/docs/docs.js?v=2" defer></script>
  </body>
</html>`;
}

function readingTime(markdown) {
  const words = markdown.replace(/```[\s\S]*?```/g, " ").trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

function homeContent() {
  return `<article class="doc-article docs-home-article"><header class="article-header"><p class="article-kicker">Documentation</p><h1>Use, connect, and understand Zharwing Memory.</h1><p class="article-lede">Setup, daily use, agent integration, architecture, and security — all of it here.</p></header><div class="docs-path-grid"><a class="docs-path-card" href="${guidePath("setup")}"><span>01</span><strong>Set up Memory</strong><p>Choose a local profile and start the interface you need.</p><b>Open setup →</b></a><a class="docs-path-card" href="${guidePath("mcp-setup")}"><span>02</span><strong>Connect an AI agent</strong><p>Point Codex, Claude, or another MCP client at your local Memory.</p><b>Open MCP setup →</b></a><a class="docs-path-card" href="${guidePath("architecture-decisions")}"><span>03</span><strong>Review decisions</strong><p>See why the system is built the way it is.</p><b>Open decisions →</b></a></div><section class="all-guides"><p class="article-kicker">All guides</p><h2>Browse by task.</h2><div class="all-guides-grid">${groups.map((group) => `<section><h3>${escapeHtml(group.title)}</h3>${group.docs.map(([, slug, title, description]) => `<a href="${guidePath(slug)}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></a>`).join("")}</section>`).join("")}</div></section></article>`;
}

function cleanPublicText(value, maximumLength) {
  const text = String(value).replace(/[`*_~]/g, "").replace(/\s+/g, " ").trim();
  if (!text || text.length > maximumLength || /(?:PRIVATE|SECRET|HUMAN|SAME_TYPE)_CANARY|BEGIN (?:RSA |EC )?PRIVATE KEY|[A-Za-z]:\\Users\\(?!you\b|username\b)/i.test(text)) {
    throw new Error("Unsafe or unbounded public search field.");
  }
  return text;
}

function assertManifest() {
  const slugs = new Set();
  const files = new Set();
  for (const guide of guides) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guide.slug) || slugs.has(guide.slug) || files.has(guide.file.toLowerCase())) {
      throw new Error(`Invalid or duplicate public guide: ${guide.slug}`);
    }
    slugs.add(guide.slug);
    files.add(guide.file.toLowerCase());
  }
}

await mkdir(outputDir, { recursive: true });

const rendered = [];
for (const guide of guides) {
  const source = await readFile(path.join(repoRoot, guide.file), "utf8");
  const markdown = renderMarkdown(source, guide);
  const toc = markdown.toc.map((item) => `<a class="toc-level-${item.level}" href="#${item.id}">${escapeHtml(item.label)}</a>`).join("");
  const previous = guides[guides.indexOf(guide) - 1];
  const next = guides[guides.indexOf(guide) + 1];
  const article = `<article class="doc-article"><header class="article-header"><p class="article-kicker">${escapeHtml(guide.group)}</p><h1>${escapeHtml(guide.title)}</h1><p class="article-lede">${escapeHtml(guide.description)}</p><div class="article-meta"><span>${readingTime(source)} min read</span><a href="https://github.com/zharwing/memory/blob/main/${guide.file}" target="_blank" rel="noreferrer">View source on GitHub ↗</a></div></header><details class="mobile-toc"><summary>On this page</summary><nav>${toc || '<span class="toc-empty">No subsections</span>'}</nav></details><div class="markdown-body">${markdown.html}</div><nav class="article-pagination" aria-label="Documentation pages">${previous ? `<a href="${guidePath(previous.slug)}"><span>Previous</span><strong>← ${escapeHtml(previous.title)}</strong></a>` : "<span></span>"}${next ? `<a class="next" href="${guidePath(next.slug)}"><span>Next</span><strong>${escapeHtml(next.title)} →</strong></a>` : "<span></span>"}</nav></article>`;
  const html = shell({ ...guide, content: article, toc, sourceFile: guide.file });
  const directory = path.join(outputDir, guide.slug);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), html, "utf8");
  rendered.push({ ...guide, headings: markdown.toc.map((item) => item.label) });
}

await writeFile(path.join(outputDir, "index.html"), shell({
  title: "Documentation",
  description: "Zharwing Memory setup, agent integration, architecture, security, operations, and contribution guides.",
  content: homeContent()
}), "utf8");

const searchIndex = JSON.stringify({
  schema: "zharwing.public-doc-search.v1",
  version: 1,
  guides: rendered.map((guide) => ({
    slug: guide.slug,
    path: guidePath(guide.slug),
    title: cleanPublicText(guide.title, 120),
    description: cleanPublicText(guide.description, 240),
    group: cleanPublicText(guide.group, 80),
    headings: guide.headings.slice(0, 48).map((heading) => cleanPublicText(heading, 160))
  }))
}, null, 2);
if (Buffer.byteLength(searchIndex, "utf8") > maximumSearchIndexBytes) {
  throw new Error("Public documentation search index exceeds its 128 KiB budget.");
}
await writeFile(path.join(outputDir, "search-index.json"), `${searchIndex}\n`, "utf8");

console.log(`Generated ${guides.length} directly addressable guides and a bounded public search index.`);
