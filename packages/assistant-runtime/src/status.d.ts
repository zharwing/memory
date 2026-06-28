import type { AssistantState, Project } from "@aimem/core";
export interface AssistantStatus {
    state: AssistantState;
    runtimeType: string;
    modelName?: string;
    modelPath?: string;
    message: string;
    jobsAvailable: string[];
}
export declare function getAssistantStatus(project: Project): AssistantStatus;
export declare function recommendedModels(): {
    id: string;
    label: string;
    approximateDownload: string;
    approximateRam: string;
    notes: string;
}[];
