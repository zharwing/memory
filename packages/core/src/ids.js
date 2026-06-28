import { randomUUID } from "node:crypto";
export function nowIso() {
    return new Date().toISOString();
}
export function slugify(input) {
    const slug = input
        .trim()
        .toLowerCase()
        .replace(/['"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    return slug || "project";
}
export function createId(prefix) {
    return `${prefix}-${randomUUID()}`;
}
export function shortDateSlug(date = new Date()) {
    return date.toISOString().slice(0, 10);
}
export function shortLocalSessionDate(date = new Date()) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    return `${month}-${day}-${year}`;
}
export function filenameSafe(input) {
    return slugify(input).slice(0, 80) || "untitled";
}
export function createSessionFilename(args) {
    const date = shortLocalSessionDate(args.date);
    const task = args.taskTitle?.trim() ? `__${filenameSafe(args.taskTitle)}` : "";
    const suffix = args.suffix ? `-${filenameSafe(args.suffix)}` : "";
    return `session-${date}${task}${suffix}.md`;
}
export function defaultSessionTitle(date = new Date()) {
    return `Session ${shortLocalSessionDate(date)}`;
}
//# sourceMappingURL=ids.js.map