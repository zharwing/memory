import { type Project, type ProposedMemoryUpdate, type ProposedUpdateStatus, type ProposedUpdateType } from "@aimem/core";
export declare function proposeMemoryUpdate(args: {
    project: Project;
    type: ProposedUpdateType;
    sourceSession?: string;
    sourceAgent?: string;
    sourceKind: ProposedMemoryUpdate["sourceKind"];
    confidence?: ProposedMemoryUpdate["confidence"];
    affectedFiles?: string[];
    targetDocument?: string;
    proposedPatch: string;
    reason: string;
}): Promise<ProposedMemoryUpdate>;
export declare function listProposedUpdates(project: Project): Promise<ProposedMemoryUpdate[]>;
export declare function updateProposalStatus(args: {
    project: Project;
    proposalId: string;
    status: ProposedUpdateStatus;
    editedPatch?: string;
}): Promise<ProposedMemoryUpdate>;
