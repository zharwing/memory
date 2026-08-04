import { observer } from "mobx-react-lite";
import { useStore } from "../stores/store-context.js";

const WORKSTREAM_STATUSES = ["active", "paused", "done", "archived"] as const;

/** The four workstream status buttons (Workstreams screen and Search detail). */
export const WorkstreamStatusActions = observer(function WorkstreamStatusActions({
  workstream
}: {
  workstream: { id: string; status?: string };
}) {
  const store = useStore();

  return (
    <>
      {WORKSTREAM_STATUSES.map((status) => (
        <button
          type="button"
          key={status}
          disabled={workstream.status === status}
          onClick={() => store.workstreams.updateStatus(workstream.id, status)}
        >
          {status}
        </button>
      ))}
    </>
  );
});
