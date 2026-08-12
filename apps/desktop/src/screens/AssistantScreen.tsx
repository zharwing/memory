import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { CheckCircle2, Loader2, PlugZap, Save, XCircle } from "lucide-react";
import { PROVIDER_DEFAULTS, type ProviderDefault } from "@zharwing/memory-core";
import { Empty, KeyValue, Panel, Screen } from "../components/layout.js";
import { SettingsTabs } from "../components/SectionTabs.js";
import { useDraft } from "../hooks/useDraft.js";
import { providerLabel } from "../utils/labels.js";
import { useStore } from "../stores/store-context.js";

const LEGACY_LM_STUDIO_MODEL = "llm";
const PROVIDER_DEFAULT_ENDPOINT_VALUES = Object.values(PROVIDER_DEFAULTS as Record<string, ProviderDefault>)
  .map((provider) => provider.endpoint)
  .filter((endpoint): endpoint is string => Boolean(endpoint));

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
  const policy = store.projects.summary?.project?.assistantPolicy || store.projects.selectedProject?.assistantPolicy || DEFAULT_ASSISTANT_DRAFT;
  const status = store.assistant.status;
  const providerCheck = store.assistant.providerCheck;
  const [draft, updateDraft, setDraft] = useDraft(DEFAULT_ASSISTANT_DRAFT);
  const [providerSecret, setProviderSecret] = useState("");
  const [connectionAction, setConnectionAction] = useState<"save-test" | "test" | null>(null);
  const selectedProvider = draft.runtimeType === "disabled" ? "lm-studio" : draft.runtimeType;

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
    setProviderSecret("");
  }, [
    store.projects.selectedProjectId,
    policy.enabled,
    policy.runtimeType,
    policy.endpoint,
    policy.modelName,
    policy.modelDisplayName,
    policy.modelPath,
    policy.autoAcceptLowRiskMetadata
  ]);

  useEffect(() => {
    setProviderSecret("");
    if (store.projects.selectedProjectId) {
      void store.assistant.loadProviderSecretStatus(selectedProvider);
    }
  }, [store.projects.selectedProjectId, selectedProvider]);

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
    await store.assistant.updatePolicy(assistantPolicyPayload());
  }

  async function saveAndTestConnection() {
    setConnectionAction("save-test");
    try {
      await store.assistant.updatePolicy(assistantPolicyPayload());
      if (providerSecret.trim()) {
        const stored = await store.assistant.saveProviderSecret(selectedProvider, providerSecret.trim());
        setProviderSecret("");
        if (!stored) return;
      }
      const result = await store.assistant.checkProvider({
        providerKind: selectedProvider,
        endpoint: draft.endpoint.trim() || undefined,
        model: modelForProviderCheck(),
        timeoutMs: 60000,
        maxOutputTokens: 768,
        jsonMode: false
      });
      if (result?.ok && result.model) {
        const modelDisplayName = typeof result.modelDisplayName === "string" ? result.modelDisplayName : "";
        updateDraft({ modelName: result.model, modelDisplayName });
        await store.assistant.updatePolicy(assistantPolicyPayload({ modelName: result.model, modelDisplayName }));
        return;
      }
      await store.assistant.updatePolicy(assistantPolicyPayload());
    } catch {
      return;
    } finally {
      setConnectionAction(null);
    }
  }

  async function testProvider() {
    setConnectionAction("test");
    try {
      const result = await store.assistant.checkProvider({
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
  const canTestConnection = Boolean(store.projects.selectedProjectId && draft.enabled && draft.endpoint.trim());

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
              disabled={!store.projects.selectedProjectId || store.assistant.loading}
              onChange={(event) => setAssistantEnabled(event.target.checked)}
            />
            <span>Enable AI assistant</span>
          </label>

          {!draft.enabled ? (
            <Empty
              className="assistant-disabled-state"
              title="AI Assistant is off"
              body="Turn this on to let Zharwing Memory use a local AI provider for document analysis and graph link suggestions."
            />
          ) : (
            <>
              <div className="assistant-connect-fields">
                <label>
                  <span>Provider</span>
                  <select
                    value={selectedProvider}
                    disabled={!store.projects.selectedProjectId || store.assistant.loading}
                    onChange={(event) => chooseProvider(event.target.value)}
                  >
                    <option value="lm-studio">LM Studio</option>
                    <option value="ollama">Ollama</option>
                    <option value="llama-cpp">llama.cpp server</option>
                    <option value="openai">OpenAI API</option>
                    <option value="anthropic">Claude API</option>
                    <option value="custom-openai-compatible">OpenAI-compatible API</option>
                    {selectedProvider === "app-managed-llamacpp" ? (
                      <option value="app-managed-llamacpp" disabled>Legacy app-managed local model (unsupported)</option>
                    ) : null}
                  </select>
                </label>
                <label>
                  <span>Endpoint</span>
                  <input
                    value={draft.endpoint}
                    disabled={!store.projects.selectedProjectId || store.assistant.loading}
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
                      disabled={!store.projects.selectedProjectId || store.assistant.loading}
                      onChange={(event) => updateDraft({ modelName: event.target.value, modelDisplayName: "" })}
                      placeholder="Model name"
                    />
                  </label>
                )}
                {providerMayUseApiKey(selectedProvider) ? (
                  <label>
                    <span>Provider API key</span>
                    <input
                      type="password"
                      disabled={!store.projects.selectedProjectId || store.assistant.loading}
                      autoComplete="new-password"
                      spellCheck={false}
                      value={providerSecret}
                      onChange={(event) => setProviderSecret(event.target.value)}
                      placeholder={store.assistant.providerSecretStatus?.configured ? "Stored securely - enter to rotate" : "Stored by the local daemon"}
                    />
                    <small>
                      {store.assistant.providerSecretStatus?.configured
                        ? "A write-only credential is configured. Its value cannot be read back."
                        : "The value is encrypted outside the project and cleared from this form immediately."}
                    </small>
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
                <p className="assistant-provider-hint">Store the OpenAI key once in the local daemon. It is never written to project settings or returned to the app.</p>
              ) : null}
              {selectedProvider === "anthropic" ? (
                <p className="assistant-provider-hint">Store the Claude key once in the local daemon. It is never written to project settings or returned to the app.</p>
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
              disabled={!canTestConnection || store.assistant.loading || testingConnection}
              aria-busy={testingSaveAndConnection}
              title={!draft.enabled ? "Turn on AI assistant to test the connection." : undefined}
            >
              {testingSaveAndConnection ? <Loader2 className="button-spinner" size={14} /> : <PlugZap size={14} />}
              {testingSaveAndConnection ? "Testing..." : "Save & test connection"}
            </button>
            <button
              type="button"
              className="icon-text-button"
              disabled={!store.projects.selectedProjectId || store.assistant.loading}
              onClick={() => void savePolicy()}
            >
              <Save size={14} />
              Save only
            </button>
            <button
              type="button"
              className="icon-text-button"
              disabled={!canTestConnection || store.assistant.loading || testingConnection}
              aria-busy={testingConnectionOnly}
              onClick={() => void testProvider()}
              title={!draft.enabled ? "Turn on AI assistant to test the connection." : undefined}
            >
              {testingConnectionOnly ? <Loader2 className="button-spinner" size={14} /> : <PlugZap size={14} />}
              {testingConnectionOnly ? "Testing..." : "Test connection"}
            </button>
            {providerMayUseApiKey(selectedProvider) && store.assistant.providerSecretStatus?.configured ? (
              <button
                type="button"
                className="icon-text-button danger"
                disabled={store.assistant.loading}
                onClick={() => void store.assistant.clearProviderSecret()}
              >
                Clear stored key
              </button>
            ) : null}
          </div>

          <details className="advanced-fields assistant-advanced-fields">
            <summary>Advanced settings</summary>
            <div className="advanced-fields-body">
              {autoDetectsModel ? (
                <label>
                  <span>Model ID override</span>
                  <input
                    value={draft.modelName}
                    disabled={!store.projects.selectedProjectId || store.assistant.loading}
                    onChange={(event) => updateDraft({ modelName: event.target.value, modelDisplayName: "" })}
                    placeholder="Leave blank to auto-detect"
                  />
                </label>
              ) : null}
              <label>
                <span>Model path</span>
                <input
                  value={draft.modelPath}
                  disabled={!store.projects.selectedProjectId || store.assistant.loading}
                  onChange={(event) => updateDraft({ modelPath: event.target.value })}
                  placeholder="Only needed if Zharwing Memory launches the model itself"
                />
              </label>
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={Boolean(draft.autoAcceptLowRiskMetadata)}
                  disabled={!store.projects.selectedProjectId || store.assistant.loading}
                  onChange={(event) => updateDraft({ autoAcceptLowRiskMetadata: event.target.checked })}
                />
                <span>Auto-accept low-risk metadata</span>
              </label>
              <section className="assistant-diagnostics">
                <h4>Advanced diagnostics</h4>
                <div className="dashboard-grid tight">
                  <KeyValue label="Saved assistant" value={policy.enabled ? "On" : "Off"} />
                  <KeyValue label="Saved provider" value={providerLabel(policy.runtimeType || "disabled", "Disabled")} />
                  <KeyValue label="Saved endpoint" value={policy.endpoint || "Not set"} />
                  <KeyValue label="Saved model ID" value={policy.modelName || "Not set"} />
                  <KeyValue label="Runtime id" value={policy.runtimeType || "disabled"} />
                  <KeyValue label="Graph link suggestions" value={store.semantic.settings?.enabled ? "On" : "Off"} />
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

function providerDefaultEndpoint(runtimeType: string): string | undefined {
  return (PROVIDER_DEFAULTS as Partial<Record<string, ProviderDefault>>)[runtimeType]?.endpoint;
}

function defaultEndpointForProvider(runtimeType: string): string {
  return providerDefaultEndpoint(runtimeType) || PROVIDER_DEFAULTS["lm-studio"].endpoint;
}

function endpointForProviderSelection(runtimeType: string, currentEndpoint: string): string {
  const trimmed = currentEndpoint.trim();
  const defaultEndpoint = providerDefaultEndpoint(runtimeType);
  if (!defaultEndpoint) return currentEndpoint;
  if (!trimmed || PROVIDER_DEFAULT_ENDPOINT_VALUES.includes(trimmed)) return defaultEndpoint;
  return currentEndpoint;
}

function modelCanBeDetected(runtimeType: string): boolean {
  return runtimeType === "lm-studio" || runtimeType === "ollama" || runtimeType === "llama-cpp";
}

function providerMayUseApiKey(runtimeType: string): boolean {
  return runtimeType === "openai" || runtimeType === "anthropic" || runtimeType === "custom-openai-compatible";
}
