import { strict as assert } from "node:assert";
import test from "node:test";
import { inspectRawDocumentMarkdown, materializeDocumentId } from "./document-markdown.js";

test("document markdown identifies CRLF frontmatter without fixed offsets", () => {
  const raw = "\uFEFF---\r\ncomment: keep\r\nid: \"doc-stored\"\r\n---\r\n# Body\r\n";
  const inspected = inspectRawDocumentMarkdown(raw);
  assert.equal(inspected.hasFrontmatter, true);
  assert.equal(inspected.eol, "\r\n");
  assert.equal(inspected.id, "doc-stored");
  assert.equal(inspected.idFieldCount, 1);
  assert.equal(raw.slice(inspected.frontmatterEnd), "# Body\r\n");
});

test("identity materialization inserts only a missing field and preserves BOM/EOL/body", () => {
  const raw = inspectRawDocumentMarkdown("\uFEFF---\r\ntitle: Existing\r\n---\r\nbody\r\n");
  assert.equal(
    materializeDocumentId(raw, "doc-new" as never),
    "\uFEFF---\r\nid: doc-new\r\ntitle: Existing\r\n---\r\nbody\r\n"
  );
});

test("blank and duplicate owned IDs are reported rather than duplicated", () => {
  const blank = inspectRawDocumentMarkdown("---\nid:\n---\nbody");
  assert.equal(blank.idFieldCount, 1);
  assert.equal(materializeDocumentId(blank, "doc-new" as never), blank.raw);
  const duplicate = inspectRawDocumentMarkdown("---\nid: first\nid: second\n---\nbody");
  assert.equal(duplicate.idFieldCount, 2);
  assert.equal(materializeDocumentId(duplicate, "doc-new" as never), duplicate.raw);
});
