import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { KeyValue, Panel, Screen } from "../components/layout.js";
import { DataTable } from "../components/DataTable.js";
import { DirectoryField } from "../components/DirectoryField.js";

export const ImportScreen = observer(function ImportScreen() {
  const store = useStore();
  const [sourceRoot, setSourceRoot] = useState("");
  const [profile, setProfile] = useState("generic-markdown");
  const [limit, setLimit] = useState("");
  const [conflictStrategy, setConflictStrategy] = useState("skip");

  useEffect(() => {
    if (!store.importProfiles.length) void store.loadImportProfiles();
  }, [store]);

  useEffect(() => {
    if (store.importProfiles.length && !store.importProfiles.some((candidate) => candidate.name === profile)) {
      setProfile(store.importProfiles[0].name);
    }
  }, [store.importProfiles, profile]);

  const candidates = store.importPlan?.candidates || [];
  const selectedProfile = store.importProfiles.find((candidate) => candidate.name === profile);
  const importPresets = [
    { label: "Memory Docs", profile: "markdown-memory", help: "Old MEMORY folders" },
    { label: "Session History", profile: "markdown-sessions", help: "Old SESSIONS folders" },
    { label: "Mixed Workspace", profile: "workspace-markdown", help: "One folder with both" }
  ].filter((preset) => store.importProfiles.some((candidate) => candidate.name === preset.profile));

  return (
    <Screen title="Import">
      <Panel title="How Imports Work">
        <ol className="setup-steps">
          <li>Select or create the memory project that should receive the import.</li>
          <li>Pick the folder that contains old Markdown memory, docs, or session files.</li>
          <li>Preview first. The preview is read-only and shows what will become docs or sessions.</li>
          <li>Commit only after the counts and sample rows look right.</li>
        </ol>
        <p className="panel-help">
          If old memory and sessions live in separate folders, import them one folder at a time: memory docs first, then session history.
        </p>
      </Panel>
      <Panel title="Prepare Import">
        <form className="stacked-form" onSubmit={(event) => {
          event.preventDefault();
          void store.prepareImport({
            sourceRoot,
            profile,
            limit: limit ? Number(limit) : undefined
          });
        }}>
          {importPresets.length ? (
            <div className="quick-presets" aria-label="Import type presets">
              {importPresets.map((preset) => (
                <button
                  key={preset.profile}
                  type="button"
                  className={profile === preset.profile ? "selected" : ""}
                  onClick={() => setProfile(preset.profile)}
                >
                  <span>{preset.label}</span>
                  <small>{preset.help}</small>
                </button>
              ))}
            </div>
          ) : null}
          <label>
            <span>Source folder</span>
            <DirectoryField value={sourceRoot} onChange={setSourceRoot} placeholder="<absolute-path-to-memory-or-sessions-folder>" required />
          </label>
          <label>
            <span>Profile</span>
            <select value={profile} onChange={(event) => setProfile(event.target.value)}>
              {store.importProfiles.map((candidate) => (
                <option key={candidate.name} value={candidate.name}>{candidate.name}</option>
              ))}
            </select>
            {selectedProfile?.description ? (
              <p className="field-help">{selectedProfile.description}</p>
            ) : null}
          </label>
          <label>
            <span>Limit</span>
            <input type="number" min="1" value={limit} onChange={(event) => setLimit(event.target.value)} placeholder="optional" />
            <p className="field-help">Use a small limit for a first test import. Leave empty to preview the whole folder.</p>
          </label>
          {!store.selectedProjectId ? (
            <p className="field-help">Create or select a project before importing.</p>
          ) : null}
          <button type="submit" disabled={!store.selectedProjectId}>Preview Only</button>
        </form>
      </Panel>
      {store.importPlan ? (
        <Panel title="Import Plan">
          <p className="panel-help">Nothing has been written yet. Review the counts and sample rows before committing.</p>
          <div className="dashboard-grid tight">
            <KeyValue label="Plan" value={store.importPlan.id} />
            <KeyValue label="Profile" value={store.importPlan.profileName} />
            <KeyValue label="Total" value={store.importPlan.counts?.total || 0} />
            <KeyValue label="Documents" value={store.importPlan.counts?.documents || 0} />
            <KeyValue label="Sessions" value={store.importPlan.counts?.sessions || 0} />
            <KeyValue label="Warnings" value={store.importPlan.counts?.warnings || 0} />
          </div>
          <form className="inline-form" onSubmit={(event) => {
            event.preventDefault();
            void store.commitImport(conflictStrategy);
          }}>
            <select value={conflictStrategy} onChange={(event) => setConflictStrategy(event.target.value)}>
              <option value="skip">Skip conflicts</option>
              <option value="overwrite">Overwrite conflicts</option>
              <option value="duplicate">Duplicate conflicts</option>
            </select>
            <button type="submit">Commit Reviewed Import</button>
          </form>
          <DataTable columns={["kind", "title", "relativePath", "targetPath", "warnings"]} rows={candidates.slice(0, 40).map((candidate: any) => ({
            ...candidate,
            warnings: Array.isArray(candidate.warnings) ? candidate.warnings.length : 0
          }))} />
        </Panel>
      ) : null}
      {store.importResult ? (
        <Panel title="Import Result">
          <KeyValue label="Committed" value={store.importResult.committed || 0} />
          <KeyValue label="Documents" value={store.importResult.documents || 0} />
          <KeyValue label="Sessions" value={store.importResult.sessions || 0} />
          <KeyValue label="Skipped" value={store.importResult.skipped || 0} />
          <p className="panel-help">
            Imported items are now available in Session History, Docs Library, Search, and Context Preview. Documents can appear in Graph immediately; imported sessions stay out until you enable Include in graph for each important session.
          </p>
        </Panel>
      ) : null}
    </Screen>
  );
});
