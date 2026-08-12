import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";
import { Empty, Panel, Screen } from "../components/layout.js";
import { ConfirmDeleteButton } from "../components/ConfirmDeleteButton.js";
import { ListRow } from "../components/ListRow.js";

export const TrashScreen = observer(function TrashScreen() {
  const store = useStore();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const trashState = store.system.trashResource.state;

  useEffect(() => {
    void store.system.loadTrash();
  }, [store]);

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((candidate) => candidate !== id) : [...current, id]);
  }

  function selectAll() {
    setSelectedIds(store.system.trashItems.map((item) => item.id));
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  return (
    <Screen title="Trash" actions={<button type="button" onClick={() => store.system.loadTrash()}>Refresh</button>}>
      <Panel title="Trash Controls">
        <div className="button-row">
          <button type="button" disabled={!store.system.trashItems.length} onClick={selectAll}>Select All</button>
          <button type="button" disabled={!selectedIds.length} onClick={clearSelection}>Clear Selection</button>
          <ConfirmDeleteButton
            itemType="trash-selection"
            title={`${selectedIds.length} selected trash item${selectedIds.length === 1 ? "" : "s"}`}
            critical
            permanent
            disabled={!selectedIds.length}
            label="Delete Selected Permanently"
            onConfirm={() => store.system.emptyTrash(selectedIds).then(() => setSelectedIds([]))}
          />
        </div>
        <p className="panel-help">
          Items in trash are removed from active project views but can be restored until they are permanently deleted.
        </p>
      </Panel>
      <Panel title="Deleted Items">
        {trashState.status === "idle" || trashState.status === "loading" ? (
          <p className="panel-help" role="status">Loading trash...</p>
        ) : store.system.trashItems.length ? (
          <div className="repo-list">
            {store.system.trashItems.map((item) => (
              <ListRow
                key={item.id}
                leading={
                  <label className="trash-select">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(item.id)}
                      onChange={() => toggleSelected(item.id)}
                    />
                    <span className="sr-only">Select {item.title}</span>
                  </label>
                }
                title={item.title}
                details={
                  <>
                    <span>{item.type} {item.projectName ? `in ${item.projectName}` : ""}</span>
                    <small>{item.deletedAt}</small>
                    {item.originalPath ? <small>{item.originalPath}</small> : null}
                  </>
                }
                actions={
                  <div className="row-actions">
                    <button type="button" disabled={!item.canRestore} onClick={() => store.system.restoreTrashItem(item.id)}>Restore</button>
                    <ConfirmDeleteButton
                      itemType={`trash-${item.type}`}
                      title={item.title}
                      critical
                      permanent
                      label="Delete Permanently"
                      onConfirm={() => store.system.purgeTrashItem(item.id)}
                    />
                  </div>
                }
              />
            ))}
          </div>
        ) : trashState.status === "empty" ? (
          <Empty text="Trash is empty." />
        ) : null}
      </Panel>
    </Screen>
  );
});
