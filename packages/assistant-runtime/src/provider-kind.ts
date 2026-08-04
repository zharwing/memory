import type { AiProviderKind } from "./openai-compatible.js";

/**
 * Map an assistant policy runtimeType to the provider kind used for AI
 * calls. Returns undefined for unknown or disabled runtimes so callers
 * choose their own fallback. Single source of truth for the daemon; keep
 * the runtimeType cases in sync with AssistantPolicy.
 */
export function providerKindFromAssistantRuntime(runtimeType?: string): AiProviderKind | undefined {
  if (!runtimeType || runtimeType === "disabled") return undefined;
  if (runtimeType === "lm-studio") return "lm-studio";
  if (runtimeType === "ollama") return "ollama";
  if (runtimeType === "llama-cpp" || runtimeType === "app-managed-llamacpp") return "llama-cpp";
  if (runtimeType === "openai") return "openai";
  if (runtimeType === "anthropic") return "anthropic";
  if (runtimeType === "custom-openai-compatible") return "openai-compatible";
  return undefined;
}
