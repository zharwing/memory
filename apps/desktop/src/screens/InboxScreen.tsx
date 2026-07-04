import { useEffect, useState } from "react";
import { observer } from "mobx-react-lite";
import { useSearchParams } from "react-router-dom";
import { useStore } from "../stores/store-context.js";
import { KeyValue, Panel, Screen } from "../components/layout.js";
import { LibraryTabs } from "../components/SectionTabs.js";
import { DataTable } from "../components/DataTable.js";
import { ConfirmDeleteButton } from "../components/ConfirmDeleteButton.js";
import { graphRulesFromProposalPatch } from "../utils/graph-proposals.js";

export const InboxScreen = observer(function InboxScreen() {
  const store = useStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedProposalId, setSelectedProposalId] = useState(searchParams.get("proposal") || "");
  const selectedProposal = store.inbox.find((item) => item.id === selectedProposalId) || store.inbox[0];
  const graphProposalRules = selectedProposal?.type === "graph-update"
    ? graphRulesFromProposalPatch(selectedProposal.proposedPatch)
    : undefined;

  useEffect(() => {
    const urlProposalId = searchParams.get("proposal") || "";
    setSelectedProposalId((current) => current === urlProposalId ? current : urlProposalId);
  }, [searchParams]);

  useEffect(() => {
    if (selectedProposalId && store.inbox.length > 0 && !store.inbox.some((item) => item.id === selectedProposalId)) {
      closeInboxProposal(true);
    }
  }, [selectedProposalId, store.inbox]);

  function updateInboxSearchParams(proposalId: string | null, replace = false) {
    setSearchParams((current) => {
      const nextParams = new URLSearchParams(current);
      if (proposalId) nextParams.set("proposal", proposalId);
      else nextParams.delete("proposal");
      return nextParams;
    }, { replace });
  }

  function openInboxProposal(proposalId: string) {
    setSelectedProposalId(proposalId);
    updateInboxSearchParams(proposalId);
  }

  function closeInboxProposal(replace = false) {
    setSelectedProposalId("");
    updateInboxSearchParams(null, replace);
  }

  return (
    <Screen title="Memory Inbox">
      <LibraryTabs />
      <DataTable
        columns={["created", "status", "type", "confidence", "reason"]}
        rows={store.inbox}
        selectedRowId={selectedProposal?.id}
        onRowClick={(proposal) => openInboxProposal(proposal.id)}
      />
      {selectedProposal ? (
        <Panel title="Selected Proposal">
          <div className="inline-form compact">
            <select value={selectedProposal.id} onChange={(event) => openInboxProposal(event.target.value)}>
              {store.inbox.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.status} - {item.type} - {item.reason}
                </option>
              ))}
            </select>
            <ConfirmDeleteButton
              itemType="inbox-proposal"
              title={selectedProposal.reason || selectedProposal.type}
              label="Move to Trash"
              onConfirm={async () => {
                const deletedProposalId = selectedProposal.id;
                await store.deleteInboxItem(deletedProposalId);
                if (selectedProposalId === deletedProposalId) closeInboxProposal(true);
              }}
            />
            <button type="button" onClick={() => store.updateInboxStatus(selectedProposal.id, "accepted")}>Mark Accepted</button>
            <button type="button" onClick={() => store.updateInboxStatus(selectedProposal.id, "rejected")}>Reject</button>
            {graphProposalRules ? (
              <button type="button" onClick={() => store.applyGraphRulesProposal(selectedProposal.id, graphProposalRules)}>
                Apply Graph Rules
              </button>
            ) : null}
          </div>
          <KeyValue label="Type" value={selectedProposal.type} />
          <KeyValue label="Source" value={selectedProposal.sourceAgent || selectedProposal.sourceKind || "unknown"} />
          <KeyValue label="Confidence" value={selectedProposal.confidence || "unknown"} />
          <KeyValue label="Reason" value={selectedProposal.reason} />
          <pre className="markdown-preview">{selectedProposal.proposedPatch || "No proposed patch provided."}</pre>
        </Panel>
      ) : null}
    </Screen>
  );
});
