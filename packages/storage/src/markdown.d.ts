type FrontmatterValue = string | string[] | number | boolean | undefined;
export interface ParsedMarkdown {
    frontmatter: Record<string, FrontmatterValue>;
    body: string;
}
export declare function parseMarkdown(raw: string): ParsedMarkdown;
export declare function formatMarkdown(frontmatter: Record<string, FrontmatterValue>, body: string): string;
export {};
