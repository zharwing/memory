import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import type { SemanticGraphSettings } from "@zharwing/memory-core";
import { useStore } from "../stores/store-context.js";
import { KeyValue, Panel, Screen } from "../components/layout.js";
import { SettingsTabs } from "../components/SectionTabs.js";
import { useDraft } from "../hooks/useDraft.js";
import { ErrorSummary } from "../components/FormField.js";
import { formatShortDateTime } from "../utils/format.js";

export const SettingsScreen = observer(function SettingsScreen() {
  const store = useStore();
  const project = store.projects.selectedProject;
  const memoryWritePolicy = store.projects.selectedMemoryWritePolicy;
  const [graphRulesDraft, setGraphRulesDraft] = useState("[]");
  const [graphRulesError, setGraphRulesError] = useState("");
  const [semanticDraft, updateSemanticDraft, setSemanticDraft] = useDraft<SemanticSettingsDraft>({});
  const graphRulesSignature = JSON.stringify(project?.graphRules || []);
  const semanticSettingsSignature = JSON.stringify(store.semantic.settings || {});
  const edgeCounts = store.semantic.edgeCounts;
  const latestSemanticRun = store.semantic.status?.runCounts?.latest;
  const semanticPreview = store.semantic.analysisPreview;

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
      ...store.semantic.settings
    });
  }, [project?.id, semanticSettingsSignature]);

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
              disabled={!store.projects.selectedProjectId}
              onChange={(event) => {
                const reviewMode = event.target.value;
                return store.projects.updateMemoryWritePolicy({
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
              disabled={!store.projects.selectedProjectId || memoryWritePolicy.reviewMode === "all"}
              onChange={(event) => store.projects.updateMemoryWritePolicy({ allowAgentDirectWrites: event.target.checked })}
            />
            <span>Allow agents to write memory directly</span>
          </label>
        </div>
      </Panel>
      <Panel title="Advanced AI Graph">
        <div className="dashboard-grid tight semantic-status-grid">
          <KeyValue label="AI analysis" value={semanticDraft.enabled ? "Enabled" : "Disabled"} />
          <KeyValue label="Mode" value={semanticDraft.mode || "review"} />
          <KeyValue label="Accepted edges" value={(edgeCounts.accepted || 0) + (edgeCounts["auto-accepted"] || 0)} />
          <KeyValue label="Proposed edges" value={edgeCounts.proposed || 0} />
          <KeyValue label="Rejected edges" value={edgeCounts.rejected || 0} />
          <KeyValue label="Latest run" value={latestSemanticRun?.started ? formatShortDateTime(latestSemanticRun.started) : "None"} />
        </div>
        <form className="stacked-form semantic-settings-form" onSubmit={(event) => {
          event.preventDefault();
          void store.semantic.updateSettings({
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
                disabled={!store.projects.selectedProjectId}
                onChange={(event) => updateSemanticDraft({ enabled: event.target.checked })}
              />
              <span>Enable AI relationship analysis</span>
            </label>
            <label>
              <span>Mode</span>
              <select
                value={semanticDraft.mode || "review"}
                disabled={!store.projects.selectedProjectId}
                onChange={(event) => updateSemanticDraft({
                  mode: event.target.value as SemanticGraphSettings["mode"]
                })}
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
                autoComplete="off"
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
                autoComplete="off"
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
            <button type="submit" disabled={!store.projects.selectedProjectId || store.semantic.loading}>Save Semantic Graph</button>
            <button
              type="button"
              disabled={!store.projects.selectedProjectId || store.semantic.loading}
              onClick={() => store.semantic.previewAnalysis({ kind: "all-docs" })}
            >
              Preview Analysis
            </button>
            <button
              type="button"
              disabled={store.semantic.loading}
              onClick={() => setSemanticDraft({ ...store.semantic.settings })}
            >
              Reset
            </button>
          </div>
        </form>
        {semanticPreview ? (
          <div className="semantic-preview">
            <KeyValue label="Eligible docs" value={semanticPreview.counts?.documentsEligible ?? 0} />
            <KeyValue label="Excluded docs" value={semanticPreview.counts?.documentsExcluded ?? 0} />
            <KeyValue label="Cached extractions" value={semanticPreview.counts?.cachedExtractions ?? 0} />
            <KeyValue label="Baseline extractions" value={semanticPreview.counts?.baselineExtractions ?? 0} />
            <KeyValue label="Candidates" value={semanticPreview.counts?.candidates ?? 0} />
            <KeyValue label="Candidate index" value={semanticPreview.candidateIndexPath || "Not persisted"} />
          </div>
        ) : null}
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
            void store.graph.updateGraphRules(parsed);
          } catch {
            setGraphRulesError("Enter a JSON array of graph rule objects.");
          }
        }}>
          <ErrorSummary errors={graphRulesError ? [{ id: "graph-rules-json", message: graphRulesError }] : []} />
          <label htmlFor="graph-rules-json">
            <span>Rules JSON</span>
            <textarea
              id="graph-rules-json"
              className="graph-rules-editor"
              value={graphRulesDraft}
              onChange={(event) => setGraphRulesDraft(event.target.value)}
              spellCheck={false}
              aria-invalid={graphRulesError ? true : undefined}
              aria-describedby={graphRulesError ? "graph-rules-json-error" : undefined}
              placeholder={'[\n  { "match": "apps/*", "nodeType": "package", "topic": "frontend" },\n  { "match": "services/*", "nodeType": "service", "topic": "backend" }\n]'}
            />
          </label>
          {graphRulesError ? <p id="graph-rules-json-error" className="field-error">{graphRulesError}</p> : null}
          <div className="inline-form compact">
            <button type="submit" disabled={!store.projects.selectedProjectId || store.graph.loading}>Save Graph Rules</button>
            <button
              type="button"
              disabled={store.graph.loading}
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

type SemanticSettingsDraft = Partial<Omit<SemanticGraphSettings,
  | "autoAcceptThreshold"
  | "reviewThreshold"
  | "discardBelowThreshold"
  | "maxCandidatesPerDocument"
  | "maxClusterSize"
>> & {
  autoAcceptThreshold?: number | string;
  reviewThreshold?: number | string;
  discardBelowThreshold?: number | string;
  maxCandidatesPerDocument?: number | string;
  maxClusterSize?: number | string;
};
