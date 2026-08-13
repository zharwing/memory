import { observer } from "mobx-react-lite";
import type { Workstream } from "@zharwing/memory-core";

const WORKSTREAM_STATUSES = ["active", "paused", "done", "archived"] as const;
export type WorkstreamActionStatus = (typeof WORKSTREAM_STATUSES)[number];

/** The four workstream status buttons (Workstreams screen and Search detail). */
export const WorkstreamStatusActions = observer(function WorkstreamStatusActions({
  workstream,
  onStatusChange
}: {
  workstream: Pick<Workstream, "id" | "status">;
  onStatusChange: (workstreamId: string, status: WorkstreamActionStatus) => void | Promise<void>;
}) {
  return (
    <>
      {WORKSTREAM_STATUSES.map((status) => (
        <button
          type="button"
          key={status}
          disabled={workstream.status === status}
          onClick={() => void onStatusChange(workstream.id, status)}
        >
          {status}
        </button>
      ))}
    </>
  );
});
