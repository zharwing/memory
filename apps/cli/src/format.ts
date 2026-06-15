export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printTable(rows: Array<Record<string, unknown>>, columns: string[]): void {
  const widths = columns.map((column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column] ?? "").length))
  );
  const header = columns.map((column, index) => column.padEnd(widths[index])).join("  ");
  process.stdout.write(`${header}\n`);
  process.stdout.write(`${widths.map((width) => "-".repeat(width)).join("  ")}\n`);
  for (const row of rows) {
    process.stdout.write(`${columns.map((column, index) => String(row[column] ?? "").padEnd(widths[index])).join("  ")}\n`);
  }
}

export function printHelp(): void {
  process.stdout.write(`aimem

Commands:
  projects                         List registered projects
  detect [path]                    Detect project from a folder
  status --project <id>            Show project summary
  init [path] [--name <name>]       Create project memory for a folder
  start "task" --project <id>       Start a project-scoped session
  resume --project <id>            Show latest/active session choice
  sessions --project <id>          List project sessions
  context --project <id>           Print context bundle
  checkpoint --project <id> --session <id> "summary"
  close --project <id> --session <id> [summary]
  search --project <id> "query"
  inbox --project <id>             List proposed memory updates
  graph --project <id>             Print graph JSON
  backup --project <id>            Create local snapshot backup
  validate --project <id>          Validate project workspace
  rebuild-index --project <id>     Rebuild dependency-free JSON index
  assistant status --project <id>  Show Memory Assistant status
  assistant summarize-session --project <id> --session <id>
  assistant return-summary --project <id>

Flags:
  --json                           Print raw JSON where a command normally formats output
  --preview                        Preview context without persisting bundle
`);
}
