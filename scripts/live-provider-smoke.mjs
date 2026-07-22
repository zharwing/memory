import { checkAiProvider } from "../packages/assistant-runtime/dist/index.js";

const endpoint = process.env.ZHARWING_MEMORY_LIVE_PROVIDER_ENDPOINT;
const model = process.env.ZHARWING_MEMORY_LIVE_PROVIDER_MODEL;
const providerKind = process.env.ZHARWING_MEMORY_LIVE_PROVIDER_KIND || "custom-openai-compatible";
const apiKey = process.env.ZHARWING_MEMORY_LIVE_PROVIDER_API_KEY;

if (!endpoint) {
  console.error(
    "Set ZHARWING_MEMORY_LIVE_PROVIDER_ENDPOINT and optionally ZHARWING_MEMORY_LIVE_PROVIDER_MODEL/KIND/API_KEY before running the live-provider smoke test."
  );
  process.exit(2);
}

const result = await checkAiProvider({
  endpoint,
  model,
  providerKind,
  apiKey,
  timeoutMs: Number(process.env.ZHARWING_MEMORY_LIVE_PROVIDER_TIMEOUT_MS || 60_000),
  maxOutputTokens: 128
});

if (!result.ok) {
  console.error(`Provider responded but did not pass its JSON check: ${result.message}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: result.ok,
  endpoint: result.endpoint,
  model: result.model,
  latencyMs: result.latencyMs,
  message: result.message
}, null, 2));
