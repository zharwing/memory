import { promises as fs } from "node:fs";
import path from "node:path";

export async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(target: string): Promise<void> {
  await fs.mkdir(target, { recursive: true });
}

export async function readJson<T>(target: string, fallback: T): Promise<T> {
  if (!(await pathExists(target))) {
    return fallback;
  }
  const raw = await fs.readFile(target, "utf8");
  return JSON.parse(raw) as T;
}

export async function writeJson(target: string, value: unknown): Promise<void> {
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function writeText(target: string, value: string): Promise<void> {
  await ensureDir(path.dirname(target));
  await fs.writeFile(target, value, "utf8");
}

export async function readText(target: string): Promise<string> {
  return fs.readFile(target, "utf8");
}

export async function listFiles(root: string, predicate?: (filePath: string) => boolean): Promise<string[]> {
  if (!(await pathExists(root))) {
    return [];
  }

  const out: string[] = [];
  const entries = await fs.readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFiles(fullPath, predicate)));
    } else if (!predicate || predicate(fullPath)) {
      out.push(fullPath);
    }
  }

  return out.sort();
}

export async function copyDir(source: string, destination: string): Promise<void> {
  await ensureDir(destination);
  const entries = await fs.readdir(source, { withFileTypes: true });

  for (const entry of entries) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      await copyDir(from, to);
    } else {
      await ensureDir(path.dirname(to));
      await fs.copyFile(from, to);
    }
  }
}

export function normalizePath(input: string): string {
  return path.resolve(normalizeInteropPath(input)).replace(/\\/g, "/");
}

export function normalizeInteropPath(
  input: string,
  platform: NodeJS.Platform = process.platform,
  isWsl = Boolean(process.env.WSL_DISTRO_NAME || process.env.WSL_INTEROP)
): string {
  if (platform === "win32") {
    const wslMount = /^\/mnt\/([A-Za-z])(?:\/(.*))?$/.exec(input.replace(/\\/g, "/"));
    if (wslMount) {
      return `${wslMount[1].toUpperCase()}:/${wslMount[2] || ""}`;
    }
  }
  if (platform === "linux" && isWsl) {
    const windowsDrive = /^([A-Za-z]):[\\/](.*)$/.exec(input);
    if (windowsDrive) {
      return `/mnt/${windowsDrive[1].toLowerCase()}/${windowsDrive[2].replace(/\\/g, "/")}`;
    }
  }
  return input;
}
