import { CANONICAL_PROJECT_FILES, type DocumentId, type Project } from "@zharwing/memory-core";

export function defaultProjectDocument(project: Project, kind: string, documentId?: DocumentId): string {
  const title = titleFor(kind, project.name);
  const body = `# ${title}

This document is part of the local Zharwing Memory workspace for **${project.name}**.

Agents may update routine project memory directly when review mode is off. Use Memory Inbox proposals for review-mode, risky, or uncertain updates.
`;
  if (!documentId) return body;
  const canonical = CANONICAL_PROJECT_FILES.find((file) => file.name === kind);
  const type = canonical?.documentType || "scratch-note";
  return `---
id: ${documentId}
project: ${project.id}
title: ${JSON.stringify(title)}
type: ${type}
status: active
visibility: ${project.privacyPolicy.defaultVisibility}
created: ${project.created}
updated: ${project.updated}
format: markdown
---
${body}`;
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

function titleFor(kind: string, projectName: string): string {
  if (kind === "overview.md") return `${projectName} Overview`;
  const canonical = CANONICAL_PROJECT_FILES.find((file) => file.name === kind);
  return canonical?.title || kind.replace(/\.md$/, "");
}
