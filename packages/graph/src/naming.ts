import { normalizeSlug } from "@zharwing/memory-core";

export function normalizeGraphSlug(input: string | undefined): string {
  return normalizeSlug(input, { strip: /['"]/g, mapToDash: /_/g });
}

export function labelForSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (part === "api") return "API";
      if (part === "ui") return "UI";
      if (part === "sdk") return "SDK";
      if (part === "mcp") return "MCP";
      if (part === "rbac") return "RBAC";
      if (part === "trpc") return "tRPC";
      return part.slice(0, 1).toUpperCase() + part.slice(1);
    })
    .join(" ");
}
