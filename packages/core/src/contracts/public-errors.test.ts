import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PUBLIC_ERROR_REGISTRY,
  createPublicError,
  isPublicError,
  publicErrorSchema,
  type PublicErrorCode
} from "./public-errors.js";

test("every registered public error round-trips through the closed decoder", () => {
  for (const code of Object.keys(PUBLIC_ERROR_REGISTRY) as PublicErrorCode[]) {
    const expected = PUBLIC_ERROR_REGISTRY[code];
    const error = createPublicError(code);
    assert.deepEqual(error, { code, ...expected });
    assert.deepEqual(publicErrorSchema.parse(error, `${code}.error`), error);
    assert.equal(isPublicError(error), true);
  }
});

test("the public-error decoder rejects unregistered codes and arbitrary fields", () => {
  const valid = createPublicError("validation");
  assert.throws(() => publicErrorSchema.parse({ ...valid, code: "made_up" }), /code/);
  assert.throws(() => publicErrorSchema.parse({ ...valid, privatePath: "C:\\secret" }), /privatePath/);
  assert.equal(isPublicError({ ...valid, stack: "private diagnostic" }), false);
});

test("error code, message id, category, and retry policy cannot be mixed", () => {
  const validation = createPublicError("validation");
  const internal = createPublicError("internal");

  for (const mismatch of [
    { ...validation, messageId: internal.messageId },
    { ...validation, category: internal.category },
    { ...validation, retry: createPublicError("timeout").retry }
  ]) {
    assert.throws(
      () => publicErrorSchema.parse(mismatch, "response.error"),
      /canonical validation public error/
    );
    assert.equal(isPublicError(mismatch), false);
  }
});

test("field errors are restricted to owned message ids", () => {
  const error = createPublicError("validation", {
    fieldErrors: { projectId: "operation.validation" },
    debugId: "debug-123"
  });
  assert.deepEqual(publicErrorSchema.parse(error), error);
  assert.throws(() =>
    publicErrorSchema.parse({
      ...error,
      fieldErrors: { projectId: "Project identifier is invalid" }
    })
  );
});
