import { PROVIDER_DEFAULTS, type ProviderDefault } from "@zharwing/memory-core";

export interface ProviderMetadata extends ProviderDefault {
  readonly kind: string;
  readonly aliases: readonly string[];
  readonly supportsChat: boolean;
}

const ALIASES: Readonly<Record<string, string>> = {
  "llama.cpp": "llama-cpp",
  claude: "anthropic"
};

export function normalizeProviderKind(value: string): string {
  const normalized = value.trim().toLowerCase();
  return ALIASES[normalized] ?? normalized;
}

export function providerMetadata(value: string): ProviderMetadata | undefined {
  const kind = normalizeProviderKind(value);
  const defaults = (PROVIDER_DEFAULTS as Record<string, ProviderDefault>)[kind];
  if (!defaults) return undefined;
  return {
    ...defaults,
    kind,
    aliases: Object.entries(ALIASES).filter(([, canonical]) => canonical === kind).map(([alias]) => alias),
    supportsChat: true
  };
}

export function providerDefaultEndpoint(value: string): string | undefined {
  return providerMetadata(value)?.endpoint;
}
