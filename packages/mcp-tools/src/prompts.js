export const MEMORY_PROMPTS = [
    {
        uri: "memory://prompts/start-project-work",
        name: "Start Project Work",
        text: "Call memory.get_startup_state, resolve or create a project, start or resume a project-scoped session, preview context, then continue with the user's coding task."
    },
    {
        uri: "memory://prompts/save-progress",
        name: "Save Progress",
        text: "After meaningful progress, call memory.save_checkpoint with a concise summary, touched files, blockers, and next steps."
    },
    {
        uri: "memory://prompts/close-session",
        name: "Close Session",
        text: "When work is complete or paused, call memory.close_session with a concrete summary. Write reusable memory directly with memory.create_doc when review mode is off; use proposals only for review mode or risky updates."
    },
    {
        uri: "memory://prompts/use-project-scoped-sessions",
        name: "Use Project-Scoped Sessions",
        text: "Never request or include sessions from unrelated projects unless the user explicitly asks for all-project search."
    }
];
//# sourceMappingURL=prompts.js.map