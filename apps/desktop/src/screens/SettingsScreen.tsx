import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { KeyValue, Panel, Screen } from "../components/layout.js";
import { SettingsTabs } from "../components/SectionTabs.js";

export const SettingsScreen = observer(function SettingsScreen() {
  const store = useStore();
  const project = store.selectedProject;
  const memoryWritePolicy = store.selectedMemoryWritePolicy;
  const [graphRulesDraft, setGraphRulesDraft] = useState("[]");
  const [graphRulesError, setGraphRulesError] = useState("");
  const [semanticDraft, setSemanticDraft] = useState<any>({});
  const graphRulesSignature = JSON.stringify(project?.graphRules || []);
  const semanticSettingsSignature = JSON.stringify(store.semanticGraphSettings || {});
  const edgeCounts = store.semanticGraphEdgeCounts;
  const latestSemanticRun = store.semanticGraphStatus?.runCounts?.latest;

  useEffect(() => {
    setGraphRulesDraft(JSON.stringify(project?.graphRules || [], null, 2));
    setGraphRulesError("");
  }, [project?.id, graphRulesSignature]);

  useEffect(() => {
    setSemanticDraft({
      enabled: false,
      mode: "review",
      autoAcceptThreshold: 0.9,
      reviewThreshold: 0.62,
      discardBelowThreshold: 0.35,
      maxCandidatesPerDocument: 12,
      maxClusterSize: 16,
      includeDeterministicSignals: true,
      includeVectorCandidates: false,
      remoteProvidersEnabled: false,
      ...store.semanticGraphSettings
    });
  }, [project?.id, semanticSettingsSignature]);

  function updateSemanticDraft(patch: Record<string, unknown>) {
    setSemanticDraft((current: any) => ({ ...current, ...patch }));
  }

  return (
    <Screen title="Project Settings">
      <SettingsTabs />
      <Panel title="Project">
        <KeyValue label="ID" value={project?.id || "None"} />
        <KeyValue label="Memory root" value={project?.memoryRoot || "None"} />
        <KeyValue label="Linked repos" value={project?.repos?.length || 0} />
        <KeyValue label="Startup mode" value={project?.contextPolicy?.startupMode || "None"} />
        <KeyValue label="Assistant" value={project?.assistantPolicy?.runtimeType || "disabled"} />
      </Panel>
      <Panel title="Memory Write Mode">
        <p className="panel-help">
          Direct mode lets connected agents save session progress and durable project memory without sending every update through the inbox.
        </p>
        <div className="stacked-form">
          <label>
            <span>Review mode</span>
            <select
              value={memoryWritePolicy.reviewMode}
              disabled={!store.selectedProjectId}
              onChange={(event) => {
                const reviewMode = event.target.value;
                return store.updateMemoryWritePolicy({
                  reviewMode,
                  allowAgentDirectWrites: reviewMode === "all" ? false : true
                });
              }}
            >
              <option value="off">Off - write directly</option>
              <option value="risky-only">Risky updates only</option>
              <option value="all">Review every memory update</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={memoryWritePolicy.allowAgentDirectWrites}
              disabled={!store.selectedProjectId || memoryWritePolicy.reviewMode === "all"}
              onChange={(event) => store.updateMemoryWritePolicy({ allowAgentDirectWrites: event.target.checked })}
            />
            <span>Allow agents to write memory directly</span>
          </label>
        </div>
      </Panel>
      <Panel title="Semantic Graph">
        <div className="dashboard-grid tight semantic-status-grid">
          <KeyValue label="State" value={semanticDraft.enabled ? "Enabled" : "Disabled"} />
          <KeyValue label="Mode" value={semanticDraft.mode || "review"} />
          <KeyValue label="Accepted edges" value={(edgeCounts.accepted || 0) + (edgeCounts["auto-accepted"] || 0)} />
          <KeyValue label="Proposed edges" value={edgeCounts.proposed || 0} />
          <KeyValue label="Rejected edges" value={edgeCounts.rejected || 0} />
          <KeyValue label="Latest run" value={latestSemanticRun?.started || "None"} />
        </div>
        <form className="stacked-form semantic-settings-form" onSubmit={(event) => {
          event.preventDefault();
          void store.updateSemanticGraphSettings({
            enabled: Boolean(semanticDraft.enabled),
            mode: semanticDraft.mode || "review",
            providerId: semanticDraft.providerId?.trim() || undefined,
            providerKind: semanticDraft.providerKind?.trim() || undefined,
            model: semanticDraft.model?.trim() || undefined,
            autoAcceptThreshold: Number(semanticDraft.autoAcceptThreshold),
            reviewThreshold: Number(semanticDraft.reviewThreshold),
            discardBelowThreshold: Number(semanticDraft.discardBelowThreshold),
            maxCandidatesPerDocument: Number(semanticDraft.maxCandidatesPerDocument),
            maxClusterSize: Number(semanticDraft.maxClusterSize),
            includeDeterministicSignals: Boolean(semanticDraft.includeDeterministicSignals),
            includeVectorCandidates: Boolean(semanticDraft.includeVectorCandidates),
            remoteProvidersEnabled: Boolean(semanticDraft.remoteProvidersEnabled)
          });
        }}>
          <div className="settings-columns">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(semanticDraft.enabled)}
                disabled={!store.selectedProjectId}
                onChange={(event) => updateSemanticDraft({ enabled: event.target.checked })}
              />
              <span>Enable semantic graph overlay</span>
            </label>
            <label>
              <span>Mode</span>
              <select
                value={semanticDraft.mode || "review"}
                disabled={!store.selectedProjectId}
                onChange={(event) => updateSemanticDraft({ mode: event.target.value })}
              >
                <option value="review">Review</option>
                <option value="auto">Auto</option>
                <option value="dry-run">Dry run</option>
              </select>
            </label>
            <label>
              <span>Provider ID</span>
              <input
                value={semanticDraft.providerId || ""}
                onChange={(event) => updateSemanticDraft({ providerId: event.target.value })}
                placeholder="local-llama"
              />
            </label>
            <label>
              <span>Provider kind</span>
              <select
                value={semanticDraft.providerKind || ""}
                onChange={(event) => updateSemanticDraft({ providerKind: event.target.value || undefined })}
              >
                <option value="">Not selected</option>
                <option value="llama.cpp">llama.cpp</option>
                <option value="ollama">Ollama</option>
                <option value="lm-studio">LM Studio</option>
                <option value="openai-compatible">OpenAI-compatible</option>
                <option value="anthropic">Anthropic</option>
                <option value="codex">Codex</option>
                <option value="claude">Claude</option>
                <option value="mcp">MCP</option>
              </select>
            </label>
            <label>
              <span>Model</span>
              <input
                value={semanticDraft.model || ""}
                onChange={(event) => updateSemanticDraft({ model: event.target.value })}
                placeholder="model name"
              />
            </label>
          </div>
          <div className="settings-columns">
            <label>
              <span>Auto accept threshold</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={semanticDraft.autoAcceptThreshold ?? 0.9}
                onChange={(event) => updateSemanticDraft({ autoAcceptThreshold: event.target.value })}
              />
            </label>
            <label>
              <span>Review threshold</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={semanticDraft.reviewThreshold ?? 0.62}
                onChange={(event) => updateSemanticDraft({ reviewThreshold: event.target.value })}
              />
            </label>
            <label>
              <span>Discard below</span>
              <input
                type="number"
                min="0"
                max="1"
                step="0.01"
                value={semanticDraft.discardBelowThreshold ?? 0.35}
                onChange={(event) => updateSemanticDraft({ discardBelowThreshold: event.target.value })}
              />
            </label>
            <label>
              <span>Max candidates per doc</span>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={semanticDraft.maxCandidatesPerDocument ?? 12}
                onChange={(event) => updateSemanticDraft({ maxCandidatesPerDocument: event.target.value })}
              />
            </label>
            <label>
              <span>Max cluster size</span>
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                value={semanticDraft.maxClusterSize ?? 16}
                onChange={(event) => updateSemanticDraft({ maxClusterSize: event.target.value })}
              />
            </label>
          </div>
          <div className="settings-columns checkbox-grid">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(semanticDraft.includeDeterministicSignals)}
                onChange={(event) => updateSemanticDraft({ includeDeterministicSignals: event.target.checked })}
              />
              <span>Use deterministic graph signals</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(semanticDraft.includeVectorCandidates)}
                onChange={(event) => updateSemanticDraft({ includeVectorCandidates: event.target.checked })}
              />
              <span>Use vector candidates</span>
            </label>
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={Boolean(semanticDraft.remoteProvidersEnabled)}
                onChange={(event) => updateSemanticDraft({ remoteProvidersEnabled: event.target.checked })}
              />
              <span>Allow remote providers</span>
            </label>
          </div>
          <div className="inline-form compact">
            <button type="submit" disabled={!store.selectedProjectId || store.loading}>Save Semantic Graph</button>
            <button
              type="button"
              disabled={store.loading}
              onClick={() => setSemanticDraft({ ...store.semanticGraphSettings })}
            >
              Reset
            </button>
          </div>
        </form>
      </Panel>
      <Panel title="Graph Rules">
        <p className="panel-help">
          Rules map imported paths to graph context nodes. Use them when another project stores memory under folders like apps, packages, services, domains, or teams.
        </p>
        <form className="stacked-form" onSubmit={(event) => {
          event.preventDefault();
          try {
            const parsed = JSON.parse(graphRulesDraft || "[]");
            if (!Array.isArray(parsed)) throw new Error("Graph rules must be a JSON array.");
            setGraphRulesError("");
            void store.updateGraphRules(parsed);
          } catch (error) {
            setGraphRulesError(error instanceof Error ? error.message : String(error));
          }
        }}>
          <label>
            <span>Rules JSON</span>
            <textarea
              className="graph-rules-editor"
              value={graphRulesDraft}
              onChange={(event) => setGraphRulesDraft(event.target.value)}
              spellCheck={false}
              placeholder={'[\n  { "match": "apps/*", "nodeType": "package", "topic": "frontend" },\n  { "match": "services/*", "nodeType": "service", "topic": "backend" }\n]'}
            />
          </label>
          {graphRulesError ? <p className="form-error">{graphRulesError}</p> : null}
          <div className="inline-form compact">
            <button type="submit" disabled={!store.selectedProjectId || store.loading}>Save Graph Rules</button>
            <button
              type="button"
              disabled={store.loading}
              onClick={() => {
                setGraphRulesDraft(JSON.stringify(project?.graphRules || [], null, 2));
                setGraphRulesError("");
              }}
            >
              Reset
            </button>
          </div>
        </form>
      </Panel>
    </Screen>
  );
});
