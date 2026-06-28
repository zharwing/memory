export declare function pathExists(target: string): Promise<boolean>;
export declare function ensureDir(target: string): Promise<void>;
export declare function readJson<T>(target: string, fallback: T): Promise<T>;
export declare function writeJson(target: string, value: unknown): Promise<void>;
export declare function writeText(target: string, value: string): Promise<void>;
export declare function readText(target: string): Promise<string>;
export declare function listFiles(root: string, predicate?: (filePath: string) => boolean): Promise<string[]>;
export declare function copyDir(source: string, destination: string): Promise<void>;
export declare function normalizePath(input: string): string;
