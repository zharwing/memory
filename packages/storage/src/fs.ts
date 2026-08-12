import { promises as fs } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const MAXIMUM_LOCK_BYTES = 1_024;
const STALE_LOCK_MS = 60_000;

export class StorageMutationBusyError extends Error {
  constructor() {
    super("The storage mutation owner is busy.");
    this.name = "StorageMutationBusyError";
  }
}

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
  await atomicWriteText(target, `${JSON.stringify(value, null, 2)}\n`);
}

export async function writeText(target: string, value: string): Promise<void> {
  await atomicWriteText(target, value);
}

/**
 * Writes one complete domain record through an fsynced same-directory rename.
 * The destination and every existing parent must be ordinary, link-free
 * filesystem objects. Replacing a raced destination replaces the directory
 * entry itself; it never follows a destination symlink.
 */
export async function atomicWriteText(
  target: string,
  value: string,
  options: { root?: string; maximumBytes?: number; mode?: number } = {}
): Promise<void> {
  const resolvedTarget = path.resolve(target);
  const root = path.resolve(options.root ?? path.dirname(resolvedTarget));
  const bytes = Buffer.from(value, "utf8");
  if (options.maximumBytes !== undefined && bytes.length > options.maximumBytes) {
    throw new Error("Atomic write exceeds its byte limit.");
  }
  await ensureDir(path.dirname(resolvedTarget));
  await assertSafeContainedPath(root, path.dirname(resolvedTarget));
  await rejectLinkDestination(resolvedTarget);

  const temporary = path.join(
    path.dirname(resolvedTarget),
    `.${path.basename(resolvedTarget)}.${process.pid}.${crypto.randomUUID()}.tmp`
  );
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined;
  try {
    handle = await fs.open(temporary, "wx", options.mode ?? 0o600);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rejectLinkDestination(resolvedTarget);
    await fs.rename(temporary, resolvedTarget);
    await assertOrdinaryFile(resolvedTarget);
    await syncDirectoryBestEffort(path.dirname(resolvedTarget));
  } catch (error) {
    await handle?.close().catch(() => undefined);
    await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function atomicWriteJson(
  target: string,
  value: unknown,
  options: { root?: string; maximumBytes?: number; mode?: number } = {}
): Promise<void> {
  return atomicWriteText(target, `${JSON.stringify(value, null, 2)}\n`, options);
}

export async function readBoundedJson<T>(
  target: string,
  options: { root?: string; maximumBytes: number }
): Promise<T | undefined> {
  const resolvedTarget = path.resolve(target);
  const root = path.resolve(options.root ?? path.dirname(resolvedTarget));
  await ensureDir(path.dirname(resolvedTarget));
  await assertSafeContainedPath(root, path.dirname(resolvedTarget));
  await rejectLinkDestination(resolvedTarget);
  let handle: Awaited<ReturnType<typeof fs.open>>;
  try {
    handle = await fs.open(resolvedTarget, "r");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.size > options.maximumBytes) {
      throw new Error("Bounded JSON input is unsafe or oversized.");
    }
    const current = await fs.lstat(resolvedTarget);
    if (
      !current.isFile() || current.isSymbolicLink() || current.nlink !== 1 ||
      current.dev !== stat.dev || current.ino !== stat.ino
    ) {
      throw new Error("Bounded JSON input changed during safe open.");
    }
    const realTarget = await fs.realpath(resolvedTarget);
    const relative = path.relative(root, realTarget);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      throw new Error("Bounded JSON input escaped its owner root.");
    }
    return JSON.parse(await handle.readFile("utf8")) as T;
  } finally {
    await handle.close();
  }
}

/**
 * Cross-process, crash-recoverable lease for a very small atomic mutation.
 * Active leases fail fast. A lease is reclaimed only after its owning process
 * is gone and its bounded stale interval has elapsed.
 */
export async function withStorageMutationLease<T>(
  root: string,
  name: string,
  work: () => Promise<T>
): Promise<T> {
  if (!/^[A-Za-z0-9._-]{1,160}$/.test(name)) {
    throw new Error("Invalid storage mutation lease name.");
  }
  const resolvedRoot = path.resolve(root);
  await ensureDir(resolvedRoot);
  await assertSafeContainedPath(resolvedRoot, resolvedRoot);
  const lockPath = path.join(resolvedRoot, `.${name}.lock`);
  const nonce = crypto.randomUUID();
  let acquired = await tryAcquireLease(lockPath, nonce);
  if (!acquired) {
    if (!await reclaimStaleLease(lockPath)) throw new StorageMutationBusyError();
    acquired = await tryAcquireLease(lockPath, nonce);
  }
  if (!acquired) throw new StorageMutationBusyError();
  try {
    return await work();
  } finally {
    await releaseLease(lockPath, nonce);
  }
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

async function tryAcquireLease(
  lockPath: string,
  nonce: string
): Promise<boolean> {
  try {
    const handle = await fs.open(lockPath, "wx", 0o600);
    const record = Buffer.from(JSON.stringify({
      pid: process.pid,
      createdAt: new Date().toISOString(),
      nonce
    }), "utf8");
    try {
      await handle.writeFile(record);
      await handle.sync();
      return true;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return false;
    throw error;
  }
}

async function reclaimStaleLease(lockPath: string): Promise<boolean> {
  await rejectLinkDestination(lockPath, true);
  let stat: Awaited<ReturnType<typeof fs.lstat>>;
  try {
    stat = await fs.lstat(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return true;
    throw error;
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAXIMUM_LOCK_BYTES) return false;
  let record: { pid?: unknown; createdAt?: unknown };
  try {
    record = JSON.parse(await fs.readFile(lockPath, "utf8")) as typeof record;
  } catch {
    return false;
  }
  const pid = Number(record.pid);
  const created = typeof record.createdAt === "string" ? Date.parse(record.createdAt) : Number.NaN;
  if (!Number.isSafeInteger(pid) || pid < 1 || !Number.isFinite(created)) return false;
  if (Date.now() - created < STALE_LOCK_MS || processIsAlive(pid)) return false;
  const stalePath = `${lockPath}.${crypto.randomUUID()}.stale`;
  try {
    await fs.rename(lockPath, stalePath);
    await fs.unlink(stalePath);
    return true;
  } catch (error) {
    if (["ENOENT", "EEXIST", "EPERM"].includes((error as NodeJS.ErrnoException).code || "")) {
      return false;
    }
    throw error;
  }
}

async function releaseLease(lockPath: string, nonce: string): Promise<void> {
  try {
    const stat = await fs.lstat(lockPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAXIMUM_LOCK_BYTES) return;
    const value = JSON.parse(await fs.readFile(lockPath, "utf8")) as { nonce?: unknown };
    if (value.nonce === nonce) await fs.unlink(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function assertSafeContainedPath(root: string, target: string): Promise<void> {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Storage path escaped its owner root.");
  }
  const realRoot = await fs.realpath(resolvedRoot);
  const realTarget = await fs.realpath(resolvedTarget);
  if (
    comparablePath(realRoot) !== comparablePath(resolvedRoot) ||
    comparablePath(realTarget) !== comparablePath(resolvedTarget)
  ) {
    throw new Error("Storage path traverses a filesystem link.");
  }
}

async function rejectLinkDestination(target: string, allowExisting = false): Promise<void> {
  try {
    const stat = await fs.lstat(target);
    if (stat.isSymbolicLink() || (!allowExisting && !stat.isFile())) {
      throw new Error("Storage destination is not an ordinary file.");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function assertOrdinaryFile(target: string): Promise<void> {
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error("Atomic storage output is not an ordinary file.");
  }
}

async function syncDirectoryBestEffort(directory: string): Promise<void> {
  try {
    const handle = await fs.open(directory, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (!["EACCES", "EBADF", "EINVAL", "EISDIR", "ENOTSUP", "EPERM"].includes(
      (error as NodeJS.ErrnoException).code || ""
    )) {
      throw error;
    }
  }
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function comparablePath(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
