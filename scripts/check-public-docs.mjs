import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const siteRoot = path.join(repoRoot, "website", "memory");
const docsRoot = path.join(siteRoot, "docs");
const errors = [];

const [home, docsHome, docsCss, docsScript, siteCss, siteScript, rawIndex] = await Promise.all([
  readFile(path.join(siteRoot, "index.html"), "utf8"),
  readFile(path.join(docsRoot, "index.html"), "utf8"),
  readFile(path.join(docsRoot, "docs.css"), "utf8"),
  readFile(path.join(docsRoot, "docs.js"), "utf8"),
  readFile(path.join(siteRoot, "styles.css"), "utf8"),
  readFile(path.join(siteRoot, "script.js"), "utf8"),
  readFile(path.join(docsRoot, "search-index.json"), "utf8")
]);

let searchIndex;
try {
  searchIndex = JSON.parse(rawIndex);
} catch {
  errors.push("The public search index is not valid JSON.");
}

if (Buffer.byteLength(rawIndex, "utf8") > 128 * 1024) {
  errors.push("The public search index exceeds 128 KiB.");
}

const allowedRootKeys = ["guides", "schema", "version"];
const allowedGuideKeys = ["description", "group", "headings", "path", "slug", "title"];
if (searchIndex) {
  if (searchIndex.schema !== "zharwing.public-doc-search.v1" || searchIndex.version !== 1 || !Array.isArray(searchIndex.guides)) {
    errors.push("The public search index has the wrong schema.");
  }
  if (!sameKeys(searchIndex, allowedRootKeys)) errors.push("The public search index contains an unapproved root field.");
}

const guides = Array.isArray(searchIndex?.guides) ? searchIndex.guides : [];
const slugs = new Set();
for (const guide of guides) {
  if (!sameKeys(guide, allowedGuideKeys)) errors.push(`Search entry ${guide?.slug ?? "unknown"} contains an unapproved field.`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guide?.slug ?? "") || slugs.has(guide.slug)) {
    errors.push(`Invalid or duplicate guide slug: ${guide?.slug ?? "missing"}`);
    continue;
  }
  slugs.add(guide.slug);
  if (guide.path !== `/memory/docs/${guide.slug}/`) errors.push(`Guide ${guide.slug} has a noncanonical search path.`);
  if (![guide.title, guide.description, guide.group, ...(Array.isArray(guide.headings) ? guide.headings : [])].every(isBoundedPublicText)) {
    errors.push(`Guide ${guide.slug} contains an unsafe or unbounded search field.`);
  }
}

const generatedDirectories = (await readdir(docsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const indexedDirectories = [...slugs].sort();
if (generatedDirectories.join("\0") !== indexedDirectories.join("\0")) {
  errors.push("Generated documentation directories do not exactly match the search-index manifest.");
}

if (guides.length < 30) errors.push(`Expected the complete public guide set, found ${guides.length}.`);
if (!docsHome.includes('href="/memory/docs/setup/"') || !docsHome.includes('href="/memory/docs/architecture-decisions/"')) {
  errors.push("The documentation home does not link the setup and decision paths.");
}

const pages = [{ route: "/memory/docs/", file: path.join(docsRoot, "index.html"), html: docsHome }];
for (const guide of guides) {
  const file = path.join(docsRoot, guide.slug, "index.html");
  let html = "";
  try {
    html = await readFile(file, "utf8");
  } catch {
    errors.push(`Missing direct guide page: ${guide.path}`);
    continue;
  }
  pages.push({ route: guide.path, file, html });
  if (!html.includes(`<link rel="canonical" href="https://zharwing.barbutsa.com${guide.path}"`)) {
    errors.push(`Guide ${guide.slug} has incorrect canonical metadata.`);
  }
  if (!html.includes(`<h1>${escapeForLiteral(guide.title)}</h1>`)) errors.push(`Guide ${guide.slug} is missing its page title.`);
}

for (const page of pages) {
  const label = path.relative(repoRoot, page.file).replaceAll("\\", "/");
  if (!/<meta name="description" content="[^"]+"/.test(page.html) || !/<meta property="og:title" content="[^"]+"/.test(page.html)) {
    errors.push(`${label} is missing page metadata.`);
  }
  if (/<(?:main|article|nav)\b[^>]*\shidden(?:\s|>|=)/i.test(page.html)) {
    errors.push(`${label} hides essential content or navigation before JavaScript.`);
  }
  if (!page.html.includes("<details class=\"docs-mobile-navigation\"") || !page.html.includes("<summary>Browse documentation</summary>")) {
    errors.push(`${label} is missing native mobile documentation navigation.`);
  }
  if (/<p>\s*```|```\s*<\/p>|<p>``<code>/i.test(page.html)) {
    errors.push(`${label} contains an unrendered fenced code block.`);
  }
  for (const image of page.html.matchAll(/<img\b[^>]*>/gi)) {
    if (!/\bwidth="\d+"/.test(image[0]) || !/\bheight="\d+"/.test(image[0])) {
      errors.push(`${label} contains an image without intrinsic dimensions.`);
    }
  }
  checkPrivateData(page.html, label);
  await checkLinks(page);
}

for (const [label, source] of [
  ["website/memory/index.html", home],
  ["website/memory/docs/index.html", docsHome],
  ["website/memory/docs/search-index.json", rawIndex]
]) checkPrivateData(source, label);

if (!home.includes("<select data-tour-select>") || !home.includes('data-tour-panel="graph"')) {
  errors.push("The public product tour is missing its native enhanced screenshot selector or default screenshot gallery.");
}
if (/<img\b(?:(?!\bwidth="\d+").)*>/gis.test(home) || /<img\b(?:(?!\bheight="\d+").)*>/gis.test(home)) {
  errors.push("The public home page contains an image without intrinsic dimensions.");
}
if (!siteCss.includes('.js .reveal[data-reveal-ready="true"]') || !siteScript.includes('document.documentElement.classList.add("js")')) {
  errors.push("Reveal effects are not gated behind the JavaScript capability class.");
}
if (!siteCss.includes(".js .site-nav") || !siteCss.includes(".js .menu-button")) {
  errors.push("Mobile primary navigation does not retain its default-visible no-JavaScript mode.");
}
if (!docsScript.includes("search-index.json") && !docsScript.includes("dataset.searchIndex")) {
  errors.push("The documentation search enhancement is not connected to the bounded public index.");
}
if (/\.doc-article\[hidden\]|showRoute\(|window\.location\.hash\.slice/.test(`${docsCss}\n${docsScript}`)) {
  errors.push("Legacy hash-routed hidden documentation remains reachable.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Public docs valid: ${guides.length} direct guides, default-visible navigation, bounded sanitized search.`);
}

function sameKeys(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function isBoundedPublicText(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 240 &&
    !/(?:PRIVATE|SECRET|HUMAN|SAME_TYPE)_CANARY|BEGIN (?:RSA |EC )?PRIVATE KEY|[A-Za-z]:\\Users\\(?!you\b|username\b)/i.test(value);
}

function checkPrivateData(source, label) {
  const forbidden = [
    /(?:PRIVATE|SECRET|HUMAN|SAME_TYPE)_CANARY/i,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    /[A-Za-z]:\\Users\\(?!you\b|username\b)/i,
    /\/(?:Users|home)\/(?!you\b|username\b)[^/\s"'<]+\/(?:\.ssh|\.aws|\.config)\//i,
    /authorization\s*[:=]\s*["']?Bearer\s+[A-Za-z0-9._~+\/-]{16,}/i
  ];
  if (forbidden.some((pattern) => pattern.test(source))) errors.push(`${label} contains a private-data canary or credential-shaped value.`);
}

async function checkLinks(page) {
  const ids = new Set([...page.html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
  for (const match of page.html.matchAll(/href="([^"]+)"/g)) {
    const href = match[1];
    if (/^(?:https?:|mailto:)/i.test(href)) continue;
    if (href.startsWith("#")) {
      if (!ids.has(decodeURIComponent(href.slice(1)))) errors.push(`${page.route} links to missing section ${href}.`);
      continue;
    }
    if (!href.startsWith("/memory/")) continue;
    const [pathname] = href.split(/[?#]/);
    const relative = pathname.slice("/memory/".length);
    const local = path.join(siteRoot, relative);
    const candidate = pathname.endsWith("/") ? path.join(local, "index.html") : local;
    try { await access(candidate); } catch { errors.push(`${page.route} links to missing local target ${href}.`); }
  }
}

function escapeForLiteral(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
