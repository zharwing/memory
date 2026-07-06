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

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });

    const raw = await response.text();
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
    const response = await fetch(anthropicApiUrl(config.endpoint, "models"), {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION
      },
      signal: controller.signal
    });

    const raw = await response.text();
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
  const nativeUrl = `${nativeApiBase(config.endpoint, "http://127.0.0.1:1234")}/api/v1/models`;
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

    const response = await fetch(url, {
      method: "GET",
      headers,
      signal: controller.signal
    });

    const raw = await response.text();
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
  if (providerKind === "openai") return "https://api.openai.com/v1";
  if (providerKind === "llama-cpp") return "http://127.0.0.1:8080/v1";
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
  return `${nativeApiBase(endpoint, "http://127.0.0.1:11434")}/api/${route}`;
}

function anthropicApiUrl(endpoint: string | undefined, route: "messages" | "models"): string {
  return `${nativeApiBase(endpoint, "https://api.anthropic.com")}/v1/${route}`;
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
    const response = await fetch(ollamaApiUrl(config.endpoint, "chat"), {
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

    const raw = await response.text();
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
    const response = await fetch(anthropicApiUrl(config.endpoint, "messages"), {
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

    const raw = await response.text();
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

    const response = await fetch(openAiChatCompletionsUrl(config.endpoint), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages,
        temperature: config.temperature ?? 0,
        max_tokens: config.maxOutputTokens || 1024,
        ...(config.jsonMode === false ? {} : { response_format: { type: "json_object" } })
      }),
      signal: controller.signal
    });

    const raw = await response.text();
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
