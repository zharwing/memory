import { randomUUID } from "node:crypto";

export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "project";
}

export function createId(prefix: string): string {
  return `${prefix}-${randomUUID()}`;
}

export function shortDateSlug(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function filenameSafe(input: string): string {
  return slugify(input).slice(0, 80) || "untitled";
}

export function createSessionFilename(args: {
  date?: Date;
  agent?: string;
  branch?: string;
  taskTitle: string;
  suffix?: string;
}): string {
  const date = shortDateSlug(args.date);
  const agent = filenameSafe(args.agent || "manual");
  const branch = filenameSafe(args.branch || "no-branch");
  const task = filenameSafe(args.taskTitle);
  const suffix = args.suffix ? `__${filenameSafe(args.suffix)}` : "";
  return `${date}__${agent}__${branch}__${task}${suffix}.md`;
}
