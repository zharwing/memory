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
  repos --project <id>             List repos linked to a project
  link-repo <path> --project <id>  Link another repo/worktree to a project
  unlink-repo <path> --project <id>
  workstreams --project <id>       List project workstreams
  create-workstream "name" --project <id>
  workstream <id-or-slug> --project <id>
  init [path] [--name <name>]       Create project memory
  start "task" --project <id>       Start a project-scoped session
  resume --project <id>            Show latest/active session choice
  sessions --project <id>          List project sessions
  context --project <id>           Print context bundle
  checkpoint --project <id> --session <id> "summary"
  close --project <id> --session <id> [summary]
  search --project <id> "query"
  inbox --project <id>             List proposed memory updates
  graph --project <id>             Print graph JSON
  semantic-graph status --project <id>
  semantic-graph analyze --project <id> [--changed|--node <id>|--doc <ids>]
  semantic-graph runs --project <id>
  semantic-graph edges --project <id> [--status accepted,proposed]
  backup --project <id>            Create local snapshot backup
  validate --project <id>          Validate project workspace
  rebuild-index --project <id>     Rebuild dependency-free JSON index
  import-profiles                  List built-in folder import profiles
  assistant status --project <id>  Show Memory Assistant status
  assistant summarize-session --project <id> --session <id>
  assistant generate-session-summary --project <id> --session <id>
  assistant generate-session-summaries --project <id> [--all]
  assistant return-summary --project <id>
  import <file> --project <id>     Import one file as a document
  import-folder <path> --project <id> [--profile <name>]
  import-folder <path> --project <id> --commit [--conflict skip|overwrite|duplicate]
  import-commit <path> --project <id> [--profile <name>]
  agent-instructions --project <id> [--agent generic|codex|claude|qwen]
  mcp serve                        Run the AI Memory MCP stdio adapter
  mcp doctor                       Check daemon and MCP client setup
  mcp install [auto|client]        Install MCP config for current OS, codex, claude-code, or claude-desktop

Flags:
  --json                           Print raw JSON where a command normally formats output
  --preview                        Preview context without persisting bundle
  --mode <dry-run|review|auto>      Semantic graph analysis mode
  --changed                        Analyze changed docs only
  --node <graph-node-id>            Analyze a focused graph node neighborhood
  --doc <id,id>                    Analyze selected document ids
  --endpoint <url>                 Advanced provider URL override for model-backed jobs
  --model <name>                   Advanced provider model override for model-backed jobs
  --json-mode / --no-json-mode     Toggle OpenAI JSON response_format for provider compatibility
  --no-auto-summary                Close session without automatic searchable TLDR generation
  --skip-existing                  Do not regenerate an existing session TLDR
  --all                            Regenerate all session TLDRs for bulk assistant summaries
  --max-docs <n>                   Limit semantic graph documents
  --max-candidates <n>             Limit semantic graph candidate relationships
  --per-doc <n>                    Limit semantic graph candidates per document
  --name <name>                    Human-friendly repo or project name
  --description <text>             Repo description
  --role <role>                    Free-form repo category/role
  --topic <a,b>                    Comma-separated workstream topics
  --repo-role <a,b>                Comma-separated workstream repo categories
  --project-only                   Create a project without linking the current folder
  --no-pointer                     Do not write .ai-memory.json when linking a repo
  --keep-pointer                   Do not remove .ai-memory.json when unlinking a repo
  --agent <name>                   Agent instruction target: generic, codex, claude, or qwen
  --output <path|default>          Write generated agent instructions to a file
  --transport <http|stdio>         MCP install transport
  --daemon-url <url>               AI Memory daemon URL for MCP setup
  --auth <auto|none|token>         MCP HTTP auth mode for generated config
  --config <path>                  Override MCP client config path
  --dry-run                        Preview installer output without writing config
`);
}
