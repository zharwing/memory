import { strict as assert } from "node:assert";
import test from "node:test";
import { deriveLegacyDocumentId, normalizedDocumentRelativePath } from "./document-identity.js";

const project = { id: "legacy-project", memoryRoot: "/tmp/zharwing-project" } as never;

test("legacy document identity is stable for normalized relative paths", () => {
  assert.equal(normalizedDocumentRelativePath(project, "docs\\A\u030A.md"), "docs/Å.md".normalize("NFC"));
  assert.match(deriveLegacyDocumentId(project, "/tmp/zharwing-project/docs/readme.md"), /^doc-legacy-[0-9a-f]{32}$/);
});

test("document identity rejects traversal and outside-root paths", () => {
  for (const filePath of ["../escape.md", "docs/../../escape.md", "/tmp/other.md", "C:/other.md", "//server/share.md"]) {
    assert.throws(() => normalizedDocumentRelativePath(project, filePath));
  }
});
