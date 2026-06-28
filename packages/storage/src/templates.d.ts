import type { Project } from "@aimem/core";
export declare function defaultProjectDocument(project: Project, kind: string): string;
export declare function sessionBodyTemplate(args: {
    taskTitle: string;
    goal?: string;
    created: string;
}): string;
export declare function contextMarkdownHeader(projectName: string): string;
