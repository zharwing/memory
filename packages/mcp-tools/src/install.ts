import { execFileSync } from "node:child_process";
import { existsSync, promises as fs, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { handleMcpRequest } from "./server.js";

export type McpClientTarget = "codex" | "claude-code" | "claude-desktop";
export type McpInstallTarget = McpClientTarget | "auto";
export type McpInstallTransport = "http" | "stdio";
export type McpInstallScope = "current-os" | "windows-from-wsl";

export interface McpInstallOptions {
  client: McpClientTarget;
  transport?: McpInstallTransport;
  configPath?: string;
  daemonUrl?: string;
  authMode?: "none" | "token" | "auto";
  serverName?: string;
  workingDirectory?: string;
  nodePath?: string;
  cliEntryPath?: string;
  dryRun?: boolean;
  scope?: McpInstallScope;
}

export interface McpInstallResult {
  client: McpClientTarget;
  scope: McpInstallScope;
  serverName: string;
  transport: McpInstallTransport;
  configPath: string;
  backupPath?: string;
  changed: boolean;
  restartRequired: boolean;
  command?: string;
  args?: string[];
  url?: string;
  warnings: string[];
}

export interface McpAutoInstallOptions extends Omit<McpInstallOptions, "client" | "configPath" | "scope"> {
  clients?: McpClientTarget[];
  configPaths?: Partial<Record<McpClientTarget, string>>;
  includeWindowsFromWsl?: boolean;
}

export interface McpAutoInstallResult {
  client: "auto";
  environment: McpEnvironmentInfo;
  installs: McpInstallResult[];
  skipped: Array<{
    client: McpClientTarget;
    scope: McpInstallScope;
    reason: string;
  }>;
  warnings: string[];
  restartRequired: boolean;
}

export interface McpEnvironmentInfo {
  platform: NodeJS.Platform;
  osLabel: "windows" | "macos" | "linux" | "wsl" | "other";
  isWsl: boolean;
  homeDir: string;
  workingDirectory: string;
  windowsFromWsl?: {
    available: boolean;
    userProfile?: string;
    appData?: string;
    codexConfigPath?: string;
    claudeDesktopConfigPath?: string;
    message?: string;
  };
}

export interface McpDoctorResult {
  daemon: {
    url: string;
    reachable: boolean;
    authMode?: string;
    message?: string;
  };
  stdio: {
    ok: boolean;
    toolCount: number;
    message?: string;
  };
  configs: Array<{
    client: McpClientTarget;
    configPath: string;
    exists: boolean;
    hasZharwingMemory: boolean;
    hasLegacyCliAlias: boolean;
  }>;
}

export async function installMcpClient(options: McpInstallOptions): Promise<McpInstallResult> {
  const serverName = options.serverName || "zharwing-memory";
  const daemonUrl = trimTrailingSlash(
    options.daemonUrl ||
      process.env.ZHARWING_MEMORY_DAEMON_URL ||
      process.env.AIMEM_DAEMON_URL ||
      "http://127.0.0.1:37841"
  );
  const health = await readDaemonHealth(daemonUrl);
  const envAuthMode = process.env.ZHARWING_MEMORY_AUTH_MODE ?? process.env.AIMEM_AUTH_MODE;
  const authMode = options.authMode && options.authMode !== "auto"
    ? options.authMode
    : health.authMode === "none" || envAuthMode === "none"
      ? "none"
      : "token";
  const transport = options.transport || "http";
  const configPath = options.configPath
    ? path.resolve(options.configPath)
    : defaultConfigPath(options.client, options.workingDirectory || process.cwd());
  const entry = await runtimeCliEntry(options.cliEntryPath);
  const nodePath = options.nodePath || process.execPath;
  const warnings: string[] = [];

  if (transport === "http" && !health.reachable) {
    warnings.push(`Daemon was not reachable at ${daemonUrl}; config was written but clients will fail until the daemon is running.`);
  }
  if (transport === "http" && authMode === "token") {
    warnings.push("Daemon reports token auth; clients must have ZHARWING_MEMORY_AUTH_TOKEN in their environment or switch local daemon to ZHARWING_MEMORY_AUTH_MODE=none.");
  }

  const serverConfig = transport === "http"
    ? httpServerConfig(options.client, `${daemonUrl}/mcp`, authMode)
    : stdioServerConfig(options.client, nodePath, [entry, "mcp", "serve"], daemonUrl, authMode);

  const existing = await readTextIfExists(configPath);
  const next = options.client === "codex"
    ? updateCodexConfig(existing || "", serverName, serverConfig)
    : updateJsonMcpConfig(existing || "", serverName, serverConfig);
  const changed = next !== (existing || "");
  const backupPath = changed && existing && !options.dryRun ? await backupFile(configPath, existing) : undefined;

  if (changed && !options.dryRun) {
    await fs.mkdir(path.dirname(configPath), { recursive: true });
    await fs.writeFile(configPath, next, "utf8");
  }

  return {
    client: options.client,
    scope: options.scope || "current-os",
    serverName,
    transport,
    configPath,
    backupPath,
    changed,
    restartRequired: true,
    command: transport === "stdio" ? nodePath : undefined,
    args: transport === "stdio" ? [entry, "mcp", "serve"] : undefined,
    url: transport === "http" ? `${daemonUrl}/mcp` : undefined,
    warnings
  };
}

export async function installMcpAuto(options: McpAutoInstallOptions = {}): Promise<McpAutoInstallResult> {
  const workingDirectory = options.workingDirectory || process.cwd();
  const environment = detectMcpEnvironment(workingDirectory);
  const clients: McpClientTarget[] = options.clients?.length ? options.clients : ["codex", "claude-code", "claude-desktop"];
  const warnings: string[] = [];
  const skipped: McpAutoInstallResult["skipped"] = [];
  const installs: McpInstallResult[] = [];

  for (const client of clients) {
    const configPath = options.configPaths?.[client];
    try {
      installs.push(await installMcpClient({
        ...options,
        client,
        configPath,
        workingDirectory,
        scope: "current-os"
      }));
    } catch (error) {
      skipped.push({
        client,
        scope: "current-os",
        reason: error instanceof Error ? error.message : String(error)
      });
    }
  }

  if (environment.isWsl && options.includeWindowsFromWsl !== false) {
    const windowsConfigs: Array<{ client: McpClientTarget; configPath?: string }> = [
      { client: "codex", configPath: environment.windowsFromWsl?.codexConfigPath },
      { client: "claude-desktop", configPath: environment.windowsFromWsl?.claudeDesktopConfigPath }
    ];

    if (!environment.windowsFromWsl?.available) {
      warnings.push(environment.windowsFromWsl?.message || "Windows config paths were not detected from WSL.");
    }

    for (const candidate of windowsConfigs) {
      if (!clients.includes(candidate.client)) continue;
      if (!candidate.configPath) {
        skipped.push({
          client: candidate.client,
          scope: "windows-from-wsl",
          reason: "Windows config path was not detected from WSL."
        });
        continue;
      }
      try {
        installs.push(await installMcpClient({
          ...options,
          client: candidate.client,
          configPath: candidate.configPath,
          workingDirectory,
          scope: "windows-from-wsl"
        }));
      } catch (error) {
        skipped.push({
          client: candidate.client,
          scope: "windows-from-wsl",
          reason: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  if (process.platform === "win32") {
    warnings.push("Windows configs were installed from Windows. Run `zharwing-memory mcp install auto` inside WSL separately for WSL-hosted clients.");
  }

  return {
    client: "auto",
    environment,
    installs,
    skipped,
    warnings,
    restartRequired: installs.some((install) => install.restartRequired)
  };
}

export async function doctorMcpSetup(options: { daemonUrl?: string; workingDirectory?: string } = {}): Promise<McpDoctorResult> {
  const daemonUrl = trimTrailingSlash(
    options.daemonUrl ||
      process.env.ZHARWING_MEMORY_DAEMON_URL ||
      process.env.AIMEM_DAEMON_URL ||
      "http://127.0.0.1:37841"
  );
  const health = await readDaemonHealth(daemonUrl);
  const stdio = await smokeTestStdioHandler();
  const workingDirectory = options.workingDirectory || process.cwd();
  const configs = await Promise.all((["codex", "claude-code", "claude-desktop"] as McpClientTarget[]).map(async (client) => {
    const configPath = defaultConfigPath(client, workingDirectory);
    const text = await readTextIfExists(configPath);
    return {
      client,
      configPath,
      exists: text !== undefined,
      hasZharwingMemory: Boolean(text?.includes("zharwing-memory")),
      hasLegacyCliAlias: Boolean(text?.includes("aimem"))
    };
  }));
  return { daemon: health, stdio, configs };
}

export function defaultConfigPath(client: McpClientTarget, workingDirectory: string): string {
  if (client === "codex") {
    return path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "config.toml");
  }
  if (client === "claude-code") {
    return path.join(workingDirectory, ".mcp.json");
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }
  return path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json");
}

export function detectMcpEnvironment(workingDirectory = process.cwd()): McpEnvironmentInfo {
  const isWsl = detectWsl();
  const osLabel = process.platform === "win32"
    ? "windows"
    : process.platform === "darwin"
      ? "macos"
      : isWsl
        ? "wsl"
        : process.platform === "linux"
          ? "linux"
          : "other";
  return {
    platform: process.platform,
    osLabel,
    isWsl,
    homeDir: os.homedir(),
    workingDirectory,
    windowsFromWsl: isWsl ? detectWindowsFromWsl() : undefined
  };
}

function detectWsl(): boolean {
  if (process.platform !== "linux") return false;
  if (process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP) return true;
  try {
    return readFileSync("/proc/version", "utf8").toLowerCase().includes("microsoft");
  } catch {
    return false;
  }
}

function detectWindowsFromWsl(): McpEnvironmentInfo["windowsFromWsl"] {
  try {
    const env = readWindowsEnvFromWsl();
    const userProfile = env.USERPROFILE || (env.HOMEDRIVE && env.HOMEPATH ? `${env.HOMEDRIVE}${env.HOMEPATH}` : undefined);
    const appData = env.APPDATA;
    const userProfilePath = userProfile ? windowsPathToLocalPath(userProfile) : undefined;
    const appDataPath = appData ? windowsPathToLocalPath(appData) : undefined;
    return {
      available: Boolean(userProfilePath || appDataPath),
      userProfile: userProfilePath,
      appData: appDataPath,
      codexConfigPath: userProfilePath ? path.join(userProfilePath, ".codex", "config.toml") : undefined,
      claudeDesktopConfigPath: appDataPath ? path.join(appDataPath, "Claude", "claude_desktop_config.json") : undefined,
      message: userProfilePath || appDataPath ? undefined : "Windows environment variables were not available from WSL."
    };
  } catch (error) {
    return {
      available: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

function readWindowsEnvFromWsl(): Record<string, string> {
  const output = execFileSync("cmd.exe", ["/C", "set"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    timeout: 3000
  });
  const env: Record<string, string> = {};
  for (const line of output.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0) continue;
    env[line.slice(0, index).toUpperCase()] = line.slice(index + 1).trim();
  }
  return env;
}

function windowsPathToLocalPath(windowsPath: string): string | undefined {
  try {
    const converted = execFileSync("wslpath", ["-u", windowsPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000
    }).trim();
    if (converted) return converted;
  } catch {
    // Fall through to the common WSL automount shape.
  }

  const normalized = windowsPath.replace(/\\/g, "/");
  const match = /^([a-zA-Z]):\/(.*)$/.exec(normalized);
  if (!match) return undefined;
  const candidate = `/mnt/${match[1].toLowerCase()}/${match[2]}`;
  return existsSync(path.parse(candidate).root) || candidate.startsWith("/mnt/") ? candidate : undefined;
}

async function runtimeCliEntry(cliEntryPath?: string): Promise<string> {
  const candidate = cliEntryPath || process.argv[1] || fileURLToPath(import.meta.url);
  let resolved: string;
  try {
    resolved = await fs.realpath(candidate);
  } catch {
    resolved = path.resolve(candidate);
  }

  if (path.basename(resolved) === "index.ts" && path.basename(path.dirname(resolved)) === "src") {
    const compiled = path.join(path.dirname(path.dirname(resolved)), "dist", "index.js");
    if (!existsSync(compiled)) {
      throw new Error("Stdio MCP setup requires the compiled CLI. Run `pnpm build:ts` first.");
    }
    return fs.realpath(compiled);
  }
  return resolved;
}

function httpServerConfig(client: McpClientTarget, url: string, authMode: "none" | "token"): Record<string, unknown> {
  if (client === "codex") {
    return authMode === "token"
      ? { url, bearer_token_env_var: "ZHARWING_MEMORY_AUTH_TOKEN" }
      : { url };
  }
  return authMode === "token"
    ? { type: "http", url, headers: { Authorization: "Bearer ${ZHARWING_MEMORY_AUTH_TOKEN}" } }
    : { type: "http", url };
}

function stdioServerConfig(
  client: McpClientTarget,
  command: string,
  args: string[],
  daemonUrl: string,
  authMode: "none" | "token"
): Record<string, unknown> {
  const env: Record<string, string> = { ZHARWING_MEMORY_DAEMON_URL: daemonUrl };
  if (authMode === "token") env.ZHARWING_MEMORY_AUTH_TOKEN = "${ZHARWING_MEMORY_AUTH_TOKEN}";
  if (client === "codex") {
    return authMode === "token"
      ? { command, args, env: { ZHARWING_MEMORY_DAEMON_URL: daemonUrl }, env_vars: ["ZHARWING_MEMORY_AUTH_TOKEN"] }
      : { command, args, env: { ZHARWING_MEMORY_DAEMON_URL: daemonUrl } };
  }
  return { type: "stdio", command, args, env };
}

function updateCodexConfig(existing: string, serverName: string, config: Record<string, unknown>): string {
  const migrated = serverName === "zharwing-memory" ? removeCodexMcpTable(existing, "aimem") : existing;
  const tableHeader = `[mcp_servers.${serverName}]`;
  const tableBody = `${tableHeader}\n${tomlEntries(config)}\n`;
  const pattern = new RegExp(`(^|\\n)\\[mcp_servers\\.${escapeRegExp(serverName)}\\][\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`);
  if (pattern.test(migrated)) {
    return ensureTrailingNewline(migrated.replace(pattern, `$1${tableBody.trimEnd()}`));
  }
  return ensureTrailingNewline(`${migrated.trimEnd()}\n\n${tableBody}`.trimStart());
}

function updateJsonMcpConfig(existing: string, serverName: string, config: Record<string, unknown>): string {
  const parsed = existing.trim() ? JSON.parse(existing) as Record<string, any> : {};
  parsed.mcpServers = parsed.mcpServers && typeof parsed.mcpServers === "object" ? parsed.mcpServers : {};
  if (serverName === "zharwing-memory") delete parsed.mcpServers.aimem;
  parsed.mcpServers[serverName] = config;
  return `${JSON.stringify(parsed, null, 2)}\n`;
}

function removeCodexMcpTable(config: string, serverName: string): string {
  const pattern = new RegExp(`(^|\\n)\\[mcp_servers\\.${escapeRegExp(serverName)}\\][\\s\\S]*?(?=\\n\\[[^\\n]+\\]|$)`);
  return config.replace(pattern, "$1").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function tomlEntries(config: Record<string, unknown>): string {
  return Object.entries(config).map(([key, value]) => `${key} = ${tomlValue(value)}`).join("\n");
}

function tomlValue(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(", ")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .map(([key, nested]) => `${key} = ${tomlValue(nested)}`)
      .join(", ");
    return `{ ${entries} }`;
  }
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  return JSON.stringify(String(value));
}

async function readDaemonHealth(daemonUrl: string): Promise<McpDoctorResult["daemon"]> {
  try {
    const response = await fetch(`${daemonUrl}/health`);
    const payload = await response.json() as Record<string, unknown>;
    return {
      url: daemonUrl,
      reachable: response.ok,
      authMode: String(payload.authMode || ""),
      message: response.ok ? undefined : `HTTP ${response.status}`
    };
  } catch (error) {
    return {
      url: daemonUrl,
      reachable: false,
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

async function smokeTestStdioHandler(): Promise<McpDoctorResult["stdio"]> {
  const response = await handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} });
  const tools = Array.isArray((response?.result as any)?.tools) ? (response?.result as any).tools : [];
  return {
    ok: tools.some((tool: Record<string, unknown>) => tool.name === "memory.get_startup_state"),
    toolCount: tools.length
  };
}

async function readTextIfExists(filePath: string): Promise<string | undefined> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function backupFile(filePath: string, contents: string): Promise<string> {
  const backupPath = `${filePath}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  await fs.writeFile(backupPath, contents, "utf8");
  return backupPath;
}

function trimTrailingSlash(input: string): string {
  return input.replace(/\/+$/, "");
}

function ensureTrailingNewline(input: string): string {
  return input.endsWith("\n") ? input : `${input}\n`;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function commandExists(command: string): boolean {
  try {
    execFileSync(process.platform === "win32" ? "where" : "which", [command], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
