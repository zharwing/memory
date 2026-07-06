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
export type AiProviderKind = "openai-compatible" | "custom-openai-compatible" | "lm-studio" | "llama-cpp" | "llama.cpp" | "ollama" | "openai" | "anthropic" | "claude" | "codex";
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
export declare function callOpenAiCompatibleJson<T = unknown>(config: OpenAiCompatibleProviderConfig, messages: AiChatMessage[], options?: JsonCompletionOptions): Promise<JsonCompletionResult<T>>;
export declare function callAiProviderJson<T = unknown>(config: AiProviderConfig, messages: AiChatMessage[], options?: JsonCompletionOptions): Promise<JsonCompletionResult<T>>;
export declare function checkOpenAiCompatibleProvider(config: OpenAiCompatibleProviderConfig): Promise<ProviderCheckResult>;
export declare function checkAiProvider(config: AiProviderConfig): Promise<ProviderCheckResult>;
export declare function listOpenAiCompatibleModels(config: Pick<OpenAiCompatibleProviderConfig, "endpoint" | "apiKey" | "timeoutMs">): Promise<string[]>;
export declare function listAiProviderModels(config: Pick<AiProviderConfig, "endpoint" | "apiKey" | "timeoutMs" | "providerKind">): Promise<string[]>;
export declare function openAiChatCompletionsUrl(endpoint: string): string;
export declare function openAiModelsUrl(endpoint: string): string;
export declare function parseJsonObjectFromText(input: string): {
    ok: true;
    value: unknown;
} | {
    ok: false;
    error: string;
};
