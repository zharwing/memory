import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { installMcpAuto, installMcpClient } from "./install.js";

test("installs codex HTTP MCP config without auth token in none mode", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-mcp-install-"));
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
  assert.match(config, /\[mcp_servers\.zharwing-memory\]/);
  assert.match(config, /url = "http:\/\/127\.0\.0\.1:37841\/mcp"/);
  assert.doesNotMatch(config, /bearer_token_env_var/);
});

test("installs canonical Zharwing token configuration for Codex HTTP", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-mcp-install-"));
  const configPath = path.join(temp, "config.toml");

  await installMcpClient({
    client: "codex",
    transport: "http",
    authMode: "token",
    daemonUrl: "http://127.0.0.1:37841",
    configPath
  });

  const config = await fs.readFile(configPath, "utf8");
  assert.match(config, /bearer_token_env_var = "ZHARWING_MEMORY_AUTH_TOKEN"/);
  assert.doesNotMatch(config, /AIMEM_AUTH_TOKEN/);
});

test("installs canonical Zharwing environment for Codex stdio", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-mcp-install-"));
  const configPath = path.join(temp, "config.toml");

  await installMcpClient({
    client: "codex",
    transport: "stdio",
    authMode: "token",
    daemonUrl: "http://127.0.0.1:37841",
    configPath,
    nodePath: "node",
    cliEntryPath: path.join(temp, "cli.js")
  });

  const config = await fs.readFile(configPath, "utf8");
  assert.match(config, /ZHARWING_MEMORY_DAEMON_URL/);
  assert.match(config, /ZHARWING_MEMORY_AUTH_TOKEN/);
  assert.doesNotMatch(config, /AIMEM_/);
});

test("stdio install from the development CLI resolves the compiled entry", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-mcp-install-"));
  const configPath = path.join(temp, "config.toml");
  const sourceEntry = path.join(temp, "apps", "cli", "src", "index.ts");
  const compiledEntry = path.join(temp, "apps", "cli", "dist", "index.js");
  await fs.mkdir(path.dirname(sourceEntry), { recursive: true });
  await fs.mkdir(path.dirname(compiledEntry), { recursive: true });
  await fs.writeFile(sourceEntry, "", "utf8");
  await fs.writeFile(compiledEntry, "", "utf8");

  const result = await installMcpClient({
    client: "codex",
    transport: "stdio",
    authMode: "none",
    configPath,
    cliEntryPath: sourceEntry,
    nodePath: "node"
  });

  const resolvedCompiledEntry = await fs.realpath(compiledEntry);
  assert.deepEqual(result.args, [resolvedCompiledEntry, "mcp", "serve"]);
});

test("canonical install removes the legacy Codex MCP table", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-mcp-install-"));
  const configPath = path.join(temp, "config.toml");
  await fs.writeFile(configPath, [
    "[mcp_servers.aimem]",
    'command = "old-memory"',
    "",
    "[mcp_servers.keep-me]",
    'command = "keep"',
    ""
  ].join("\n"), "utf8");

  await installMcpClient({
    client: "codex",
    transport: "http",
    authMode: "none",
    configPath
  });

  const config = await fs.readFile(configPath, "utf8");
  assert.doesNotMatch(config, /\[mcp_servers\.aimem\]/);
  assert.match(config, /\[mcp_servers\.zharwing-memory\]/);
  assert.match(config, /\[mcp_servers\.keep-me\]/);
});

test("installs claude-code HTTP MCP config", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-mcp-install-"));
  const configPath = path.join(temp, ".mcp.json");

  await installMcpClient({
    client: "claude-code",
    transport: "http",
    authMode: "none",
    daemonUrl: "http://127.0.0.1:37841",
    configPath
  });

  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  assert.equal(config.mcpServers["zharwing-memory"].type, "http");
  assert.equal(config.mcpServers["zharwing-memory"].url, "http://127.0.0.1:37841/mcp");
});

test("auto install writes current working directory claude-code config", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "zharwing-mcp-auto-"));

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
  assert.equal(config.mcpServers["zharwing-memory"].url, "http://127.0.0.1:37841/mcp");
});
