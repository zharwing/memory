export const MEMORY_PROMPTS = [
  {
    uri: "memory://prompts/start-project-work",
    name: "Start Project Work",
    text: "Call memory.get_startup_state. If the repo is registered, read the latest session, start a fresh project-scoped session, preview context, then continue. If it is unregistered, ask the user to create or link it through the UI or CLI."
  },
  {
    uri: "memory://prompts/save-progress",
    name: "Save Progress",
    text: "After meaningful progress, call memory.save_checkpoint with a concise summary, touched files, blockers, and next steps."
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
