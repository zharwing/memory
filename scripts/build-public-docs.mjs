import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = path.join(repoRoot, "website", "memory", "docs");

const groups = [
  {
    title: "Start here",
    docs: [
      ["README.md", "project-overview", "Project overview", "What Memory does, how it is organized, and the fastest way to start."],
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
    title: "Technical reference",
    docs: [
      ["docs/ARCHITECTURE.md", "architecture", "Architecture", "See the local daemon, adapters, packages, and trust boundaries."],
      ["docs/DATA_MODEL.md", "data-model", "Data model", "Understand projects, sessions, documents, graph data, and storage."],
      ["docs/API_REFERENCE.md", "api-reference", "API reference", "Reference the local HTTP, JSON-RPC, and MCP surfaces."],
      ["docs/DIAGRAMS.md", "diagrams", "System diagrams", "Review the main component, data, and interaction diagrams."]
    ]
  },
  {
    title: "Operate and contribute",
    docs: [
      ["docs/OPERATIONS.md", "operations", "Operations", "Run, package, back up, restore, and troubleshoot Memory."],
      ["docs/AI_TESTING.md", "ai-testing", "AI provider testing", "Test local and external model-backed workflows safely."],
      ["docs/TESTING_PLAN.md", "testing-plan", "Testing plan", "See the testing strategy and expected coverage."],
      ["SECURITY.md", "security", "Security", "Understand the local trust model and report vulnerabilities."],
      ["CONTRIBUTING.md", "contributing", "Contributing", "Set up the repository and follow the contribution workflow."]
    ]
  }
];

const docs = groups.flatMap((group) =>
  group.docs.map(([file, slug, title, description]) => ({ file, slug, title, description, group: group.title }))
);

const byFile = new Map();
for (const doc of docs) {
  byFile.set(normalize(doc.file).toLowerCase(), doc);
}
byFile.set("docs/readme.md", { slug: "home" });

function normalize(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z]+;/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "section";
}

function resolveLink(href, doc) {
  if (/^(https?:|mailto:)/i.test(href)) {
    return { href, external: true };
  }

  if (href.startsWith("#")) {
    const section = slugify(decodeURIComponent(href.slice(1)));
    return { href: `#${doc.slug}/${section}`, external: false };
  }

  const [pathname, rawHash = ""] = href.split("#");
  const absolute = path.resolve(repoRoot, path.dirname(doc.file), pathname);
  const relative = normalize(path.relative(repoRoot, absolute));
  const target = byFile.get(relative.toLowerCase());
  if (target) {
    const section = rawHash ? `/${slugify(decodeURIComponent(rawHash))}` : "";
    return { href: `#${target.slug}${section}`, external: false };
  }

  if (relative.toLowerCase() === "docs/assets/zharwing-memory-dashboard.png") {
    return { href: "../assets/dashboard.png", external: false };
  }
  if (relative.toLowerCase() === "docs/assets/zharwing-memory-current-work.png") {
    return { href: "../assets/zharwing-memory-current-work.png", external: false };
  }

  const githubPath = relative.split("/").map(encodeURIComponent).join("/");
  return {
    href: `https://github.com/zharwing/memory/blob/main/${githubPath}`,
    external: true
  };
}

function renderInline(value, doc) {
  const tokens = [];
  let text = value.replace(/`([^`]+)`/g, (_, code) => {
    const token = `\u0000CODE${tokens.length}\u0000`;
    tokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  text = escapeHtml(text);
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, alt, href) => {
    const resolved = resolveLink(href, doc);
    return `<img src="${escapeHtml(resolved.href)}" alt="${escapeHtml(alt)}" loading="lazy" />`;
  });
  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (_, label, href) => {
    const resolved = resolveLink(href, doc);
    const attributes = resolved.external ? ' target="_blank" rel="noreferrer"' : "";
    return `<a href="${escapeHtml(resolved.href)}"${attributes}>${label}</a>`;
  });
  text = text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");

  for (let index = 0; index < tokens.length; index += 1) {
    text = text.replace(`\u0000CODE${index}\u0000`, tokens[index]);
  }
  return text;
}

function parseList(lines, start, doc) {
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
      const nextList = lines[index].match(/^(\s*)([-+*]|\d+\.)\s+(.+)$/);
      if (nextList && nextList[1].length === baseIndent) break;
      if (nextList && nextList[1].length > baseIndent) {
        const result = parseList(lines, index, doc);
        nested += result.html;
        index = result.index;
        continue;
      }
      if (!lines[index].trim()) {
        index += 1;
        if (lines[index]?.match(/^(\s*)([-+*]|\d+\.)\s+(.+)$/)) continue;
        break;
      }
      if (/^(#{1,6})\s+|^```|^\|/.test(lines[index])) break;
      if (lines[index].match(/^\s+/)) {
        content += ` ${lines[index].trim()}`;
        index += 1;
        continue;
      }
      break;
    }

    items.push(`<li>${renderInline(content, doc)}${nested}</li>`);
  }

  return { html: `<${tag}>${items.join("")}</${tag}>`, index };
}

function isBlockStart(lines, index) {
  const line = lines[index] ?? "";
  return (
    /^(#{1,6})\s+/.test(line) ||
    /^```/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*([-+*]|\d+\.)\s+/.test(line) ||
    /^---+$/.test(line.trim()) ||
    (/^\|.*\|\s*$/.test(line) && /^\|?\s*:?-+/.test(lines[index + 1] ?? ""))
  );
}

function renderMarkdown(markdown, doc) {
  const lines = markdown.replaceAll("\r\n", "\n").split("\n");
  const output = [];
  const toc = [];
  const usedIds = new Map();
  let index = 0;
  let skippedTitle = false;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (heading) {
      const level = heading[1].length;
      const label = heading[2].trim();
      if (level === 1 && !skippedTitle) {
        skippedTitle = true;
        index += 1;
        continue;
      }
      const baseId = slugify(label);
      const seen = usedIds.get(baseId) ?? 0;
      usedIds.set(baseId, seen + 1);
      const section = seen ? `${baseId}-${seen + 1}` : baseId;
      const id = `${doc.slug}--${section}`;
      output.push(`<h${level} id="${id}">${renderInline(label, doc)}<a class="heading-anchor" href="#${doc.slug}/${section}" aria-label="Link to this section">#</a></h${level}>`);
      if (level === 2 || level === 3) toc.push({ level, label: label.replace(/[`*_]/g, ""), section });
      index += 1;
      continue;
    }

    const fence = line.match(/^```([^\s]*)\s*$/);
    if (fence) {
      const language = fence[1] || "text";
      const code = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      output.push(`<div class="code-block"><div class="code-label"><span>${escapeHtml(language)}</span><button type="button" data-copy-code>Copy</button></div><pre><code>${escapeHtml(code.join("\n"))}</code></pre></div>`);
      continue;
    }

    if (/^\|.*\|\s*$/.test(line) && /^\|?\s*:?-+/.test(lines[index + 1] ?? "")) {
      const rows = [];
      const splitRow = (row) => row.trim().replace(/^\||\|$/g, "").split("|").map((cell) => cell.trim());
      const headers = splitRow(line);
      index += 2;
      while (index < lines.length && /^\|.*\|\s*$/.test(lines[index])) {
        rows.push(splitRow(lines[index]));
        index += 1;
      }
      output.push(`<div class="table-wrap"><table><thead><tr>${headers.map((cell) => `<th>${renderInline(cell, doc)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell, doc)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }

    const list = line.match(/^(\s*)([-+*]|\d+\.)\s+(.+)$/);
    if (list) {
      const result = parseList(lines, index, doc);
      output.push(result.html);
      index = result.index;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      output.push(`<blockquote>${renderInline(quote.join(" "), doc)}</blockquote>`);
      continue;
    }

    if (/^---+$/.test(line.trim())) {
      output.push("<hr />");
      index += 1;
      continue;
    }

    const image = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/);
    if (image) {
      const resolved = resolveLink(image[2], doc);
      output.push(`<figure class="doc-image"><img src="${escapeHtml(resolved.href)}" alt="${escapeHtml(image[1])}" loading="lazy" /></figure>`);
      index += 1;
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    output.push(`<p>${renderInline(paragraph.join(" "), doc)}</p>`);
  }

  return { html: output.join("\n"), toc };
}

function readingTime(markdown) {
  const words = markdown.replace(/```[\s\S]*?```/g, " ").trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

function homeArticle() {
  return `
    <section class="docs-welcome">
      <p class="article-kicker">Documentation</p>
      <h1>Learn Zharwing Memory without digging through repository files.</h1>
      <p class="article-lede">Start the local interface, connect an AI coding agent, or understand the system design. Every project guide is organized here and remains available in the open-source repository.</p>
      <div class="docs-path-grid">
        <a class="docs-path-card" href="#browser-ui">
          <span>01</span><strong>Use the interface</strong>
          <p>Run the daemon and browser UI, create a project, and begin a session.</p><b>Open Browser UI →</b>
        </a>
        <a class="docs-path-card" href="#mcp-setup">
          <span>02</span><strong>Connect an AI agent</strong>
          <p>Expose the bounded Memory tools to Codex, Claude, or another MCP client.</p><b>Open MCP setup →</b>
        </a>
        <a class="docs-path-card" href="#architecture">
          <span>03</span><strong>Understand the system</strong>
          <p>Review the local-first architecture, storage model, APIs, and trust boundaries.</p><b>Open Architecture →</b>
        </a>
      </div>
      <div class="quick-command-panel">
        <div>
          <p class="article-kicker">Fastest local start</p>
          <h2>Two terminals, one local interface.</h2>
          <p>Install dependencies once, then run the daemon and browser UI side by side. The public website never reads or hosts your private memory.</p>
        </div>
        <div class="quick-command-list">
          <div><span>Terminal 1</span><code>corepack pnpm dev:daemon</code></div>
          <div><span>Terminal 2</span><code>corepack pnpm dev:web</code></div>
          <div><span>Open</span><code>http://localhost:5174/</code></div>
        </div>
      </div>
      <div class="docs-note"><strong>Developer preview</strong><p>Memory is useful today, but it is still an early public release. Read the <a href="#developer-preview">developer preview boundary</a> before relying on it for critical work.</p></div>
      <div class="all-guides">
        <p class="article-kicker">All guides</p>
        <h2>Browse by what you need to do.</h2>
        <div class="all-guides-grid">
          ${groups.map((group) => `<section><h3>${escapeHtml(group.title)}</h3>${group.docs.map(([, slug, title, description]) => `<a href="#${slug}"><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></a>`).join("")}</section>`).join("")}
        </div>
      </div>
    </section>`;
}

const renderedDocs = [];
for (const doc of docs) {
  const source = await readFile(path.join(repoRoot, doc.file), "utf8");
  const rendered = renderMarkdown(source, doc);
  renderedDocs.push({ ...doc, source, ...rendered, minutes: readingTime(source) });
}

const sidebar = groups
  .map((group) => `<section class="docs-nav-group"><h2>${escapeHtml(group.title)}</h2>${group.docs.map(([, slug, title, description]) => `<a href="#${slug}" data-doc-link data-title="${escapeHtml(title)}" data-description="${escapeHtml(description)}"><span>${escapeHtml(title)}</span></a>`).join("")}</section>`)
  .join("\n");

const articles = renderedDocs
  .map((doc, index) => {
    const previous = renderedDocs[index - 1];
    const next = renderedDocs[index + 1];
    const sourceUrl = `https://github.com/zharwing/memory/blob/main/${doc.file}`;
    const toc = doc.toc.map((item) => `<a class="toc-level-${item.level}" href="#${doc.slug}/${item.section}">${escapeHtml(item.label)}</a>`).join("");
    return `<article class="doc-article" data-doc="${doc.slug}" data-search="${escapeHtml(`${doc.title} ${doc.description}`.toLowerCase())}" hidden>
      <header class="article-header">
        <p class="article-kicker">${escapeHtml(doc.group)}</p>
        <h1>${escapeHtml(doc.title)}</h1>
        <p class="article-lede">${escapeHtml(doc.description)}</p>
        <div class="article-meta"><span>${doc.minutes} min read</span><a href="${sourceUrl}" target="_blank" rel="noreferrer">View source on GitHub ↗</a></div>
      </header>
      <div class="mobile-toc" data-mobile-toc><button type="button" aria-expanded="false">On this page <span>⌄</span></button><nav>${toc || '<span class="toc-empty">No subsections</span>'}</nav></div>
      <div class="markdown-body">${doc.html}</div>
      <nav class="article-pagination" aria-label="Documentation pages">
        ${previous ? `<a href="#${previous.slug}"><span>Previous</span><strong>← ${escapeHtml(previous.title)}</strong></a>` : "<span></span>"}
        ${next ? `<a class="next" href="#${next.slug}"><span>Next</span><strong>${escapeHtml(next.title)} →</strong></a>` : "<span></span>"}
      </nav>
      <template data-toc>${toc}</template>
    </article>`;
  })
  .join("\n");

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#100f0d" />
    <meta name="description" content="Complete Zharwing Memory documentation: setup, browser and desktop UI, MCP, agent workflows, architecture, APIs, security, and operations." />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="Zharwing Memory documentation" />
    <meta property="og:description" content="Learn how to run, use, connect, and understand the local-first memory layer for AI coding sessions." />
    <meta property="og:url" content="https://zharwing.barbutsa.com/memory/docs/" />
    <meta property="og:image" content="https://zharwing.barbutsa.com/memory/assets/dashboard.png" />
    <link rel="canonical" href="https://zharwing.barbutsa.com/memory/docs/" />
    <link rel="icon" href="../assets/brand/favicon.svg" type="image/svg+xml" />
    <link rel="icon" href="../assets/brand/favicon-32.png" sizes="32x32" type="image/png" />
    <link rel="apple-touch-icon" href="../assets/brand/apple-touch-icon.png" />
    <link rel="stylesheet" href="../styles.css?v=3" />
    <link rel="stylesheet" href="docs.css?v=1" />
    <title>Zharwing Memory documentation</title>
  </head>
  <body class="docs-page">
    <a class="skip-link" href="#docs-content">Skip to documentation</a>
    <header class="site-header scrolled" data-header>
      <div class="header-inner">
        <a class="brand" href="/memory/" aria-label="Zharwing Memory home"><span>Zharwing</span><span class="brand-product">Memory</span></a>
        <button class="menu-button" type="button" aria-expanded="false" aria-controls="site-nav"><span class="sr-only">Open navigation</span><span></span><span></span><span></span></button>
        <nav class="site-nav" id="site-nav" aria-label="Primary navigation">
          <a href="/memory/">Overview</a><a href="/memory/#tour">Product tour</a><a href="/memory/#quick-start">Quick start</a><a class="active" href="/memory/docs/">Documentation</a><a class="nav-github" href="https://github.com/zharwing/memory">GitHub</a>
        </nav>
      </div>
    </header>
    <div class="docs-mobile-bar"><button type="button" data-sidebar-toggle aria-expanded="false"><span>Browse documentation</span><b>☰</b></button></div>
    <div class="docs-layout">
      <aside class="docs-sidebar" data-docs-sidebar>
        <div class="docs-sidebar-inner">
          <a class="docs-home-link" href="#home"><span>Documentation home</span><b>⌂</b></a>
          <label class="docs-search"><span class="sr-only">Search documentation</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m21 21-4.35-4.35m2.35-5.4A7.75 7.75 0 1 1 3.5 11.25a7.75 7.75 0 0 1 15.5 0Z" /></svg><input type="search" placeholder="Search documentation" autocomplete="off" data-docs-search /></label>
          <p class="docs-search-status" data-search-status aria-live="polite"></p>
          <nav class="docs-nav" aria-label="Documentation navigation">${sidebar}</nav>
          <div class="docs-sidebar-footer"><span>Open-source developer preview</span><a href="https://github.com/zharwing/memory">GitHub ↗</a></div>
        </div>
      </aside>
      <main class="docs-main" id="docs-content">
        <article class="doc-article docs-home-article" data-doc="home">${homeArticle()}</article>
        ${articles}
      </main>
      <aside class="docs-toc" aria-label="On this page"><div><h2>On this page</h2><nav data-active-toc><span class="toc-empty">Choose a guide to see its sections.</span></nav><a class="toc-github" data-edit-link href="https://github.com/zharwing/memory" target="_blank" rel="noreferrer">View on GitHub ↗</a></div></aside>
    </div>
    <div class="sidebar-backdrop" data-sidebar-backdrop></div>
    <script src="docs.js?v=1"></script>
  </body>
</html>`;

await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "index.html"), html, "utf8");
console.log(`Generated ${renderedDocs.length + 1} documentation pages in website/memory/docs/index.html`);
