Use Zharwing Memory as the durable project memory, session history, search, and context layer for this repo.

Resolve the active project from this directory or the linked .zharwing/memory.json pointer before work.
Read the latest relevant previous session first, including the last weekday session after weekends or gaps.
Create a new session for today's work round by default; resume an existing session only when the user explicitly asks to continue it.
Search project memory before making assumptions.
Start a project-scoped session for meaningful work and carry forward unfinished tasks, blockers, next steps, and touched files from the previous session.
Preview or load a context bundle when prior context matters.
Save checkpoints after meaningful progress.
Treat "end of day", "job is over", and explicit close-session requests as memory closeout triggers.
Follow separate project-specific source-control, release, deployment, or task-tracker closeout policy only when this repo provides one.
Close the session afterward with summary, next steps, blockers, touched files, and external closeout artifacts when known.
Keep durable facts as docs or Memory Inbox proposals.
Do not request unrelated project context unless the user explicitly asks and policy allows it.
Do not ingest secrets, credentials, local credential caches, .env files, private keys, or tokens.
