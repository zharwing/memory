import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installMcpAuto, installMcpClient } from "./install.js";

test("installs codex HTTP MCP config without auth token in none mode", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "aimem-mcp-install-"));
  const configPath = path.join(temp, "config.toml");

  const result = await installMcpClient({
    client: "codex",
    transport: "http",
    authMode: "none",
    daemonUrl: "http://127.0.0.1:37841",
    configPath
  });

  const config = await fs.readFile(configPath, "utf8");
  assert.equal(result.changed, true);
  assert.match(config, /\[mcp_servers\.aimem\]/);
  assert.match(config, /url = "http:\/\/127\.0\.0\.1:37841\/mcp"/);
  assert.doesNotMatch(config, /bearer_token_env_var/);
});

test("installs claude-code HTTP MCP config", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "aimem-mcp-install-"));
  const configPath = path.join(temp, ".mcp.json");

  await installMcpClient({
    client: "claude-code",
    transport: "http",
    authMode: "none",
    daemonUrl: "http://127.0.0.1:37841",
    configPath
  });

  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  assert.equal(config.mcpServers.aimem.type, "http");
  assert.equal(config.mcpServers.aimem.url, "http://127.0.0.1:37841/mcp");
});

test("auto install writes current working directory claude-code config", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "aimem-mcp-auto-"));

  const result = await installMcpAuto({
    clients: ["claude-code"],
    transport: "http",
    authMode: "none",
    daemonUrl: "http://127.0.0.1:37841",
    workingDirectory: temp
  });

  const config = JSON.parse(await fs.readFile(path.join(temp, ".mcp.json"), "utf8"));
  assert.equal(result.client, "auto");
  assert.equal(result.installs.length, 1);
  assert.equal(result.installs[0].scope, "current-os");
  assert.equal(config.mcpServers.aimem.url, "http://127.0.0.1:37841/mcp");
});
