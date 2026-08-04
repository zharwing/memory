import assert from "node:assert/strict";
import { test } from "node:test";
import { isLocalProviderEndpoint, isLoopbackHost } from "./net.js";

test("isLoopbackHost accepts loopback spellings and rejects others", () => {
  assert.equal(isLoopbackHost("localhost"), true);
  assert.equal(isLoopbackHost("127.0.0.1"), true);
  assert.equal(isLoopbackHost("::1"), true);
  assert.equal(isLoopbackHost("[::1]"), true);
  assert.equal(isLoopbackHost("app.localhost"), true);
  assert.equal(isLoopbackHost("example.com"), false);
  assert.equal(isLoopbackHost("192.168.1.10"), false);
});

test("isLocalProviderEndpoint checks the URL host and fails closed", () => {
  assert.equal(isLocalProviderEndpoint("http://127.0.0.1:8080/v1"), true);
  assert.equal(isLocalProviderEndpoint("http://localhost:1234"), true);
  assert.equal(isLocalProviderEndpoint("https://api.openai.com/v1"), false);
  assert.equal(isLocalProviderEndpoint("not a url"), false);
  assert.equal(isLocalProviderEndpoint(""), false);
});
