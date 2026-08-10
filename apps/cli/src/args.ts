export interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

const BOOLEAN_FLAGS = new Set([
  "all",
  "auto",
  "changed",
  "commit",
  "dry-run",
  "json",
  "json-mode",
  "keep-pointer",
  "no-auto-summary",
  "no-json-mode",
  "no-pointer",
  "preview",
  "project-only",
  "review",
  "skip-existing"
]);

export function parseArgs(argv: string[]): ParsedArgs {
  const [command = "help", ...rest] = argv;
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = rest[index + 1];
      if (BOOLEAN_FLAGS.has(key)) {
        flags[key] = true;
      } else if (next && !next.startsWith("--")) {
        flags[key] = next;
        index += 1;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

export function flagString(flags: Record<string, string | boolean>, key: string): string | undefined {
  const value = flags[key];
  return typeof value === "string" ? value : undefined;
}

export function flagBool(flags: Record<string, string | boolean>, key: string): boolean {
  return flags[key] === true;
}
