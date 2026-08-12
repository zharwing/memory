import { useEffect } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { Empty, Panel, Screen } from "../components/layout.js";
import { SettingsTabs } from "../components/SectionTabs.js";
import { ConfirmDeleteButton } from "../components/ConfirmDeleteButton.js";
import { ListRow } from "../components/ListRow.js";
import { formatShortDateTime } from "../utils/format.js";

export const BackupsScreen = observer(function BackupsScreen() {
  const store = useStore();
  const backupsState = store.system.backupsResource.state;
  useEffect(() => {
    if (store.projects.selectedProjectId) void store.system.loadBackups();
  }, [store, store.projects.selectedProjectId]);
  return (
    <Screen title="Backups" actions={<button type="button" disabled={!store.projects.selectedProjectId} onClick={() => store.system.loadBackups()}>Refresh</button>}>
      <SettingsTabs />
      <Panel title="Project Snapshot">
        <p>Snapshots copy project memory into `backups/snapshots` while excluding previous backups.</p>
        <button type="button" disabled={!store.projects.selectedProjectId} onClick={() => store.system.createBackup()}>Create Snapshot</button>
      </Panel>
      <Panel title="Snapshots">
        {backupsState.status === "idle" || backupsState.status === "loading" ? (
          <p className="panel-help" role="status">Loading snapshots...</p>
        ) : store.system.backups.length ? (
          <div className="repo-list">
            {store.system.backups.map((backup) => (
              <ListRow
                key={backup.snapshotPath}
                title={formatShortDateTime(backup.created)}
                details={
                  <>
                    <span>{backup.snapshotPath}</span>
                    <small>{backup.note}</small>
                  </>
                }
                actions={
                  <ConfirmDeleteButton
                    itemType="backup"
                    title={`Snapshot ${backup.created}`}
                    label="Move to Trash"
                    onConfirm={() => store.system.deleteBackup(backup.snapshotPath)}
                  />
                }
              />
            ))}
          </div>
        ) : backupsState.status === "empty" ? (
          <Empty text="No snapshots yet." />
        ) : null}
      </Panel>
    </Screen>
  );
});
