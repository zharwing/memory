import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const desktopRoot = path.join(repoRoot, "apps", "desktop");
const sourceRoot = path.join(desktopRoot, "src");
const tokenPath = path.join(sourceRoot, "styles", "00-semantic-tokens.css");
const retiredRuntimeTokenPath = path.join(sourceRoot, "styles", "theme-tokens.ts");
const failures = [];

const requiredTokens = [
  "background", "surface", "surface-raised", "surface-sunken", "overlay",
  "text", "text-muted", "text-disabled", "border", "border-strong",
  "accent", "on-accent", "accent-subtle", "on-accent-subtle",
  "danger", "on-danger", "danger-subtle", "on-danger-subtle",
  "success", "on-success", "success-subtle", "on-success-subtle",
  "warning", "on-warning", "warning-subtle", "on-warning-subtle",
  "information", "on-information", "information-subtle", "on-information-subtle",
  "focus-ring", "focus-offset", "space-1", "space-12", "font-body",
  "type-body", "line-body", "radius-medium", "shadow-dialog", "layer-dialog",
  "motion-fast", "motion-normal", "ease-standard", "focus-width"
];

const contrastPairs = [
  ["text", "background"], ["text", "surface"],
  ["text-muted", "background"], ["text-muted", "surface"],
  ["text-disabled", "surface"], ["on-accent", "accent"],
  ["on-accent-subtle", "accent-subtle"], ["on-danger", "danger"],
  ["on-danger-subtle", "danger-subtle"], ["on-success", "success"],
  ["on-success-subtle", "success-subtle"], ["on-warning", "warning"],
  ["on-warning-subtle", "warning-subtle"], ["on-information", "information"],
  ["on-information-subtle", "information-subtle"]
];

const html = read(path.join(desktopRoot, "index.html"));
if (!/<html\s+lang="en"\s+dir="ltr">/i.test(html)) {
  failures.push("apps/desktop/index.html must declare the English/LTR support boundary.");
}

const globalCss = read(path.join(sourceRoot, "styles", "global.css"));
if (globalCss.indexOf("00-semantic-tokens.css") > globalCss.indexOf("01-base.css") || !globalCss.includes("00-semantic-tokens.css")) {
  failures.push("Static semantic tokens must load before base/component styles.");
}
if (fs.existsSync(retiredRuntimeTokenPath)) {
  failures.push("styles/theme-tokens.ts is retired; semantic tokens must remain static CSS.");
}

const tokenCss = read(tokenPath);
const lightBlock = tokenCss.slice(0, tokenCss.indexOf("@media (prefers-color-scheme: dark)"));
const darkStart = tokenCss.lastIndexOf(':root[data-theme="dark"]');
const darkBlock = darkStart >= 0 ? tokenCss.slice(darkStart) : "";
for (const [themeName, block] of [["light", lightBlock], ["dark", darkBlock]]) {
  const values = cssVariables(block);
  for (const token of requiredTokens) {
    if (!values.has(token) && !tokenCss.includes(`--${token}:`)) failures.push(`${themeName} theme is missing --${token}.`);
  }
  for (const [foreground, background] of contrastPairs) {
    const foregroundValue = values.get(foreground);
    const backgroundValue = values.get(background);
    if (!foregroundValue || !backgroundValue) {
      failures.push(`${themeName} contrast pair ${foreground}/${background} is not a literal checked color.`);
      continue;
    }
    const ratio = contrastRatio(foregroundValue, backgroundValue);
    if (ratio < 4.5) failures.push(`${themeName} ${foreground}/${background} contrast is ${ratio.toFixed(2)}; expected at least 4.5.`);
  }
}

for (const file of walk(sourceRoot)) {
  const relative = path.relative(repoRoot, file).replaceAll("\\", "/");
  const content = read(file);
  if (/injectThemeStyles|data-theme-tokens|createElement\(["']style/.test(content)) {
    failures.push(`${relative}: runtime theme stylesheet construction is forbidden.`);
  }
  if (/tabIndex\s*=\s*(?:\{\s*[1-9]\d*\s*\}|["'][1-9]\d*["'])/.test(content)) {
    failures.push(`${relative}: positive tabIndex is forbidden.`);
  }
  if (/outline\s*:\s*(?:none|0)\b/i.test(content)) {
    failures.push(`${relative}: focus outline suppression is forbidden.`);
  }
  if (relative.endsWith(".css") && !relative.endsWith("00-semantic-tokens.css") && /#[0-9a-f]{3,8}\b|rgba?\(/i.test(content)) {
    failures.push(`${relative}: raw component color/elevation bypasses semantic tokens.`);
  }
  if (relative.endsWith(".tsx")) {
    for (const match of content.matchAll(/<button\b([^>]*)>/g)) {
      const attributes = match[1];
      if (/className=["'][^"']*icon-only/.test(attributes) && !/aria-label=/.test(attributes)) {
        failures.push(`${relative}: icon-only controls require an accessible name or the IconButton contract.`);
      }
    }
  }
  const isTestSource = relative.includes("/testing/") || relative.endsWith(".test.tsx");
  if (relative.endsWith(".tsx") && !isTestSource && /role=["']progressbar["']/.test(content) && !relative.endsWith("AccessibleStatus.tsx")) {
    failures.push(`${relative}: measured progress must use the shared Progress contract.`);
  }
  if (!relative.endsWith("utils/format.ts") && /\.toLocale(?:String|DateString|TimeString)|new\s+Intl\.(?:DateTimeFormat|NumberFormat|RelativeTimeFormat)/.test(content)) {
    failures.push(`${relative}: localized presentation bypasses utils/format.ts.`);
  }
}

const destructiveConfirmation = read(path.join(sourceRoot, "components", "ConfirmDeleteButton.tsx"));
if (/do not ask again|delete\.confirm\.skip|readString\s*\(|writeString\s*\(/i.test(destructiveConfirmation)) {
  failures.push("ConfirmDeleteButton.tsx: destructive confirmation cannot be bypassed by a persisted preference.");
}

if (failures.length) {
  console.error("Frontend accessibility contract failed:");
  for (const failure of [...new Set(failures)].sort()) console.error(`  - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Frontend accessibility source contract passed: ${contrastPairs.length * 2} contrast pairs checked.`);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function walk(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else if (/\.(?:css|ts|tsx)$/.test(entry.name)) files.push(fullPath);
  }
  return files;
}

function cssVariables(block) {
  const values = new Map();
  for (const match of block.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-f]{6}|[^;]+)\s*;/gi)) {
    values.set(match[1], match[2].trim());
  }
  return values;
}

function contrastRatio(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function luminance(hex) {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
