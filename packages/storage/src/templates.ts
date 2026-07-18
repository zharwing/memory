import type { Project } from "@zharwing/memory-core";

export function defaultProjectDocument(project: Project, kind: string): string {
  const title = titleFor(kind, project.name);
  return `# ${title}

This document is part of the local Zharwing Memory workspace for **${project.name}**.

Agents may update routine project memory directly when review mode is off. Use Memory Inbox proposals for review-mode, risky, or uncertain updates.
`;
}

export function sessionBodyTemplate(args: { taskTitle: string; goal?: string; created: string }): string {
  return `# ${args.taskTitle}

Created: ${args.created}

## Goal

${args.goal || "No explicit goal recorded yet."}

## Summary

Session started. Add checkpoints as work progresses.

## Progress Log

- Session created.

## Files Touched

None recorded yet.

## Decisions

None recorded yet.

## Blockers

None recorded yet.

## Next Steps

None recorded yet.
`;
}

export function contextMarkdownHeader(projectName: string): string {
  return `# AI Context for This Session

Project: ${projectName}

This bundle was generated from project-scoped Zharwing Memory. It excludes private, never-send, unrelated, and blocked items.
`;
}

function titleFor(kind: string, projectName: string): string {
  const titles: Record<string, string> = {
    "overview.md": `${projectName} Overview`,
    "architecture.md": "Architecture",
    "decisions.md": "Decisions",
    "tasks.md": "Tasks",
    "gotchas.md": "Gotchas",
    "commands.md": "Commands",
    "glossary.md": "Glossary",
    "privacy.md": "Privacy Rules"
  };

  return titles[kind] || kind.replace(/\.md$/, "");
}
