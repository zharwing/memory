import { PROVIDER_DEFAULTS } from "@zharwing/memory-core";
import { AsyncLocalStorage } from "node:async_hooks";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";

const MAX_PROVIDER_RESPONSE_BYTES = 4 * 1024 * 1024;

export type AiChatRole = "system" | "user" | "assistant";

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface OpenAiCompatibleProviderConfig {
  endpoint: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
  providerKind?: AiProviderKind | string;
}

export type AiProviderKind =
  | "openai-compatible"
  | "custom-openai-compatible"
  | "lm-studio"
  | "llama-cpp"
  | "llama.cpp"
  | "ollama"
  | "openai"
  | "anthropic"
  | "claude"
  | "codex";

export interface AiProviderConfig extends OpenAiCompatibleProviderConfig {
  providerKind?: AiProviderKind | string;
}

export interface JsonCompletionOptions {
  schemaName?: string;
  retryOnInvalidJson?: boolean;
  signal?: AbortSignal;
}

export interface JsonCompletionResult<T = unknown> {
  value: T;
  rawText: string;
  attempts: number;
  model?: string;
  usage?: unknown;
}

export interface ProviderCheckResult {
  ok: boolean;
  endpoint: string;
  model: string;
  modelDisplayName?: string;
  availableModels?: string[];
  latencyMs: number;
  message: string;
}

interface AuthorizedProviderTarget {
  readonly url: URL;
  readonly protocol: "http:" | "https:";
  readonly hostname: string;
  readonly address: string;
  readonly family: 4 | 6;
  readonly port: string;
  readonly origin: string;
}

export interface AuthorizedProviderRequestTarget {
  readonly url: string;
  readonly protocol: "http:" | "https:";
  readonly hostname: string;
  readonly address: string;
  readonly family: 4 | 6;
  readonly port: string;
}

export type AuthorizedProviderRequest = (
  target: AuthorizedProviderRequestTarget,
  init: RequestInit
) => Promise<Response>;

const authorizedProviderRequestContext = new AsyncLocalStorage<AuthorizedProviderRequest>();

/**
 * Scopes a native-request substitute to one async test flow. Endpoint parsing,
 * DNS/address authorization, response limits, and redirect denial remain in
 * the production path around the substitute.
 */
export function runWithAuthorizedProviderRequestForTesting<T>(
  request: AuthorizedProviderRequest,
  invoke: () => T
): T {
  return authorizedProviderRequestContext.run(request, invoke);
}

/**
 * Provider egress is authorized for one exact destination. Redirects are
 * surfaced rather than followed so a provider cannot bounce credentials or
 * private content to a second host. The native request connects to the exact vetted address
 * while preserving the original Host/TLS server name, so DNS cannot be
 * resolved a second time between authorization and the socket connection.
 */
async function authorizedProviderFetch(
  input: string | URL,
  init: RequestInit
): Promise<Response> {
  const target = await authorizeProviderTarget(input);
  const request = authorizedProviderRequestContext.getStore();
  const response = request
    ? await request(Object.freeze({
        url: target.url.href,
        protocol: target.protocol,
        hostname: target.hostname,
        address: target.address,
        family: target.family,
        port: target.port
      }), init)
    : await requestAuthorizedProviderTarget(target, init);
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (location) {
      const redirected = new URL(location, target.origin);
      const redirectTarget = await authorizeProviderTarget(redirected);
      if (
        redirectTarget.protocol !== target.protocol ||
        redirectTarget.hostname !== target.hostname ||
        redirectTarget.port !== target.port
      ) {
        throw new Error("Provider redirect changed the authorized destination.");
      }
    }
    throw new Error("Provider redirects are not followed.");
  }
  return response;
}

async function authorizeProviderTarget(input: string | URL): Promise<AuthorizedProviderTarget> {
  const url = input instanceof URL ? new URL(input.toString()) : new URL(input);
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error("Provider target must be a credential-free HTTP(S) URL.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLocaleLowerCase();
  if (isForbiddenProviderHostname(hostname)) {
    throw new Error("Provider target resolves to a forbidden private or metadata address.");
  }
  let address = hostname;
  const literalFamily = isIP(hostname);
  let family: 4 | 6;
  if (literalFamily === 4 || literalFamily === 6) {
    family = literalFamily;
  } else {
    const addresses = await lookup(hostname, { all: true, verbatim: true });
    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => isForbiddenProviderHostname(address.toLocaleLowerCase()))
    ) {
      throw new Error("Provider DNS resolved to a forbidden private or metadata address.");
    }
    const selected = addresses[0]!;
    if (selected.family !== 4 && selected.family !== 6) {
      throw new Error("Provider DNS returned an unsupported address family.");
    }
    address = selected.address;
    family = selected.family;
  }
  return {
    url,
    protocol: url.protocol,
    hostname,
    address,
    family,
    port: url.port || (url.protocol === "https:" ? "443" : "80"),
    origin: url.origin
  };
}

function requestAuthorizedProviderTarget(
  target: AuthorizedProviderTarget,
  init: RequestInit
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const requestHeaders = new Headers(init.headers);
    requestHeaders.set("host", target.url.host);
    const body = providerRequestBody(init.body);
    if (body && !requestHeaders.has("content-length")) {
      requestHeaders.set("content-length", String(body.byteLength));
    }
    const nodeHeaders: Record<string, string> = {};
    requestHeaders.forEach((value, name) => {
      nodeHeaders[name] = value;
    });
    const client = target.protocol === "https:" ? https : http;
    const request = client.request({
      protocol: target.protocol,
      hostname: target.address,
      family: target.family,
      port: Number(target.port),
      path: `${target.url.pathname}${target.url.search}`,
      method: init.method || "GET",
      headers: nodeHeaders,
      ...(target.protocol === "https:" ? { servername: target.hostname } : {})
    }, (incoming) => {
      const chunks: Buffer[] = [];
      let total = 0;
      incoming.on("data", (chunk: Buffer) => {
        total += chunk.byteLength;
        if (total > MAX_PROVIDER_RESPONSE_BYTES) {
          incoming.destroy(new Error("Provider response exceeded the byte limit."));
          return;
        }
        chunks.push(Buffer.from(chunk));
      });
      incoming.on("end", () => {
        const headers = new Headers();
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (Array.isArray(value)) value.forEach((entry) => headers.append(name, entry));
          else if (value !== undefined) headers.set(name, String(value));
        }
        resolve(new Response(Buffer.concat(chunks), {
          status: incoming.statusCode || 500,
          statusText: incoming.statusMessage,
          headers
        }));
      });
      incoming.on("error", reject);
    });
    request.on("error", reject);
    if (init.signal) {
      const abort = () => request.destroy(new Error("Provider request aborted."));
      if (init.signal.aborted) abort();
      else init.signal.addEventListener("abort", abort, { once: true });
      request.once("close", () => init.signal?.removeEventListener("abort", abort));
    }
    if (body) request.write(body);
    request.end();
  });
}

function providerRequestBody(body: BodyInit | null | undefined): Buffer | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (ArrayBuffer.isView(body)) return Buffer.from(body.buffer, body.byteOffset, body.byteLength);
  throw new Error("Provider request body type is unsupported.");
}

function isForbiddenProviderHostname(hostname: string): boolean {
  if (["metadata.google.internal", "metadata", "instance-data"].includes(hostname)) return true;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((value) => value > 255)) return true;
    const [a, b] = octets;
    // Loopback is intentionally allowed for local providers; all other
    // non-routable/metadata literal ranges are denied.
    return a === 0 || a === 10 || a === 100 && b >= 64 && b <= 127 ||
      a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 ||
      a === 192 && b === 168 || a >= 224;
  }
  const normalizedIpv6 = hostname.replace(/^\[|\]$/g, "");
  if (normalizedIpv6 === "::1") return false;
  const mappedIpv4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(normalizedIpv6);
  if (mappedIpv4) return isForbiddenProviderHostname(mappedIpv4[1]!);
  return normalizedIpv6.includes(":") && (
    normalizedIpv6 === "::" ||
    normalizedIpv6.startsWith("ff") ||
    normalizedIpv6.startsWith("fe8") || normalizedIpv6.startsWith("fe9") ||
    normalizedIpv6.startsWith("fea") || normalizedIpv6.startsWith("feb") ||
    normalizedIpv6.startsWith("fc") || normalizedIpv6.startsWith("fd")
  );
}

async function readBoundedProviderText(response: Response): Promise<string> {
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader) {
    const declaredLength = Number(lengthHeader);
    if (!Number.isSafeInteger(declaredLength) || declaredLength < 0 || declaredLength > MAX_PROVIDER_RESPONSE_BYTES) {
      throw new Error("Provider response exceeded the byte limit.");
    }
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_PROVIDER_RESPONSE_BYTES) {
        throw new Error("Provider response exceeded the byte limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

interface OpenAiChatCompletionResponse {
  model?: string;
  choices?: OpenAiChatChoice[];
  usage?: unknown;
}

interface OpenAiChatChoice {
  finish_reason?: string;
  text?: string;
  message?: {
    content?: string | Array<string | { text?: string; type?: string }>;
    reasoning_content?: string;
  };
}

interface ProviderModelsResponse {
  data?: unknown[];
  models?: unknown[];
}

interface ModelInfo {
  id: string;
  displayName?: string;
  loaded?: boolean;
}

interface LmStudioModelResponse {
  models?: Array<{
    type?: string;
    key?: string;
    display_name?: string;
    loaded_instances?: Array<{
      id?: string;
    }>;
  }>;
}

interface OllamaChatResponse {
  model?: string;
  message?: {
    content?: string;
  };
  response?: string;
}

interface AnthropicMessageResponse {
  model?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  usage?: unknown;
}

type TextCompletionResult = { rawText: string; model?: string; usage?: unknown };

const ANTHROPIC_VERSION = "2023-06-01";

export async function callOpenAiCompatibleJson<T = unknown>(
  config: OpenAiCompatibleProviderConfig,
  messages: AiChatMessage[],
  options: JsonCompletionOptions = {}
): Promise<JsonCompletionResult<T>> {
  const retryOnInvalidJson = options.retryOnInvalidJson ?? true;
  const first = await callOpenAiCompatibleText(config, messages, options.signal);
  const parsed = parseJsonObjectFromText(first.rawText);
  if (parsed.ok) {
    return {
      value: parsed.value as T,
      rawText: first.rawText,
      attempts: 1,
      model: first.model,
      usage: first.usage
    };
  }

  if (!retryOnInvalidJson) {
    throw new Error(`Provider returned invalid JSON${options.schemaName ? ` for ${options.schemaName}` : ""}: ${parsed.error}`);
  }

  const repaired = await callOpenAiCompatibleText(
    config,
    [
      ...messages,
      {
        role: "assistant",
        content: first.rawText.slice(0, 6000)
      },
      {
        role: "user",
        content: [
          "The previous response was not valid JSON.",
          options.schemaName ? `Return a corrected ${options.schemaName} JSON object.` : "Return a corrected JSON object.",
          "Return only JSON. Do not include Markdown fences or commentary."
        ].join(" ")
      }
    ],
    options.signal
  );
  const repairedParsed = parseJsonObjectFromText(repaired.rawText);
  if (!repairedParsed.ok) {
    throw new Error(`Provider returned invalid JSON after retry${options.schemaName ? ` for ${options.schemaName}` : ""}: ${repairedParsed.error}`);
  }

  return {
    value: repairedParsed.value as T,
    rawText: repaired.rawText,
    attempts: 2,
    model: repaired.model,
    usage: repaired.usage
  };
}

export async function callAiProviderJson<T = unknown>(
  config: AiProviderConfig,
  messages: AiChatMessage[],
  options: JsonCompletionOptions = {}
): Promise<JsonCompletionResult<T>> {
  const retryOnInvalidJson = options.retryOnInvalidJson ?? true;
  const first = await callAiProviderText(config, messages, options.signal);
  const parsed = parseJsonObjectFromText(first.rawText);
  if (parsed.ok) {
    return {
      value: parsed.value as T,
      rawText: first.rawText,
      attempts: 1,
      model: first.model,
      usage: first.usage
    };
  }

  if (!retryOnInvalidJson) {
    throw new Error(`Provider returned invalid JSON${options.schemaName ? ` for ${options.schemaName}` : ""}: ${parsed.error}`);
  }

  const repaired = await callAiProviderText(
    config,
    [
      ...messages,
      {
        role: "assistant",
        content: first.rawText.slice(0, 6000)
      },
      {
        role: "user",
        content: [
          "The previous response was not valid JSON.",
          options.schemaName ? `Return a corrected ${options.schemaName} JSON object.` : "Return a corrected JSON object.",
          "Return only JSON. Do not include Markdown fences or commentary."
        ].join(" ")
      }
    ],
    options.signal
  );
  const repairedParsed = parseJsonObjectFromText(repaired.rawText);
  if (!repairedParsed.ok) {
    throw new Error(`Provider returned invalid JSON after retry${options.schemaName ? ` for ${options.schemaName}` : ""}: ${repairedParsed.error}`);
  }

  return {
    value: repairedParsed.value as T,
    rawText: repaired.rawText,
    attempts: 2,
    model: repaired.model,
    usage: repaired.usage
  };
}

export async function checkOpenAiCompatibleProvider(
  config: OpenAiCompatibleProviderConfig
): Promise<ProviderCheckResult> {
  const started = Date.now();
  const availableModels = await listOpenAiCompatibleModels(config).catch(() => []);
  const model = config.model?.trim() || availableModels[0];
  if (!model) {
    throw new Error("Model name is required because the provider did not return any models.");
  }
  const result = await callOpenAiCompatibleJson<{ ok?: boolean; message?: string }>(
    {
      ...config,
      model,
      maxOutputTokens: providerCheckMaxOutputTokens(config.maxOutputTokens),
      temperature: 0
    },
    providerCheckMessages(),
    { schemaName: "provider check", retryOnInvalidJson: true }
  );

  return {
    ok: Boolean(result.value.ok),
    endpoint: openAiChatCompletionsUrl(config.endpoint),
    model: result.model || model,
    availableModels,
    latencyMs: Date.now() - started,
    message: result.value.message || "Provider responded with JSON."
  };
}

export async function checkAiProvider(
  config: AiProviderConfig
): Promise<ProviderCheckResult> {
  const providerKind = normalizeAiProviderKind(config.providerKind);
  if (providerKind === "codex") {
    throw new Error("Codex is not a standalone AI provider endpoint for document analysis. Use OpenAI API or an OpenAI-compatible local server.");
  }
  if (providerKind === "lm-studio") return checkLmStudioProvider(config);
  if (providerKind === "ollama") return checkNativeOllamaProvider(config);
  if (providerKind === "anthropic") return checkAnthropicProvider(config);
  return checkOpenAiCompatibleProvider({
    ...config,
    endpoint: openAiCompatibleDefaultEndpoint(config, providerKind)
  });
}

export async function listOpenAiCompatibleModels(
  config: Pick<OpenAiCompatibleProviderConfig, "endpoint" | "apiKey" | "timeoutMs">
): Promise<string[]> {
  const errors: string[] = [];
  for (const url of providerModelsUrls(config.endpoint)) {
    try {
      const models = await fetchProviderModels(url, config);
      if (models.length) return models;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  throw new Error(errors[0] || "Provider did not return any models.");
}

export async function listAiProviderModels(
  config: Pick<AiProviderConfig, "endpoint" | "apiKey" | "timeoutMs" | "providerKind">
): Promise<string[]> {
  const providerKind = normalizeAiProviderKind(config.providerKind);
  if (providerKind === "codex") {
    throw new Error("Codex is not a standalone AI provider endpoint for document analysis. Use OpenAI API or an OpenAI-compatible local server.");
  }
  if (providerKind === "lm-studio") {
    const models = await listLmStudioModelInfo(config).catch(() => []);
    if (models.length) return models.map((model) => model.id);
  }
  if (providerKind === "ollama") return fetchProviderModels(ollamaApiUrl(config.endpoint, "tags"), config);
  if (providerKind === "anthropic") return fetchAnthropicModels(config);
  return listOpenAiCompatibleModels({
    ...config,
    endpoint: openAiCompatibleDefaultEndpoint(config, providerKind)
  });
}

async function fetchProviderModels(
  url: string,
  config: Pick<OpenAiCompatibleProviderConfig, "apiKey" | "timeoutMs">
): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 10000);
  try {
    const headers: Record<string, string> = {};
    if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

    const response = await authorizedProviderFetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });

    const raw = await readBoundedProviderText(response);
    if (!response.ok) {
      throw new Error(`Provider models request failed ${response.status}: ${raw.slice(0, 500)}`);
    }

    return modelIdsFromProviderModels(JSON.parse(raw) as ProviderModelsResponse | unknown[]);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Provider models request timed out after ${config.timeoutMs || 10000}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchAnthropicModels(
  config: Pick<AiProviderConfig, "endpoint" | "apiKey" | "timeoutMs">
): Promise<string[]> {
  const apiKey = requireAnthropicApiKey(config.apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 10000);
  try {
    const response = await authorizedProviderFetch(anthropicApiUrl(config.endpoint, "models"), {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      signal: controller.signal
    });

    const raw = await readBoundedProviderText(response);
    if (!response.ok) {
      throw new Error(`Provider models request failed ${response.status}: ${raw.slice(0, 500)}`);
    }

    return modelIdsFromProviderModels(JSON.parse(raw) as ProviderModelsResponse | unknown[]);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Provider models request timed out after ${config.timeoutMs || 10000}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function checkLmStudioProvider(config: AiProviderConfig): Promise<ProviderCheckResult> {
  const started = Date.now();
  const endpoint = openAiCompatibleDefaultEndpoint(config, "lm-studio");
  const modelInfo = await listLmStudioModelInfo(config).catch(() => []);
  const availableModels = modelInfo.map((model) => model.id);
  const selectedModel = config.model?.trim()
    ? modelInfo.find((model) => model.id === config.model?.trim()) || { id: config.model.trim() }
    : modelInfo[0];
  const model = selectedModel?.id;
  if (!model) {
    throw new Error("Model name is required because LM Studio did not return any loaded LLM models.");
  }
  const result = await callOpenAiCompatibleJson<{ ok?: boolean; message?: string }>(
    {
      ...config,
      endpoint,
      model,
      maxOutputTokens: providerCheckMaxOutputTokens(config.maxOutputTokens),
      temperature: 0
    },
    providerCheckMessages(),
    { schemaName: "provider check", retryOnInvalidJson: true }
  );

  return {
    ok: Boolean(result.value.ok),
    endpoint: openAiChatCompletionsUrl(endpoint),
    model: result.model || model,
    modelDisplayName: selectedModel.displayName,
    availableModels,
    latencyMs: Date.now() - started,
    message: result.value.message || "Provider responded with JSON."
  };
}

async function listLmStudioModelInfo(
  config: Pick<AiProviderConfig, "endpoint" | "apiKey" | "timeoutMs">
): Promise<ModelInfo[]> {
  const nativeUrl = `${nativeApiBase(config.endpoint, PROVIDER_DEFAULTS["lm-studio"].endpoint)}/api/v1/models`;
  const nativeModels = await fetchLmStudioNativeModels(nativeUrl, config).catch(() => []);
  if (nativeModels.length) return nativeModels;
  return (await listOpenAiCompatibleModels({
    ...config,
    endpoint: openAiCompatibleDefaultEndpoint(config, "lm-studio")
  })).map((id) => ({ id }));
}

async function fetchLmStudioNativeModels(
  url: string,
  config: Pick<AiProviderConfig, "apiKey" | "timeoutMs">
): Promise<ModelInfo[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 10000);
  try {
    const headers: Record<string, string> = {};
    if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

    const response = await authorizedProviderFetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });

    const raw = await readBoundedProviderText(response);
    if (!response.ok) {
      throw new Error(`Provider models request failed ${response.status}: ${raw.slice(0, 500)}`);
    }

    return modelInfoFromLmStudioNativeModels(JSON.parse(raw) as LmStudioModelResponse);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Provider models request timed out after ${config.timeoutMs || 10000}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function modelInfoFromLmStudioNativeModels(payload: LmStudioModelResponse): ModelInfo[] {
  const loaded: ModelInfo[] = [];
  const unloaded: ModelInfo[] = [];
  for (const item of payload.models || []) {
    if (item.type && item.type !== "llm") continue;
    const displayName = typeof item.display_name === "string" ? item.display_name.trim() : undefined;
    const loadedInstances = item.loaded_instances || [];
    for (const instance of loadedInstances) {
      const id = instance.id?.trim();
      if (id) loaded.push({ id, displayName, loaded: true });
    }
    if (!loadedInstances.length) {
      const key = item.key?.trim();
      if (key) unloaded.push({ id: key, displayName, loaded: false });
    }
  }
  return uniqueModelInfo([...loaded, ...unloaded]);
}

function uniqueModelInfo(models: ModelInfo[]): ModelInfo[] {
  const seen = new Set<string>();
  return models.filter((model) => {
    if (seen.has(model.id)) return false;
    seen.add(model.id);
    return true;
  });
}

async function checkNativeOllamaProvider(config: AiProviderConfig): Promise<ProviderCheckResult> {
  const started = Date.now();
  const availableModels = await listAiProviderModels(config).catch(() => []);
  const model = config.model?.trim() || availableModels[0];
  if (!model) {
    throw new Error("Model name is required because Ollama did not return any local models.");
  }
  const result = await callAiProviderJson<{ ok?: boolean; message?: string }>(
    {
      ...config,
      providerKind: "ollama",
      model,
      maxOutputTokens: providerCheckMaxOutputTokens(config.maxOutputTokens),
      temperature: 0
    },
    providerCheckMessages(),
    { schemaName: "provider check", retryOnInvalidJson: true }
  );

  return {
    ok: Boolean(result.value.ok),
    endpoint: ollamaApiUrl(config.endpoint, "chat"),
    model: result.model || model,
    availableModels,
    latencyMs: Date.now() - started,
    message: result.value.message || "Provider responded with JSON."
  };
}

async function checkAnthropicProvider(config: AiProviderConfig): Promise<ProviderCheckResult> {
  const started = Date.now();
  const availableModels = await listAiProviderModels(config).catch(() => []);
  const model = config.model?.trim() || availableModels[0];
  if (!model) {
    throw new Error("Model name is required because Claude did not return any models.");
  }
  const result = await callAiProviderJson<{ ok?: boolean; message?: string }>(
    {
      ...config,
      providerKind: "anthropic",
      model,
      maxOutputTokens: providerCheckMaxOutputTokens(config.maxOutputTokens),
      temperature: 0
    },
    providerCheckMessages(),
    { schemaName: "provider check", retryOnInvalidJson: true }
  );

  return {
    ok: Boolean(result.value.ok),
    endpoint: anthropicApiUrl(config.endpoint, "messages"),
    model: result.model || model,
    availableModels,
    latencyMs: Date.now() - started,
    message: result.value.message || "Provider responded with JSON."
  };
}

function modelIdsFromProviderModels(payload: ProviderModelsResponse | unknown[]): string[] {
  const items = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.data)
      ? payload.data
      : Array.isArray(payload.models)
        ? payload.models
        : [];
  const models = items
    .map((item) => {
      if (typeof item === "string") return item.trim();
      if (!item || typeof item !== "object") return "";
      const candidate = item as Record<string, unknown>;
      const id = candidate.id || candidate.model || candidate.name || candidate.path;
      return typeof id === "string" ? id.trim() : "";
    })
    .filter((id): id is string => Boolean(id));
  return Array.from(new Set(models));
}

function providerCheckMessages(): AiChatMessage[] {
  return [
    {
      role: "system",
      content: "Connectivity test. Do not explain. Do not think step by step. Return only the exact JSON object requested."
    },
    {
      role: "user",
      content: 'Reply with exactly this JSON and nothing else: {"ok":true,"message":"ready"}'
    }
  ];
}

function providerCheckMaxOutputTokens(input: number | undefined): number {
  return Math.max(input || 768, 512);
}

function normalizeAiProviderKind(providerKind?: string): "openai-compatible" | "lm-studio" | "llama-cpp" | "ollama" | "openai" | "anthropic" | "codex" {
  const value = String(providerKind || "openai-compatible").trim().toLowerCase();
  if (value === "lm-studio") return "lm-studio";
  if (value === "ollama") return "ollama";
  if (value === "llama-cpp" || value === "llama.cpp" || value === "app-managed-llamacpp") return "llama-cpp";
  if (value === "openai") return "openai";
  if (value === "anthropic" || value === "claude") return "anthropic";
  if (value === "codex") return "codex";
  return "openai-compatible";
}

function openAiCompatibleDefaultEndpoint(
  config: Pick<AiProviderConfig, "endpoint">,
  providerKind: ReturnType<typeof normalizeAiProviderKind>
): string {
  const endpoint = config.endpoint?.trim();
  if (endpoint) return endpoint;
  if (providerKind === "openai") return PROVIDER_DEFAULTS.openai.endpoint;
  if (providerKind === "llama-cpp") return PROVIDER_DEFAULTS["llama-cpp"].endpoint;
  throw new Error("OpenAI-compatible endpoint is required.");
}

function nativeApiBase(endpoint: string | undefined, fallback: string): string {
  const trimmed = (endpoint || fallback).trim().replace(/\/+$/g, "");
  if (!trimmed) throw new Error("Provider endpoint is required.");
  return trimmed
    .replace(/\/v1(?:\/.*)?$/g, "")
    .replace(/\/api\/v1(?:\/.*)?$/g, "")
    .replace(/\/api(?:\/.*)?$/g, "");
}

function ollamaApiUrl(endpoint: string | undefined, route: "chat" | "tags"): string {
  return `${nativeApiBase(endpoint, PROVIDER_DEFAULTS.ollama.endpoint)}/api/${route}`;
}

function anthropicApiUrl(endpoint: string | undefined, route: "messages" | "models"): string {
  return `${nativeApiBase(endpoint, PROVIDER_DEFAULTS.anthropic.endpoint)}/v1/${route}`;
}

function requireAnthropicApiKey(apiKey: string | undefined): string {
  const value = apiKey?.trim();
  if (!value) throw new Error("Claude API key is required.");
  return value;
}

export function openAiChatCompletionsUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/g, "");
  if (!trimmed) throw new Error("OpenAI-compatible endpoint is required.");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

export function openAiModelsUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/g, "");
  if (!trimmed) throw new Error("OpenAI-compatible endpoint is required.");
  if (trimmed.endsWith("/models")) return trimmed;
  if (trimmed.endsWith("/chat/completions")) return `${trimmed.replace(/\/chat\/completions$/g, "")}/models`;
  if (trimmed.endsWith("/v1")) return `${trimmed}/models`;
  return `${trimmed}/v1/models`;
}

function providerModelsUrls(endpoint: string): string[] {
  const trimmed = endpoint.trim().replace(/\/+$/g, "");
  const urls = [openAiModelsUrl(trimmed)];
  const withoutVersion = trimmed
    .replace(/\/v1(?:\/.*)?$/g, "")
    .replace(/\/api\/v1(?:\/.*)?$/g, "");
  if (withoutVersion) {
    urls.push(`${withoutVersion}/api/v1/models`);
    urls.push(`${withoutVersion}/v1/models`);
  }
  return Array.from(new Set(urls));
}

async function callAiProviderText(
  config: AiProviderConfig,
  messages: AiChatMessage[],
  signal?: AbortSignal
): Promise<TextCompletionResult> {
  const providerKind = normalizeAiProviderKind(config.providerKind);
  if (providerKind === "codex") {
    throw new Error("Codex is not a standalone AI provider endpoint for document analysis. Use OpenAI API or an OpenAI-compatible local server.");
  }
  if (providerKind === "ollama") return callOllamaText(config, messages, signal);
  if (providerKind === "anthropic") return callAnthropicText(config, messages, signal);
  return callOpenAiCompatibleText(
    {
      ...config,
      endpoint: openAiCompatibleDefaultEndpoint(config, providerKind)
    },
    messages,
    signal
  );
}

export function parseJsonObjectFromText(input: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "empty response" };

  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const candidates = [
    trimmed,
    fenced?.[1],
    extractBalancedJson(trimmed)
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()));

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ok: true, value: parsed };
      }
      continue;
    } catch {
      // Try the next candidate.
    }
  }

  return { ok: false, error: "no parseable JSON object found" };
}

async function callOllamaText(
  config: AiProviderConfig,
  messages: AiChatMessage[],
  signal?: AbortSignal
): Promise<TextCompletionResult> {
  if (!config.model?.trim()) throw new Error("Model name is required.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 60000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  try {
    const response = await authorizedProviderFetch(ollamaApiUrl(config.endpoint, "chat"), {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        options: {
          temperature: config.temperature ?? 0,
          num_predict: config.maxOutputTokens || 1024
        },
        ...(config.jsonMode === false ? {} : { format: "json" })
      }),
      signal: controller.signal
    });

    const raw = await readBoundedProviderText(response);
    if (!response.ok) {
      throw new Error(`Provider request failed ${response.status}: ${raw.slice(0, 500)}`);
    }

    const payload = JSON.parse(raw) as OllamaChatResponse;
    const rawText = payload.message?.content || payload.response || "";
    if (!rawText.trim()) {
      throw new Error(`Provider response did not include message content. Response: ${JSON.stringify(payload || {}).slice(0, 500)}`);
    }
    return {
      rawText,
      model: payload.model || config.model
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Provider request timed out after ${config.timeoutMs || 60000}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

async function callAnthropicText(
  config: AiProviderConfig,
  messages: AiChatMessage[],
  signal?: AbortSignal
): Promise<TextCompletionResult> {
  if (!config.model?.trim()) throw new Error("Model name is required.");
  const apiKey = requireAnthropicApiKey(config.apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 60000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  try {
    const response = await authorizedProviderFetch(anthropicApiUrl(config.endpoint, "messages"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: config.maxOutputTokens || 1024,
        temperature: config.temperature ?? 0,
        ...anthropicMessagesPayload(messages)
      }),
      signal: controller.signal
    });

    const raw = await readBoundedProviderText(response);
    if (!response.ok) {
      throw new Error(`Provider request failed ${response.status}: ${raw.slice(0, 500)}`);
    }

    const payload = JSON.parse(raw) as AnthropicMessageResponse;
    const rawText = (payload.content || [])
      .map((part) => part.text || "")
      .join("");
    if (!rawText.trim()) {
      throw new Error(`Provider response did not include message content. Response: ${JSON.stringify(payload || {}).slice(0, 500)}`);
    }
    return {
      rawText,
      model: payload.model || config.model,
      usage: payload.usage
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Provider request timed out after ${config.timeoutMs || 60000}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

function anthropicMessagesPayload(messages: AiChatMessage[]): {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n")
    .trim();
  const anthropicMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" as const : "user" as const,
      content: message.content
    }));
  return {
    ...(system ? { system } : {}),
    messages: anthropicMessages.length ? anthropicMessages : [{ role: "user", content: "Return JSON." }]
  };
}

async function callOpenAiCompatibleText(
  config: OpenAiCompatibleProviderConfig,
  messages: AiChatMessage[],
  signal?: AbortSignal
): Promise<{ rawText: string; model?: string; usage?: unknown }> {
  if (!config.model?.trim()) throw new Error("Model name is required.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 60000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });

  try {
    const headers: Record<string, string> = {
      "content-type": "application/json"
    };
    if (config.apiKey) headers.authorization = `Bearer ${config.apiKey}`;

    const response = await authorizedProviderFetch(openAiChatCompletionsUrl(config.endpoint), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature ?? 0,
        max_tokens: config.maxOutputTokens || 1024,
        ...openAiCompatibleJsonResponseFormat(config)
      }),
      signal: controller.signal
    });

    const raw = await readBoundedProviderText(response);
    if (!response.ok) {
      throw new Error(`Provider request failed ${response.status}: ${raw.slice(0, 500)}`);
    }

    const payload = JSON.parse(raw) as OpenAiChatCompletionResponse;
    const firstChoice = payload.choices?.[0];
    const rawText = textFromChoice(firstChoice);
    if (!rawText.trim() && !firstChoice?.message?.reasoning_content?.trim()) {
      throw new Error(`Provider response did not include message content. First choice: ${JSON.stringify(firstChoice || {}).slice(0, 500)}`);
    }
    return {
      rawText,
      model: payload.model,
      usage: payload.usage
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Provider request timed out after ${config.timeoutMs || 60000}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
}

function openAiCompatibleJsonResponseFormat(config: OpenAiCompatibleProviderConfig): Record<string, unknown> {
  if (config.jsonMode === false) return {};
  const providerKind = normalizeAiProviderKind(config.providerKind);
  if (providerKind === "lm-studio") {
    return {
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "zharwing_memory_json_response",
          strict: false,
          schema: {
            type: "object",
            additionalProperties: true
          }
        }
      }
    };
  }
  return {
    response_format: { type: "json_object" }
  };
}

function textFromChoice(choice: OpenAiChatChoice | undefined): string {
  const content = choice?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        return part.text || "";
      })
      .join("");
  }
  return choice?.message?.reasoning_content || choice?.text || "";
}

function extractBalancedJson(input: string): string | undefined {
  const start = input.indexOf("{");
  if (start === -1) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < input.length; index += 1) {
    const char = input[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth === 0) return input.slice(start, index + 1);
  }

  return undefined;
}
