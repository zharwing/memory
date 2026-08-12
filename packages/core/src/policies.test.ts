import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createProjectModel,
  privacyPolicyFor,
  visibilityOrReviewRequired
} from "./policies.js";

test("hardened privacy defaults never promote missing visibility", () => {
  assert.equal(visibilityOrReviewRequired(undefined), "review-required");
  assert.equal(visibilityOrReviewRequired("unknown"), "review-required");
  assert.equal(privacyPolicyFor("hardened-local").defaultVisibility, "review-required");
  assert.equal(
    createProjectModel({
      name: "Hardened Project",
      memoryRoot: "synthetic-memory-root",
      profile: "hardened-local"
    }).privacyPolicy.defaultVisibility,
    "review-required"
  );
});

test("personal preview compatibility is explicit and overridable", () => {
  assert.equal(privacyPolicyFor("personal-preview").defaultVisibility, "ai-eligible");
  assert.equal(
    privacyPolicyFor("hardened-local", { defaultVisibility: "ai-pinned" }).defaultVisibility,
    "ai-pinned"
  );
});
