import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { CheckCircle2, PlugZap, Save, XCircle } from "lucide-react";
import { KeyValue, Panel, Screen } from "../components/layout.js";
import { SettingsTabs } from "../components/SectionTabs.js";
import { useStore } from "../stores/store-context.js";

const DEFAULT_ASSISTANT_DRAFT = {
  enabled: false,
  runtimeType: "disabled",
  endpoint: "",
  modelName: "",
  modelPath: "",
  autoAcceptLowRiskMetadata: false
};

export const AssistantScreen = observer(function AssistantScreen() {
  const store = useStore();
  const policy = store.summary?.project?.assistantPolicy || store.selectedProject?.assistantPolicy || DEFAULT_ASSISTANT_DRAFT;
  const status = store.assistantStatus;
  const providerCheck = store.assistantProviderCheck;
  const [draft, setDraft] = useState(DEFAULT_ASSISTANT_DRAFT);

  useEffect(() => {
    setDraft({
      ...DEFAULT_ASSISTANT_DRAFT,
      ...policy,
      endpoint: policy.endpoint || "",
      modelName: policy.modelName || "",
      modelPath: policy.modelPath || ""
    });
  }, [
    store.selectedProjectId,
    policy.enabled,
    policy.runtimeType,
    policy.endpoint,
    policy.modelName,
    policy.modelPath,
    policy.autoAcceptLowRiskMetadata
  ]);

  function updateDraft(patch: Partial<typeof draft>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function savePolicy() {
    void store.updateAssistantPolicy({
      enabled: Boolean(draft.enabled),
      runtimeType: draft.enabled ? draft.runtimeType : "disabled",
      endpoint: draft.endpoint.trim(),
      modelName: draft.modelName.trim(),
      modelPath: draft.modelPath.trim(),
      autoAcceptLowRiskMetadata: Boolean(draft.autoAcceptLowRiskMetadata)
    });
  }

  function testProvider() {
    void store.checkAssistantProvider({
      endpoint: draft.endpoint.trim() || undefined,
      model: draft.modelName.trim() || undefined,
      timeoutMs: 15000,
      maxOutputTokens: 160,
      jsonMode: true
    });
  }

  const checkOk = providerCheck?.ok === true;

  return (
    <Screen title="Memory Assistant">
      <SettingsTabs />
      <Panel title="Provider">
        <div className="dashboard-grid tight assistant-status-grid">
          <KeyValue label="State" value={draft.enabled ? "Enabled" : "Disabled"} />
          <KeyValue label="Runtime" value={draft.runtimeType || "disabled"} />
          <KeyValue label="Endpoint" value={draft.endpoint || "Not set"} />
          <KeyValue label="Model" value={draft.modelName || "Not set"} />
          <KeyValue label="Availability" value={status?.available ? "Available" : "Not checked"} />
          <KeyValue label="AI graph" value={store.semanticGraphSettings?.enabled ? "Enabled" : "Disabled"} />
        </div>
        <form
          className="stacked-form assistant-settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            savePolicy();
          }}
        >
          <div className="settings-columns">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(draft.enabled)}
                disabled={!store.selectedProjectId || store.loading}
                onChange={(event) => updateDraft({
                  enabled: event.target.checked,
                  runtimeType: event.target.checked && draft.runtimeType === "disabled" ? "custom-openai-compatible" : draft.runtimeType
                })}
              />
              <span>Enable assistant provider</span>
            </label>
            <label>
              <span>Runtime</span>
              <select
                value={draft.runtimeType}
                disabled={!store.selectedProjectId || store.loading}
                onChange={(event) => updateDraft({
                  runtimeType: event.target.value,
                  enabled: event.target.value !== "disabled"
                })}
              >
                <option value="disabled">Disabled</option>
                <option value="app-managed-llamacpp">App-managed llama.cpp</option>
                <option value="ollama">Ollama</option>
                <option value="lm-studio">LM Studio</option>
                <option value="custom-openai-compatible">OpenAI-compatible</option>
              </select>
            </label>
            <label>
              <span>Endpoint</span>
              <input
                value={draft.endpoint}
                disabled={!store.selectedProjectId || store.loading}
                onChange={(event) => updateDraft({ endpoint: event.target.value })}
                placeholder="http://127.0.0.1:8080/v1"
              />
            </label>
            <label>
              <span>Model</span>
              <input
                value={draft.modelName}
                disabled={!store.selectedProjectId || store.loading}
                onChange={(event) => updateDraft({ modelName: event.target.value })}
                placeholder="llama-local"
              />
            </label>
            <label>
              <span>Model path</span>
              <input
                value={draft.modelPath}
                disabled={!store.selectedProjectId || store.loading}
                onChange={(event) => updateDraft({ modelPath: event.target.value })}
                placeholder="optional local path"
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
          </div>
          <div className="button-row">
            <button type="submit" className="icon-text-button" disabled={!store.selectedProjectId || store.loading}>
              <Save size={14} />
              Save provider
            </button>
            <button
              type="button"
              className="icon-text-button"
              disabled={!store.selectedProjectId || store.loading || !draft.endpoint.trim()}
              onClick={testProvider}
            >
              <PlugZap size={14} />
              Test endpoint
            </button>
          </div>
        </form>
        {providerCheck ? (
          <div className={`assistant-provider-check ${checkOk ? "clean" : "blocked"}`}>
            <div className="assistant-provider-check-title">
              {checkOk ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
              <strong>{checkOk ? "Endpoint works" : "Endpoint failed"}</strong>
            </div>
            <div className="semantic-graph-mini-stats">
              <KeyValue label="Endpoint" value={providerCheck.endpoint || draft.endpoint || "Not set"} />
              <KeyValue label="Model" value={providerCheck.model || draft.modelName || "Not set"} />
              <KeyValue label="Latency" value={typeof providerCheck.latencyMs === "number" ? `${providerCheck.latencyMs} ms` : "None"} />
              <KeyValue label="Message" value={providerCheck.message || "None"} />
            </div>
          </div>
        ) : null}
      </Panel>
    </Screen>
  );
});
