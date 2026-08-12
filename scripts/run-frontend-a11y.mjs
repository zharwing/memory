import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const command = "node scripts/run-frontend-a11y.mjs";
const missing = [];

for (const dependency of ["@playwright/test", "axe-core"]) {
  try {
    require.resolve(dependency);
  } catch {
    missing.push(dependency);
  }
}

function defer(reason, detail) {
  console.error(JSON.stringify({
    status: "deferred_platform_validation",
    check: "axe-focused-scans",
    command,
    reason,
    detail
  }));
  process.exit(2);
}

if (missing.length > 0) {
  defer("separately_owner_approved_dependencies_absent", { missing });
}

const baseUrl = process.env.ZHARWING_FRONTEND_TEST_URL;
if (!baseUrl) {
  defer("controlled_frontend_runtime_absent", {
    requiredEnvironment: "ZHARWING_FRONTEND_TEST_URL",
    example: "http://127.0.0.1:5174"
  });
}

const { chromium } = await import("@playwright/test");
const axePath = require.resolve("axe-core/axe.min.js");
const routes = ["/", "/sessions", "/docs", "/inbox", "/workstreams", "/graph", "/assistant"];
const browser = await chromium.launch({ headless: true });
const violations = [];

try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  for (const route of routes) {
    const url = new URL(route, baseUrl).href;
    await page.goto(url, { waitUntil: "networkidle" });
    await page.addScriptTag({ path: axePath });
    const result = await page.evaluate(async () => globalThis.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }
    }));
    for (const violation of result.violations) {
      violations.push({ route, id: violation.id, impact: violation.impact, nodes: violation.nodes.length });
    }
  }
  await context.close();
} finally {
  await browser.close();
}

if (violations.length > 0) {
  console.error(JSON.stringify({ status: "failed", check: "axe-focused-scans", violations }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({ status: "passed", check: "axe-focused-scans", routes }));
