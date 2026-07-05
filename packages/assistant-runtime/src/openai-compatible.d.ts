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
export declare function callOpenAiCompatibleJson<T = unknown>(config: OpenAiCompatibleProviderConfig, messages: AiChatMessage[], options?: JsonCompletionOptions): Promise<JsonCompletionResult<T>>;
export declare function checkOpenAiCompatibleProvider(config: OpenAiCompatibleProviderConfig): Promise<ProviderCheckResult>;
export declare function openAiChatCompletionsUrl(endpoint: string): string;
export declare function parseJsonObjectFromText(input: string): {
    ok: true;
    value: unknown;
} | {
    ok: false;
    error: string;
};
