import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { CheckCircle2, Loader2, PlugZap, Save, XCircle } from "lucide-react";
import { KeyValue, Panel, Screen } from "../components/layout.js";
import { SettingsTabs } from "../components/SectionTabs.js";
import { useStore } from "../stores/store-context.js";

const LM_STUDIO_ENDPOINT = "http://127.0.0.1:1234/v1";
const OLLAMA_ENDPOINT = "http://127.0.0.1:11434";
const LLAMA_CPP_ENDPOINT = "http://127.0.0.1:8080/v1";
const OPENAI_ENDPOINT = "https://api.openai.com/v1";
const ANTHROPIC_ENDPOINT = "https://api.anthropic.com";
const LEGACY_LM_STUDIO_MODEL = "llm";
const PROVIDER_DEFAULT_ENDPOINTS: Record<string, string> = {
  "lm-studio": LM_STUDIO_ENDPOINT,
  ollama: OLLAMA_ENDPOINT,
  "llama-cpp": LLAMA_CPP_ENDPOINT,
  openai: OPENAI_ENDPOINT,
  anthropic: ANTHROPIC_ENDPOINT
};

const DEFAULT_ASSISTANT_DRAFT = {
  enabled: false,
  runtimeType: "disabled",
  endpoint: "",
  modelName: "",
  modelDisplayName: "",
  modelPath: "",
  autoAcceptLowRiskMetadata: false
};

export const AssistantScreen = observer(function AssistantScreen() {
  const store = useStore();
  const policy = store.summary?.project?.assistantPolicy || store.selectedProject?.assistantPolicy || DEFAULT_ASSISTANT_DRAFT;
  const status = store.assistantStatus;
  const providerCheck = store.assistantProviderCheck;
  const [draft, setDraft] = useState(DEFAULT_ASSISTANT_DRAFT);
  const [testApiKey, setTestApiKey] = useState("");
  const [connectionAction, setConnectionAction] = useState<"save-test" | "test" | null>(null);

  useEffect(() => {
    const modelName = policy.runtimeType === "lm-studio" && policy.modelName === LEGACY_LM_STUDIO_MODEL
      ? ""
      : policy.modelName || "";
    setDraft({
      ...DEFAULT_ASSISTANT_DRAFT,
      ...policy,
      endpoint: policy.endpoint || "",
      modelName,
      modelDisplayName: policy.modelDisplayName || "",
      modelPath: policy.modelPath || ""
    });
    setTestApiKey("");
  }, [
    store.selectedProjectId,
    policy.enabled,
    policy.runtimeType,
    policy.endpoint,
    policy.modelName,
    policy.modelDisplayName,
    policy.modelPath,
    policy.autoAcceptLowRiskMetadata
  ]);

  function updateDraft(patch: Partial<typeof draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function assistantPolicyPayload(overrides: Partial<typeof draft> = {}) {
    const nextDraft = { ...draft, ...overrides };
    const runtimeType = nextDraft.enabled
      ? nextDraft.runtimeType === "disabled" ? "lm-studio" : nextDraft.runtimeType
      : "disabled";
    return {
      enabled: Boolean(nextDraft.enabled),
      runtimeType,
      endpoint: nextDraft.endpoint.trim(),
      modelName: nextDraft.modelName.trim(),
      modelDisplayName: nextDraft.modelDisplayName.trim(),
      modelPath: nextDraft.modelPath.trim(),
      autoAcceptLowRiskMetadata: Boolean(nextDraft.autoAcceptLowRiskMetadata)
    };
  }

  async function savePolicy() {
    await store.updateAssistantPolicy(assistantPolicyPayload());
  }

  async function saveAndTestConnection() {
    setConnectionAction("save-test");
    try {
      const result = await store.checkAssistantProvider({
        providerKind: selectedProvider,
        endpoint: draft.endpoint.trim() || undefined,
        model: modelForProviderCheck(),
        apiKey: testApiKey.trim() || undefined,
        timeoutMs: 60000,
        maxOutputTokens: 768,
        jsonMode: false
      });
      if (result?.ok && result.model) {
        const modelDisplayName = typeof result.modelDisplayName === "string" ? result.modelDisplayName : "";
        updateDraft({ modelName: result.model, modelDisplayName });
        await store.updateAssistantPolicy(assistantPolicyPayload({ modelName: result.model, modelDisplayName }));
        return;
      }
      await store.updateAssistantPolicy(assistantPolicyPayload());
    } catch {
      return;
    } finally {
      setConnectionAction(null);
    }
  }

  async function testProvider() {
    setConnectionAction("test");
    try {
      const result = await store.checkAssistantProvider({
        providerKind: selectedProvider,
        endpoint: draft.endpoint.trim() || undefined,
        model: modelForProviderCheck(),
        apiKey: testApiKey.trim() || undefined,
        timeoutMs: 60000,
        maxOutputTokens: 768,
        jsonMode: false
      });
      if (result?.ok && result.model) {
        updateDraft({
          modelName: result.model,
          modelDisplayName: typeof result.modelDisplayName === "string" ? result.modelDisplayName : ""
        });
      }
    } catch {
      // The store already exposes the failed check result for the UI.
    } finally {
      setConnectionAction(null);
    }
  }

  function setAssistantEnabled(enabled: boolean) {
    setDraft((current) => ({
      ...current,
      enabled,
      runtimeType: enabled && current.runtimeType === "disabled" ? "lm-studio" : current.runtimeType,
      endpoint: enabled && !current.endpoint.trim() ? defaultEndpointForProvider("lm-studio") : current.endpoint
    }));
  }

  function chooseProvider(runtimeType: string) {
    setDraft((current) => ({
      ...current,
      runtimeType,
      endpoint: endpointForProviderSelection(runtimeType, current.endpoint),
      modelName: modelCanBeDetected(runtimeType) && current.modelName === LEGACY_LM_STUDIO_MODEL ? "" : current.modelName,
      modelDisplayName: runtimeType === current.runtimeType ? current.modelDisplayName : ""
    }));
  }

  function modelForProviderCheck() {
    const model = draft.modelName.trim();
    if (modelCanBeDetected(selectedProvider) && (!model || model === LEGACY_LM_STUDIO_MODEL)) return undefined;
    return model || undefined;
  }

  const checkOk = providerCheck?.ok === true;
  const connectionStatus = providerCheck
    ? checkOk ? "Connected" : "Connection failed"
    : status?.available ? "Available" : "Not tested";
  const selectedProvider = draft.runtimeType === "disabled" ? "lm-studio" : draft.runtimeType;
  const autoDetectsModel = modelCanBeDetected(selectedProvider);
  const activeModel = checkOk && providerCheck?.model ? String(providerCheck.model) : draft.modelName.trim();
  const activeModelDisplayName = checkOk && providerCheck?.modelDisplayName
    ? String(providerCheck.modelDisplayName)
    : draft.modelDisplayName.trim();
  const modelLabel = activeModelDisplayName
    ? `Active model: ${activeModelDisplayName}`
    : activeModel && !autoDetectsModel
      ? `Active model: ${activeModel}`
    : "Model will be detected";
  const testingSaveAndConnection = connectionAction === "save-test";
  const testingConnectionOnly = connectionAction === "test";
  const testingConnection = Boolean(connectionAction);
  const canTestConnection = Boolean(store.selectedProjectId && draft.enabled && draft.endpoint.trim());

  return (
    <Screen title="AI Assistant">
      <SettingsTabs />
      <Panel title="Connect AI provider">
        <div className="assistant-setup-intro">
          <p>Use a local or OpenAI-compatible AI provider to power document analysis and graph link suggestions.</p>
          <div className="assistant-status-chips" aria-label="Assistant status">
            <span className={draft.enabled ? "ok" : ""}>{draft.enabled ? "Assistant on" : "Assistant off"}</span>
            <span className={checkOk ? "ok" : providerCheck ? "blocked" : ""}>{connectionStatus}</span>
            <span className={checkOk ? "ok" : ""}>{modelLabel}</span>
            <span className={checkOk ? "ok" : ""}>{checkOk ? "Ready for link discovery" : "Link discovery needs connection"}</span>
          </div>
        </div>
        <form
          className="stacked-form assistant-settings-form assistant-connect-form"
          onSubmit={(event) => {
            event.preventDefault();
            void saveAndTestConnection();
          }}
        >
          <label className="checkbox-row assistant-enable-row">
            <input
              type="checkbox"
              checked={Boolean(draft.enabled)}
              disabled={!store.selectedProjectId || store.loading}
              onChange={(event) => setAssistantEnabled(event.target.checked)}
            />
            <span>Enable AI assistant</span>
          </label>

          {!draft.enabled ? (
            <div className="assistant-disabled-state">
              <strong>AI Assistant is off</strong>
              <p>Turn this on to let Zharwing Memory use a local AI provider for document analysis and graph link suggestions.</p>
            </div>
          ) : (
            <>
              <div className="assistant-connect-fields">
                <label>
                  <span>Provider</span>
                  <select
                    value={selectedProvider}
                    disabled={!store.selectedProjectId || store.loading}
                    onChange={(event) => chooseProvider(event.target.value)}
                  >
                    <option value="lm-studio">LM Studio</option>
                    <option value="ollama">Ollama</option>
                    <option value="llama-cpp">llama.cpp server</option>
                    <option value="openai">OpenAI API</option>
                    <option value="anthropic">Claude API</option>
                    <option value="custom-openai-compatible">OpenAI-compatible API</option>
                    <option value="app-managed-llamacpp">App-managed local model</option>
                  </select>
                </label>
                <label>
                  <span>Endpoint</span>
                  <input
                    value={draft.endpoint}
                    disabled={!store.selectedProjectId || store.loading}
                    onChange={(event) => updateDraft({ endpoint: event.target.value, modelDisplayName: "" })}
                    placeholder={defaultEndpointForProvider(selectedProvider)}
                  />
                </label>
                {autoDetectsModel ? (
                  <label>
                    <span>Model</span>
                    <input
                      value={activeModelDisplayName}
                      readOnly
                      placeholder="Detected when you test"
                    />
                  </label>
                ) : (
                  <label>
                    <span>Model</span>
                    <input
                      value={draft.modelName}
                      disabled={!store.selectedProjectId || store.loading}
                      onChange={(event) => updateDraft({ modelName: event.target.value, modelDisplayName: "" })}
                      placeholder="Model name"
                    />
                  </label>
                )}
                {providerMayUseApiKey(selectedProvider) ? (
                  <label>
                    <span>API key for test</span>
                    <input
                      type="password"
                      value={testApiKey}
                      disabled={!store.selectedProjectId || store.loading}
                      onChange={(event) => setTestApiKey(event.target.value)}
                      placeholder="Not saved"
                    />
                  </label>
                ) : null}
              </div>
              {selectedProvider === "lm-studio" ? (
                <p className="assistant-provider-hint">In LM Studio, start the OpenAI-compatible local server. Zharwing Memory detects the active loaded model when you test the connection.</p>
              ) : null}
              {activeModelDisplayName && activeModel ? (
                <p className="assistant-provider-hint">Detected model: {activeModelDisplayName}.</p>
              ) : null}
              {selectedProvider === "ollama" ? (
                <p className="assistant-provider-hint">Start Ollama locally. Zharwing Memory detects the first available model when you test the connection.</p>
              ) : null}
              {selectedProvider === "llama-cpp" ? (
                <p className="assistant-provider-hint">Start the llama.cpp server with OpenAI-compatible endpoints. Zharwing Memory detects the loaded model when the server lists one.</p>
              ) : null}
              {selectedProvider === "openai" ? (
                <p className="assistant-provider-hint">Enter an OpenAI API key for the connection test. The key is not saved in project settings.</p>
              ) : null}
              {selectedProvider === "anthropic" ? (
                <p className="assistant-provider-hint">Enter a Claude API key for the connection test. The key is not saved in project settings.</p>
              ) : null}
              <div className="assistant-connection-status">
                <span>Connection status</span>
                <strong className={checkOk ? "ok" : providerCheck ? "blocked" : ""}>{connectionStatus}</strong>
                {providerCheck?.message ? <small>{providerCheck.message}</small> : null}
              </div>
            </>
          )}

          <div className="button-row assistant-action-row">
            <button
              type="submit"
              className="icon-text-button primary"
              disabled={!canTestConnection || store.loading || testingConnection}
              aria-busy={testingSaveAndConnection}
              title={!draft.enabled ? "Turn on AI assistant to test the connection." : undefined}
            >
              {testingSaveAndConnection ? <Loader2 className="button-spinner" size={14} /> : <PlugZap size={14} />}
              {testingSaveAndConnection ? "Testing..." : "Save & test connection"}
            </button>
            <button
              type="button"
              className="icon-text-button"
              disabled={!store.selectedProjectId || store.loading}
              onClick={() => void savePolicy()}
            >
              <Save size={14} />
              Save only
            </button>
            <button
              type="button"
              className="icon-text-button"
              disabled={!canTestConnection || store.loading || testingConnection}
              aria-busy={testingConnectionOnly}
              onClick={() => void testProvider()}
              title={!draft.enabled ? "Turn on AI assistant to test the connection." : undefined}
            >
              {testingConnectionOnly ? <Loader2 className="button-spinner" size={14} /> : <PlugZap size={14} />}
              {testingConnectionOnly ? "Testing..." : "Test connection"}
            </button>
          </div>

          <details className="advanced-fields assistant-advanced-fields">
            <summary>Advanced settings</summary>
            <div className="advanced-fields-body">
              {autoDetectsModel ? (
                <label>
                  <span>Model ID override</span>
                  <input
                    value={draft.modelName}
                    disabled={!store.selectedProjectId || store.loading}
                    onChange={(event) => updateDraft({ modelName: event.target.value, modelDisplayName: "" })}
                    placeholder="Leave blank to auto-detect"
                  />
                </label>
              ) : null}
              <label>
                <span>Model path</span>
                <input
                  value={draft.modelPath}
                  disabled={!store.selectedProjectId || store.loading}
                  onChange={(event) => updateDraft({ modelPath: event.target.value })}
                  placeholder="Only needed if Zharwing Memory launches the model itself"
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(draft.autoAcceptLowRiskMetadata)}
                  disabled={!store.selectedProjectId || store.loading}
                  onChange={(event) => updateDraft({ autoAcceptLowRiskMetadata: event.target.checked })}
                />
                <span>Auto-accept low-risk metadata</span>
              </label>
              <section className="assistant-diagnostics">
                <h4>Advanced diagnostics</h4>
                <div className="dashboard-grid tight">
                  <KeyValue label="Saved assistant" value={policy.enabled ? "On" : "Off"} />
                  <KeyValue label="Saved provider" value={providerLabel(policy.runtimeType || "disabled")} />
                  <KeyValue label="Saved endpoint" value={policy.endpoint || "Not set"} />
                  <KeyValue label="Saved model ID" value={policy.modelName || "Not set"} />
                  <KeyValue label="Runtime id" value={policy.runtimeType || "disabled"} />
                  <KeyValue label="Graph link suggestions" value={store.semanticGraphSettings?.enabled ? "On" : "Off"} />
                </div>
              </section>
            </div>
          </details>
        </form>
        {providerCheck ? (
          <div className={`assistant-provider-check ${checkOk ? "clean" : "blocked"}`}>
            <div className="assistant-provider-check-title">
              {checkOk ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              <strong>{checkOk ? "Connection works" : "Connection failed"}</strong>
            </div>
            <div className="semantic-graph-mini-stats">
              <KeyValue label="Endpoint" value={providerCheck.endpoint || draft.endpoint || "Not set"} />
              <KeyValue
                label={providerCheck.modelDisplayName ? "Detected model" : "Model"}
                value={providerCheck.modelDisplayName
                  ? `${providerCheck.modelDisplayName} (${providerCheck.model})`
                  : providerCheck.model || draft.modelName || "Not set"}
              />
              <KeyValue label="Latency" value={typeof providerCheck.latencyMs === "number" ? `${providerCheck.latencyMs} ms` : "None"} />
              <KeyValue label="Message" value={providerCheck.message || "None"} />
            </div>
          </div>
        ) : null}
      </Panel>
    </Screen>
  );
});

function providerLabel(runtimeType: string): string {
  if (runtimeType === "lm-studio") return "LM Studio";
  if (runtimeType === "ollama") return "Ollama";
  if (runtimeType === "llama-cpp") return "llama.cpp server";
  if (runtimeType === "openai") return "OpenAI API";
  if (runtimeType === "anthropic") return "Claude API";
  if (runtimeType === "custom-openai-compatible") return "OpenAI-compatible API";
  if (runtimeType === "app-managed-llamacpp") return "App-managed local model";
  return "Disabled";
}

function defaultEndpointForProvider(runtimeType: string): string {
  return PROVIDER_DEFAULT_ENDPOINTS[runtimeType] || LM_STUDIO_ENDPOINT;
}

function endpointForProviderSelection(runtimeType: string, currentEndpoint: string): string {
  const trimmed = currentEndpoint.trim();
  const defaultEndpoint = PROVIDER_DEFAULT_ENDPOINTS[runtimeType];
  if (!defaultEndpoint) return currentEndpoint;
  if (!trimmed || Object.values(PROVIDER_DEFAULT_ENDPOINTS).includes(trimmed)) return defaultEndpoint;
  return currentEndpoint;
}

function modelCanBeDetected(runtimeType: string): boolean {
  return runtimeType === "lm-studio" || runtimeType === "ollama" || runtimeType === "llama-cpp" || runtimeType === "app-managed-llamacpp";
}

function providerMayUseApiKey(runtimeType: string): boolean {
  return runtimeType === "openai" || runtimeType === "anthropic" || runtimeType === "custom-openai-compatible";
}
