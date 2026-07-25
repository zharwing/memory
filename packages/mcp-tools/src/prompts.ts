export const MEMORY_PROMPTS = [
  {
    uri: "memory://prompts/start-project-work",
    name: "Start Project Work",
    text: "Call memory.get_startup_state once for this work round. Use its compact carry-forward summaries, start a fresh project-scoped session unless the user explicitly asked to resume, search before requesting detail, and preview context only when compact state is insufficient. If the repo is unregistered, ask the user to create or link it through the UI or CLI."
  },
  {
    uri: "memory://prompts/save-progress",
    name: "Save Progress",
    text: "After meaningful progress, call memory.save_checkpoint with a concise summary and checkpoint-local touched files. Supplied nextSteps and blockers replace current state; an empty array clears it; omission preserves it."
  },
  {
    uri: "memory://prompts/close-session",
    name: "Close Session",
    text: "When work is complete or paused, call memory.close_session with a concrete summary and next steps."
  },
  {
    uri: "memory://prompts/use-project-scoped-sessions",
    name: "Use Project-Scoped Sessions",
    text: "Never request or include sessions from unrelated projects unless the user explicitly asks for all-project search."
  }
];
