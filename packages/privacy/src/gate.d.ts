import type { ContextExcludedItem, PrivacyPolicy, Redaction, SafetyStatus, Visibility } from "@aimem/core";
export interface PrivacyCandidate {
    id: string;
    projectId?: string;
    type: string;
    title: string;
    sourcePath?: string;
    visibility: Visibility;
    content: string;
}
export interface PrivacyDecision {
    allowed: boolean;
    content: string;
    excluded?: ContextExcludedItem;
    redactions: Redaction[];
    safetyStatus: SafetyStatus;
}
export declare function applyPrivacyGate(candidate: PrivacyCandidate, policy: PrivacyPolicy): PrivacyDecision;
export declare function combineSafetyStatus(statuses: SafetyStatus[]): SafetyStatus;
