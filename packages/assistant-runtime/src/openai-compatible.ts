export type AiChatRole = "system" | "user" | "assistant";

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

export interface OpenAiCompatibleProviderConfig {
  endpoint: string;
  model: string;
  apiKey?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  temperature?: number;
  jsonMode?: boolean;
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
  latencyMs: number;
  message: string;
}

interface OpenAiChatCompletionResponse {
  model?: string;
  choices?: OpenAiChatChoice[];
  usage?: unknown;
}

interface OpenAiChatChoice {
  text?: string;
  message?: {
    content?: string | Array<string | { text?: string; type?: string }>;
    reasoning_content?: string;
  };
}

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

export async function checkOpenAiCompatibleProvider(
  config: OpenAiCompatibleProviderConfig
): Promise<ProviderCheckResult> {
  const started = Date.now();
  const result = await callOpenAiCompatibleJson<{ ok?: boolean; message?: string }>(
    {
      ...config,
      maxOutputTokens: Math.min(config.maxOutputTokens || 64, 128),
      temperature: 0
    },
    [
      {
        role: "system",
        content: "Return only JSON."
      },
      {
        role: "user",
        content: 'Return {"ok":true,"message":"ready"} as JSON.'
      }
    ],
    { schemaName: "provider check", retryOnInvalidJson: true }
  );

  return {
    ok: Boolean(result.value.ok),
    endpoint: openAiChatCompletionsUrl(config.endpoint),
    model: result.model || config.model,
    latencyMs: Date.now() - started,
    message: result.value.message || "Provider responded with JSON."
  };
}

export function openAiChatCompletionsUrl(endpoint: string): string {
  const trimmed = endpoint.trim().replace(/\/+$/g, "");
  if (!trimmed) throw new Error("OpenAI-compatible endpoint is required.");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  if (trimmed.endsWith("/v1")) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
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
    if (!rawText.trim()) {
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
