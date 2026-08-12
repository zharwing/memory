import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AsyncRegion, Progress } from "../components/AccessibleStatus.js";
import { ErrorSummary, Field } from "../components/FormField.js";
import { ToggleGroup } from "../components/ToggleGroup.js";

test("measured progress and indeterminate work expose different semantics", () => {
  const measured = renderToStaticMarkup(<Progress label="Documents" value={4} max={10} />);
  const indeterminate = renderToStaticMarkup(<Progress label="Connecting" detail="Waiting for the local service" />);

  assert.match(measured, /role="progressbar"/);
  assert.match(measured, /aria-valuenow="4"/);
  assert.doesNotMatch(indeterminate, /role="progressbar"/);
  assert.match(indeterminate, /role="status"/);
});

test("initial loading cannot render authoritative empty copy", () => {
  const markup = renderToStaticMarkup(
    <AsyncRegion status="loading" label="Projects" empty={<p>No projects</p>} />
  );
  assert.match(markup, /Loading Projects/);
  assert.doesNotMatch(markup, /No projects/);
});

test("fields and summaries expose linked validation contracts", () => {
  const field = renderToStaticMarkup(
    <Field label="Project name" help="Use a memorable name" error="Enter a project name" required>
      <input id="project-name" />
    </Field>
  );
  const summary = renderToStaticMarkup(
    <ErrorSummary errors={[{ id: "project-name", message: "Enter a project name" }]} />
  );

  assert.match(field, /for="project-name"/);
  assert.match(field, /aria-invalid="true"/);
  assert.match(field, /aria-describedby="project-name-help project-name-error"/);
  assert.match(summary, /tabindex="-1"/);
  assert.match(summary, /href="#project-name"/);
});

test("single selection uses a radiogroup with one roving tab stop", () => {
  const markup = renderToStaticMarkup(
    <ToggleGroup
      value="review"
      onChange={() => undefined}
      options={[{ value: "review", label: "Review" }, { value: "auto", label: "Automatic" }]}
      className="segmented-control"
      ariaLabel="Review mode"
    />
  );

  assert.match(markup, /role="radiogroup"/);
  assert.match(markup, /role="radio" aria-checked="true" tabindex="0"/);
  assert.match(markup, /role="radio" aria-checked="false" tabindex="-1"/);
});
