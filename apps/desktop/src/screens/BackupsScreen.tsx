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
  useEffect(() => {
    if (store.selectedProjectId) void store.loadBackups();
  }, [store, store.selectedProjectId]);
  return (
    <Screen title="Backups" actions={<button disabled={!store.selectedProjectId} onClick={() => store.loadBackups()}>Refresh</button>}>
      <SettingsTabs />
      <Panel title="Project Snapshot">
        <p>Snapshots copy project memory into `backups/snapshots` while excluding previous backups.</p>
        <button disabled={!store.selectedProjectId} onClick={() => store.createBackup()}>Create Snapshot</button>
      </Panel>
      <Panel title="Snapshots">
        {store.backups.length ? (
          <div className="repo-list">
            {store.backups.map((backup) => (
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
                    onConfirm={() => store.deleteBackup(backup.snapshotPath)}
                  />
                }
              />
            ))}
          </div>
        ) : (
          <Empty text="No snapshots yet." />
        )}
      </Panel>
    </Screen>
  );
});
