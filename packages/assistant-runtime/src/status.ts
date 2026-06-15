import type { AssistantState, Project } from "@aimem/core";

export interface AssistantStatus {
  state: AssistantState;
  runtimeType: string;
  modelName?: string;
  modelPath?: string;
  message: string;
  jobsAvailable: string[];
}

export function getAssistantStatus(project: Project): AssistantStatus {
  if (!project.assistantPolicy.enabled) {
    return {
      state: "off",
      runtimeType: "disabled",
      message: "Memory Assistant is disabled. Core memory features still work.",
      jobsAvailable: ["deterministic-session-summary", "deterministic-return-summary", "document-classification"]
    };
  }

  if (!project.assistantPolicy.modelPath && project.assistantPolicy.runtimeType === "app-managed-llamacpp") {
    return {
      state: "unavailable",
      runtimeType: project.assistantPolicy.runtimeType,
      modelName: project.assistantPolicy.modelName,
      message: "App-managed local model is enabled but no model path is configured.",
      jobsAvailable: ["deterministic-session-summary", "deterministic-return-summary", "document-classification"]
    };
  }

  return {
    state: project.assistantPolicy.runtimeType === "disabled" ? "off" : "ready",
    runtimeType: project.assistantPolicy.runtimeType,
    modelName: project.assistantPolicy.modelName,
    modelPath: project.assistantPolicy.modelPath,
    message: "Memory Assistant runtime is configured.",
    jobsAvailable: ["session-summary", "return-summary", "document-classification", "memory-update-extraction"]
  };
}

export function recommendedModels() {
  return [
    {
      id: "small-instruct-3b-q4",
      label: "Small instruct 3B Q4",
      approximateDownload: "2-3 GB",
      approximateRam: "4-6 GB",
      notes: "Fast local summaries and classification."
    },
    {
      id: "balanced-instruct-4b-q4",
      label: "Balanced instruct 4B Q4",
      approximateDownload: "3-4 GB",
      approximateRam: "6-8 GB",
      notes: "Better return summaries and proposal drafting."
    }
  ];
}
