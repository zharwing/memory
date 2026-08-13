import type {
  MemoryDocument,
  ProposedMemoryUpdate,
  SearchResult,
  Workstream,
  WorkstreamDetail
} from "@zharwing/memory-core";
import type { SessionListItem } from "../../stores/session-store.js";
import { graphRulesFromProposalPatch } from "../../utils/graph-proposals.js";
import { searchResultTypeLabel, statusLabel, visibilityLabel } from "../../utils/labels.js";
import { ConfirmDeleteButton } from "../ConfirmDeleteButton.js";
import { KeyValue, Panel, RawTextPreview } from "../layout.js";
import { MarkdownPreview } from "../markdown/MarkdownPreview.js";
import { WorkstreamStatusActions } from "../WorkstreamStatusActions.js";

export interface SearchResultActions {
  readonly editDocument: (documentId: string) => void;
  readonly deleteDocument: (documentId: string) => Promise<void>;
  readonly deleteSession: (sessionId: string) => Promise<void>;
  readonly deleteWorkstream: (workstreamId: string) => Promise<void>;
  readonly updateWorkstreamStatus: (
    workstreamId: string,
    status: "active" | "paused" | "done" | "archived"
  ) => Promise<void>;
  readonly updateProposalStatus: (proposalId: string, status: "accepted" | "rejected") => Promise<void>;
  readonly applyGraphRules: (
    proposalId: string,
    rules: NonNullable<ReturnType<typeof graphRulesFromProposalPatch>>
  ) => Promise<void>;
  readonly deleteProposal: (proposalId: string) => Promise<void>;
}

export type SearchResultDetailModel =
  | { readonly kind: "document"; readonly result: SearchResult; readonly document?: MemoryDocument }
  | { readonly kind: "session"; readonly result: SearchResult; readonly session?: SessionListItem }
  | {
      readonly kind: "workstream";
      readonly result: SearchResult;
      readonly workstream?: Workstream;
      readonly detail?: WorkstreamDetail;
    }
  | { readonly kind: "proposed-update"; readonly result: SearchResult; readonly proposal?: ProposedMemoryUpdate }
  | { readonly kind: "context-bundle"; readonly result: SearchResult };

export function SearchResultDetail({
  model,
  actions
}: {
  model: SearchResultDetailModel;
  actions: SearchResultActions;
}) {
  if (model.kind === "document") {
    const { document, result } = model;
    const isDiagram = document?.type === "diagram";
    return (
      <Panel title={isDiagram ? "Selected Diagram" : "Selected Document"}>
        <div className="button-row">
          <button type="button" disabled={!document} onClick={() => document && actions.editDocument(document.id)}>
            {isDiagram ? "Open Diagram Editor" : "Open Document Editor"}
          </button>
          {document ? (
            <ConfirmDeleteButton
              itemType="document"
              title={document.title}
              critical={["overview", "privacy", "commands", "glossary"].includes(document.type)}
              label="Move to Trash"
              onConfirm={() => actions.deleteDocument(document.id)}
            />
          ) : null}
        </div>
        <div className="dashboard-grid tight">
          <KeyValue label="Kind" value={searchResultTypeLabel(document?.type || result.type)} />
          <KeyValue label="State" value={statusLabel(document?.status || result.status)} />
          <KeyValue label="AI access" value={visibilityLabel(document?.visibility || result.visibility)} />
          <KeyValue label="Updated" value={document?.updated || result.updated || "unknown"} />
          <KeyValue label="Path" value={<code className="path-value">{document?.filePath || result.path || "memory"}</code>} />
        </div>
        {document ? (
          <div className="search-result-detail"><MarkdownPreview body={document.body} /></div>
        ) : (
          <p className="panel-help">This search result was returned by the daemon, but the document is not loaded in the desktop store yet. Refresh the project and search again.</p>
        )}
      </Panel>
    );
  }

  if (model.kind === "session") {
    const { result, session } = model;
    return (
      <Panel title="Selected Session">
        <div className="button-row">
          {session ? (
            <ConfirmDeleteButton
              itemType="session"
              title={session.taskTitle}
              critical={session.status === "active"}
              label="Move to Trash"
              onConfirm={() => actions.deleteSession(session.id)}
            />
          ) : null}
        </div>
        <div className="dashboard-grid tight">
          <KeyValue label="State" value={statusLabel(session?.status || result.status)} />
          <KeyValue label="Agent" value={session?.agent || "unknown"} />
          <KeyValue label="Updated" value={session?.updated || result.updated || "unknown"} />
          <KeyValue label="Path" value={<code className="path-value">{result.path || "memory"}</code>} />
        </div>
        <RawTextPreview text={session?.body || result.snippet} fallback="Loading session body..." />
      </Panel>
    );
  }

  if (model.kind === "workstream") {
    const { result, workstream } = model;
    return (
      <Panel title="Selected Workstream">
        <div className="button-row">
          {workstream ? (
            <>
              <WorkstreamStatusActions
                workstream={workstream}
                onStatusChange={actions.updateWorkstreamStatus}
              />
              <ConfirmDeleteButton itemType="workstream" title={workstream.name} label="Move to Trash" onConfirm={() => actions.deleteWorkstream(workstream.id)} />
            </>
          ) : null}
        </div>
        <div className="dashboard-grid tight">
          <KeyValue label="State" value={statusLabel(workstream?.status || result.status)} />
          <KeyValue label="Topics" value={workstream?.topics.join(", ") || "none"} />
          <KeyValue label="Sessions" value={model.detail?.sessions.length || 0} />
          <KeyValue label="Documents" value={model.detail?.documents.length || 0} />
          <KeyValue label="Path" value={<code className="path-value">{workstream?.filePath || result.path || "memory"}</code>} />
        </div>
        <RawTextPreview text={workstream?.body || result.snippet} fallback="Workstream details are loading." />
      </Panel>
    );
  }

  if (model.kind === "proposed-update") {
    const { proposal, result } = model;
    const rules = proposal?.type === "graph-update" ? graphRulesFromProposalPatch(proposal.proposedPatch) : undefined;
    return (
      <Panel title="Selected Inbox Proposal">
        <div className="button-row">
          {proposal ? (
            <>
              <button type="button" onClick={() => actions.updateProposalStatus(proposal.id, "accepted")}>Mark Accepted</button>
              <button type="button" onClick={() => actions.updateProposalStatus(proposal.id, "rejected")}>Reject</button>
              {rules ? <button type="button" onClick={() => actions.applyGraphRules(proposal.id, rules)}>Apply Graph Rules</button> : null}
              <ConfirmDeleteButton itemType="inbox-proposal" title={proposal.reason || proposal.type} label="Move to Trash" onConfirm={() => actions.deleteProposal(proposal.id)} />
            </>
          ) : null}
        </div>
        <div className="dashboard-grid tight">
          <KeyValue label="Kind" value={searchResultTypeLabel(proposal?.type || result.type)} />
          <KeyValue label="State" value={statusLabel(proposal?.status || result.status)} />
          <KeyValue label="Confidence" value={proposal?.confidence || "unknown"} />
          <KeyValue label="Created" value={proposal?.created || result.updated || "unknown"} />
        </div>
        <RawTextPreview text={proposal?.proposedPatch || result.snippet} fallback="Proposal details are not loaded." />
      </Panel>
    );
  }

  return (
    <Panel title="Selected Search Result">
      <div className="dashboard-grid tight">
        <KeyValue label="Kind" value={searchResultTypeLabel(model.result.type)} />
        <KeyValue label="State" value={statusLabel(model.result.status)} />
        <KeyValue label="Path" value={<code className="path-value">{model.result.path || "memory"}</code>} />
      </div>
      <RawTextPreview text={model.result.snippet} fallback="No preview available." />
    </Panel>
  );
}
