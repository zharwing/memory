import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsRoot = path.join(repoRoot, "website", "memory", "docs");
const html = await readFile(path.join(docsRoot, "index.html"), "utf8");

const errors = [];
const articleSlugs = new Set([...html.matchAll(/data-doc="([^"]+)"/g)].map((match) => match[1]));
const headingIds = new Set([...html.matchAll(/\sid="([^"]+--[^"]+)"/g)].map((match) => match[1]));

if (articleSlugs.size !== 27) {
  errors.push(`Expected 27 documentation articles, found ${articleSlugs.size}.`);
}

for (const match of html.matchAll(/href="#([^"/]+)(?:\/([^"]+))?"/g)) {
  const [, slug, section] = match;
  if (slug === "docs-content") continue;
  if (!articleSlugs.has(slug)) {
    errors.push(`Unknown documentation route: #${slug}`);
    continue;
  }
  if (section && !headingIds.has(`${slug}--${section}`)) {
    errors.push(`Unknown documentation section: #${slug}/${section}`);
  }
}

for (const match of html.matchAll(/(?:src|href)="(\.\.\/[^"#?]+)"/g)) {
  const localPath = path.resolve(docsRoot, match[1]);
  try {
    await access(localPath);
  } catch {
    errors.push(`Missing local documentation asset: ${match[1]}`);
  }
}

if (html.includes("github.com/zharwing/memory/tree/main/docs")) {
  errors.push("The generated portal still links visitors to the raw GitHub docs folder.");
}

if (!html.includes('data-docs-search') || !html.includes('data-docs-sidebar')) {
  errors.push("The generated portal is missing its search or navigation structure.");
}

if (!html.includes('class="site-footer docs-site-footer"') || !html.includes('href="https://barbutsa.com/"')) {
  errors.push("The generated portal is missing its shared page footer or author link.");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Documentation portal valid: ${articleSlugs.size} articles, ${headingIds.size} linked sections.`);
}
