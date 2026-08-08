import assert from "node:assert/strict";
import test from "node:test";
import { formatMarkdown, parseMarkdown } from "./markdown.js";

test("quoted Windows paths remain stable across repeated Markdown round trips", () => {
  const workingDirectory = String.raw`C:\Users\RUNNER~1\AppData\Local\Temp\zharwing-memory`;
  const original = formatMarkdown({ working_directory: workingDirectory }, "# Session\n");
  let markdown = original;

  for (let iteration = 0; iteration < 1_000; iteration += 1) {
    const parsed = parseMarkdown(markdown);
    assert.equal(parsed.frontmatter.working_directory, workingDirectory);
    markdown = formatMarkdown(parsed.frontmatter, parsed.body);
  }

  assert.equal(markdown, original);
});
