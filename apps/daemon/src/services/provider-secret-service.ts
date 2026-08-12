import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCHEMA = "zharwing.provider-secret.v1";
const MAX_SECRET_BYTES = 16 * 1024;

interface EncryptedProviderSecret {
  readonly schema: typeof SCHEMA;
  readonly projectDigest: string;
  readonly providerKind: string;
  readonly revision: string;
  readonly updatedAt: string;
  readonly iv: string;
  readonly tag: string;
  readonly ciphertext: string;
}

export interface ProviderSecretStatus {
  readonly configured: boolean;
  readonly providerKind: string;
  readonly revision: string | null;
  readonly updatedAt: string | null;
}

export interface ProviderSecretServiceOptions {
  readonly namespace: string;
  readonly stateRoot?: string;
  readonly key?: Buffer;
  readonly now?: () => Date;
}

/**
 * Write-only provider credentials owned by the daemon. Public methods return
 * status metadata only. Ciphertext, key material, and raw values stay outside
 * repositories, project roots, backups, diagnostics, and RPC output.
 */
export class ProviderSecretService {
  private readonly stateRoot: string;
  private readonly suppliedKey?: Buffer;
  private readonly now: () => Date;

  constructor(private readonly options: ProviderSecretServiceOptions) {
    if (!/^[a-f0-9]{64}$/.test(options.namespace)) {
      throw new Error("Invalid provider-secret namespace.");
    }
    this.stateRoot = path.resolve(options.stateRoot ?? defaultStateRoot(options.namespace));
    this.suppliedKey = options.key ? Buffer.from(options.key) : undefined;
    if (this.suppliedKey && this.suppliedKey.length !== 32) {
      throw new Error("Provider-secret key must be exactly 32 bytes.");
    }
    this.now = options.now ?? (() => new Date());
  }

  status(projectId: string, providerKind: string): ProviderSecretStatus {
    const record = this.readRecord(projectId, providerKind, false);
    return {
      configured: Boolean(record),
      providerKind: normalizeProviderKind(providerKind),
      revision: record?.revision ?? null,
      updatedAt: record?.updatedAt ?? null
    };
  }

  set(args: {
    projectId: string;
    providerKind: string;
    secret: string;
    expectedRevision?: string | null;
  }): ProviderSecretStatus {
    const providerKind = normalizeProviderKind(args.providerKind);
    const secret = boundedSecret(args.secret);
    const current = this.readRecord(args.projectId, providerKind, false);
    if (args.expectedRevision === undefined && current) {
      throw new Error("Provider secret is already configured; rotate it with the current revision.");
    }
    requireExpectedRevision(current?.revision ?? null, args.expectedRevision);
    const key = this.key();
    try {
      const projectDigest = projectSecretDigest(this.options.namespace, args.projectId);
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(`${SCHEMA}\0${projectDigest}\0${providerKind}`, "utf8"));
      const plaintext = Buffer.from(secret, "utf8");
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      plaintext.fill(0);
      const updatedAt = this.now().toISOString();
      const revision = crypto.randomBytes(16).toString("hex");
      this.writeRecord(projectDigest, providerKind, {
        schema: SCHEMA,
        projectDigest,
        providerKind,
        revision,
        updatedAt,
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        ciphertext: ciphertext.toString("base64")
      });
      return { configured: true, providerKind, revision, updatedAt };
    } finally {
      key.fill(0);
    }
  }

  clear(args: {
    projectId: string;
    providerKind: string;
    expectedRevision?: string | null;
  }): ProviderSecretStatus {
    const providerKind = normalizeProviderKind(args.providerKind);
    const current = this.readRecord(args.projectId, providerKind, false);
    if (current && args.expectedRevision === undefined) {
      throw new Error("Clearing a provider secret requires its current revision.");
    }
    requireExpectedRevision(current?.revision ?? null, args.expectedRevision);
    const file = this.recordPath(args.projectId, providerKind);
    if (current) fs.unlinkSync(file);
    fsyncDirectory(path.dirname(file));
    return { configured: false, providerKind, revision: null, updatedAt: null };
  }

  read(projectId: string, providerKind: string): string | undefined {
    const provider = normalizeProviderKind(providerKind);
    const record = this.readRecord(projectId, provider, true);
    if (!record) return undefined;
    const key = this.key();
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(record.iv, "base64"));
      decipher.setAAD(Buffer.from(`${SCHEMA}\0${record.projectDigest}\0${record.providerKind}`, "utf8"));
      decipher.setAuthTag(Buffer.from(record.tag, "base64"));
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(record.ciphertext, "base64")),
        decipher.final()
      ]);
      if (plaintext.length === 0 || plaintext.length > MAX_SECRET_BYTES) {
        plaintext.fill(0);
        throw new Error("Provider secret plaintext is invalid.");
      }
      const value = plaintext.toString("utf8");
      plaintext.fill(0);
      return value;
    } finally {
      key.fill(0);
    }
  }

  private readRecord(
    projectId: string,
    providerKind: string,
    failOnCorruption: boolean
  ): EncryptedProviderSecret | undefined {
    const file = this.recordPath(projectId, providerKind);
    try {
      const parsed = JSON.parse(readBoundedRegularFile(file, 64 * 1024).toString("utf8")) as Partial<EncryptedProviderSecret>;
      const expectedProject = projectSecretDigest(this.options.namespace, projectId);
      if (
        parsed.schema !== SCHEMA ||
        parsed.projectDigest !== expectedProject ||
        parsed.providerKind !== providerKind ||
        !isHex(parsed.revision, 32) ||
        typeof parsed.updatedAt !== "string" ||
        typeof parsed.iv !== "string" ||
        typeof parsed.tag !== "string" ||
        typeof parsed.ciphertext !== "string"
      ) throw new Error("Provider secret record failed closed decoding.");
      return parsed as EncryptedProviderSecret;
    } catch (error) {
      if (isMissing(error)) return undefined;
      if (failOnCorruption) throw error;
      throw new Error("Provider secret status is unavailable because protected state is invalid.");
    }
  }

  private writeRecord(
    projectDigest: string,
    providerKind: string,
    record: EncryptedProviderSecret
  ): void {
    const directory = this.providerDirectory(projectDigest);
    ensurePrivateDirectory(this.stateRoot);
    ensurePrivateDirectory(directory);
    const destination = path.join(directory, `${providerKind}.json`);
    const temporary = `${destination}.${crypto.randomBytes(8).toString("hex")}.tmp`;
    const bytes = `${JSON.stringify(record)}\n`;
    if (Buffer.byteLength(bytes, "utf8") > 64 * 1024) throw new Error("Provider secret record is oversized.");
    const handle = fs.openSync(temporary, "wx", 0o600);
    try {
      fs.writeFileSync(handle, bytes, "utf8");
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fs.renameSync(temporary, destination);
    fsyncDirectory(directory);
  }

  private key(): Buffer {
    if (this.suppliedKey) return Buffer.from(this.suppliedKey);
    ensurePrivateDirectory(this.stateRoot);
    const file = path.join(this.stateRoot, "provider-secrets.key");
    try {
      return readBoundedRegularFile(file, 32, 32);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    const key = crypto.randomBytes(32);
    const handle = fs.openSync(file, "wx", 0o600);
    try {
      fs.writeFileSync(handle, key);
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
    fsyncDirectory(this.stateRoot);
    return key;
  }

  private recordPath(projectId: string, providerKind: string): string {
    return path.join(
      this.providerDirectory(projectSecretDigest(this.options.namespace, projectId)),
      `${normalizeProviderKind(providerKind)}.json`
    );
  }

  private providerDirectory(projectDigest: string): string {
    return path.join(this.stateRoot, "projects", projectDigest);
  }
}

function defaultStateRoot(namespace: string): string {
  const base = process.platform === "win32"
    ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
    : process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  return path.join(base, "zharwing-memory", "authority", namespace, "provider-secrets");
}

function projectSecretDigest(namespace: string, projectId: string): string {
  if (!projectId || Buffer.byteLength(projectId, "utf8") > 512) throw new Error("Invalid provider-secret project.");
  return crypto.createHash("sha256").update(namespace).update("\0").update(projectId).digest("hex");
}

function normalizeProviderKind(value: string): string {
  const normalized = value.trim().toLocaleLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(normalized)) throw new Error("Invalid provider kind.");
  return normalized;
}

function boundedSecret(value: string): string {
  const bytes = Buffer.byteLength(value, "utf8");
  if (!value || bytes > MAX_SECRET_BYTES || /[\r\n\0]/.test(value)) {
    throw new Error("Provider secret must be a bounded single-line value.");
  }
  return value;
}

function requireExpectedRevision(current: string | null, expected: string | null | undefined): void {
  if (expected === undefined) return;
  if (current !== expected) throw new Error("Provider secret revision conflict.");
}

function ensurePrivateDirectory(directory: string): void {
  const absolute = path.resolve(directory);
  const parsed = path.parse(absolute);
  let current = parsed.root;
  for (const segment of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      fs.mkdirSync(current, { mode: 0o700 });
    } catch (error) {
      if (!isAlreadyExists(error)) throw error;
    }
    const stat = fs.lstatSync(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("Provider secret state path traverses an unsafe entry.");
    }
  }
}

function readBoundedRegularFile(file: string, maximum: number, exact?: number): Buffer {
  const before = fs.lstatSync(file);
  if (!before.isFile() || before.isSymbolicLink() || before.size <= 0 || before.size > maximum || (exact && before.size !== exact)) {
    throw new Error("Provider secret state is not a bounded regular file.");
  }
  const noFollow = fs.constants.O_NOFOLLOW ?? 0;
  const handle = fs.openSync(file, fs.constants.O_RDONLY | noFollow);
  try {
    const opened = fs.fstatSync(handle);
    if (!opened.isFile() || opened.size !== before.size || opened.size > maximum || (exact && opened.size !== exact)) {
      throw new Error("Provider secret state changed during validation.");
    }
    return fs.readFileSync(handle);
  } finally {
    fs.closeSync(handle);
  }
}

function fsyncDirectory(directory: string): void {
  try {
    const handle = fs.openSync(directory, "r");
    try { fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
  } catch {
    // Some Windows filesystems do not allow directory handles; file fsync and
    // atomic rename remain the available durability boundary.
  }
}

function isHex(value: unknown, length: number): value is string {
  return typeof value === "string" && value.length === length && /^[a-f0-9]+$/.test(value);
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ENOENT");
}

function isAlreadyExists(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "EEXIST");
}
