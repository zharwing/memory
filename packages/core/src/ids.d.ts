export declare function nowIso(): string;
export declare function slugify(input: string): string;
export declare function createId(prefix: string): string;
export declare function shortDateSlug(date?: Date): string;
export declare function shortLocalSessionDate(date?: Date): string;
export declare function filenameSafe(input: string): string;
export declare function createSessionFilename(args: {
    date?: Date;
    taskTitle?: string;
    suffix?: string;
}): string;
export declare function defaultSessionTitle(date?: Date): string;
