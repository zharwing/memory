import { isTauri } from "@tauri-apps/api/core";

export function canPickDirectory(): boolean {
  return isTauri();
}

export async function pickDirectory(): Promise<string | undefined> {
  if (!canPickDirectory()) return undefined;
  const { open } = await import("@tauri-apps/plugin-dialog");
  const selected = await open({
    directory: true,
    multiple: false
  });
  return typeof selected === "string" ? selected : undefined;
}
