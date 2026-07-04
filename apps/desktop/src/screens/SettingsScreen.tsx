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
  const graphRulesSignature = JSON.stringify(project?.graphRules || []);

  useEffect(() => {
    setGraphRulesDraft(JSON.stringify(project?.graphRules || [], null, 2));
    setGraphRulesError("");
  }, [project?.id, graphRulesSignature]);

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
