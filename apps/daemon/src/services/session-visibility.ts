import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  Project,
  Session,
  SessionCheckpoint,
  SessionSummary,
  Visibility
} from "@zharwing/memory-core";

const LEDGER_SCHEMA = "zharwing.session-authority.v3";
const LEDGER_FILE = "session-authority.jsonl";
const KEY_FILE = "session-authority.key";
const MAX_LEDGER_BYTES = 4 * 1024 * 1024;
const MAX_IDENTIFIER_LENGTH = 200;

interface SessionAuthorityRecord {
  readonly schema: typeof LEDGER_SCHEMA;
  readonly namespace: string;
  readonly projectGeneration: string;
  readonly projectId: string;
  readonly sessionId: string;
  readonly owner: string;
  readonly provenance: SessionAuthorityProvenance;
  readonly sessionRevision: string;
  readonly summaryRevision: string;
  readonly checkpointId?: string;
  readonly checkpointRevision?: string;
  readonly visibility: "ai-eligible";
  readonly recordedAt: string;
  readonly mac: string;
}

export type SessionAuthorityProvenance =
  | "agent-start-session"
  | "agent-save-checkpoint"
  | "agent-close-session";

export interface SessionAuthorityOptions {
  readonly stateRoot?: string;
  readonly key?: Buffer;
  readonly now?: () => Date;
  readonly namespace: string;
}

/**
 * Daemon-owned authority for agent-created sessions. Records live outside the
 * mutable project/memory tree and are authenticated before they can grant
 * visibility or write authority. No credential, content, title, or project
 * path is persisted.
 */
export class SessionAuthorityStore {
  private readonly stateRoot: string;
  private readonly namespace: string;
  private readonly suppliedKey?: Buffer;
  private readonly now: () => Date;
  private appendQueue: Promise<void> = Promise.resolve();

  constructor(options: SessionAuthorityOptions) {
    this.stateRoot = path.resolve(options.stateRoot ?? defaultAuthorityStateRoot());
    this.namespace = options.namespace;
    if (!/^[a-f0-9]{64}$/.test(this.namespace)) throw new Error("Invalid authority namespace.");
    this.suppliedKey = options.key ? Buffer.from(options.key) : undefined;
    if (this.suppliedKey && this.suppliedKey.length !== 32) throw new Error("Authority key must be 32 bytes.");
    this.now = options.now ?? (() => new Date());
  }

  async recordAgentOwnedRevision(
    project: Project,
    session: Session,
    summary: SessionSummary,
    owner: string,
    provenance: SessionAuthorityProvenance,
    readCurrentSession: () => Promise<Session | undefined>
  ): Promise<void> {
    assertIdentifier(project.id, "project");
    assertIdentifier(session.id, "session");
    if (summary.id !== session.id || summary.projectId !== session.projectId) {
      throw new Error("Session authority summary does not match the classified session.");
    }
    if (
      summary.revision !== session.updated ||
      summary.status !== session.status ||
      summary.started !== session.started ||
      summary.checkpointCount !== session.checkpoints.length
    ) {
      throw new Error("Session authority summary is not from the classified revision.");
    }
    // The summary is a separately read mutable view. Re-read the complete
    // session after observing it so a concurrent summary/body/control-plane
    // write cannot combine a stale full revision with newer summary authority.
    const current = await readCurrentSession();
    if (
      !current ||
      current.id !== session.id ||
      current.projectId !== session.projectId ||
      sessionAuthorityRevision(current) !== sessionAuthorityRevision(session)
    ) {
      throw new Error("Session changed while authority classification was being recorded.");
    }
    assertIdentifier(owner, "owner");
    const checkpoint = provenance === "agent-save-checkpoint"
      ? session.checkpoints.at(-1)
      : undefined;
    if (provenance === "agent-save-checkpoint" && !checkpoint) {
      throw new Error("Agent checkpoint classification requires the written checkpoint.");
    }
    const unsigned: Omit<SessionAuthorityRecord, "mac"> = {
      schema: LEDGER_SCHEMA,
      namespace: this.namespace,
      projectGeneration: projectGeneration(this.namespace, project),
      projectId: project.id,
      sessionId: session.id,
      owner,
      provenance,
      sessionRevision: sessionAuthorityRevision(session),
      summaryRevision: sessionSummaryAuthorityRevision(summary),
      ...(checkpoint ? {
        checkpointId: checkpoint.id,
        checkpointRevision: checkpointAuthorityRevision(checkpoint)
      } : {}),
      visibility: "ai-eligible" as const,
      recordedAt: this.now().toISOString()
    };
    const record: SessionAuthorityRecord = { ...unsigned, mac: signRecord(unsigned, await this.authorityKey()) };
    this.appendQueue = this.appendQueue.catch(() => undefined).then(() => this.appendRecord(record));
    await this.appendQueue;
  }

  async isAgentOwnedRevision(project: Project, session: Session, owner: string): Promise<boolean> {
    return (await this.readRecords(project)).some(
      (record) =>
        record.sessionId === session.id &&
        record.owner === owner &&
        record.sessionRevision === sessionAuthorityRevision(session)
    );
  }

  async applyVisibility<T extends Session | SessionSummary>(project: Project, session: T): Promise<T> {
    if (session.visibility) return session;
    const revision = isSessionSummary(session)
      ? sessionSummaryAuthorityRevision(session)
      : sessionAuthorityRevision(session);
    const owned = (await this.readRecords(project)).some((record) =>
      record.sessionId === session.id &&
      (isSessionSummary(session)
        ? record.summaryRevision === revision
        : record.sessionRevision === revision)
    );
    return owned ? { ...session, visibility: "ai-eligible" as Visibility } : session;
  }

  async applyVisibilities<T extends Session | SessionSummary>(
    project: Project,
    sessions: readonly T[]
  ): Promise<T[]> {
    const records = await this.readRecords(project);
    return sessions.map((session) =>
      session.visibility || !records.some((record) =>
        record.sessionId === session.id &&
        (isSessionSummary(session)
          ? record.summaryRevision === sessionSummaryAuthorityRevision(session)
          : record.sessionRevision === sessionAuthorityRevision(session))
      )
        ? session
        : { ...session, visibility: "ai-eligible" as Visibility }
    );
  }

  async applyCheckpointVisibilities(
    project: Project,
    sessionId: string,
    checkpoints: readonly SessionCheckpoint[]
  ): Promise<SessionCheckpoint[]> {
    assertIdentifier(sessionId, "session");
    const records = await this.readRecords(project);
    return checkpoints.map((checkpoint) => {
      if (checkpoint.visibility) return checkpoint;
      const classified = records.some((record) =>
        record.sessionId === sessionId &&
        record.checkpointId === checkpoint.id &&
        record.checkpointRevision === checkpointAuthorityRevision(checkpoint)
      );
      return classified
        ? { ...checkpoint, visibility: "ai-eligible" as Visibility }
        : checkpoint;
    });
  }

  private async appendRecord(record: SessionAuthorityRecord): Promise<void> {
    const directory = await this.requireSafeDirectory();
    const filePath = path.join(directory, LEDGER_FILE);
    await rejectLinkIfPresent(filePath);
    const handle = await fs.open(filePath, "a+", 0o600);
    try {
      await assertOpenedPathContained(directory, filePath);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size >= MAX_LEDGER_BYTES) {
        throw new Error("Session authority ledger is unsafe or full.");
      }
      const line = `${JSON.stringify(record)}\n`;
      if (stat.size + Buffer.byteLength(line, "utf8") > MAX_LEDGER_BYTES) {
        throw new Error("Session authority ledger capacity exceeded.");
      }
      await handle.write(line, undefined, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async readRecords(project: Project): Promise<SessionAuthorityRecord[]> {
    let directory: string;
    try {
      directory = await this.requireExistingSafeDirectory();
    } catch {
      return [];
    }
    const filePath = path.join(directory, LEDGER_FILE);
    let handle: fs.FileHandle | undefined;
    try {
      await rejectLinkIfPresent(filePath);
      handle = await fs.open(filePath, "r");
      await assertOpenedPathContained(directory, filePath);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_LEDGER_BYTES) return [];
      const bytes = Buffer.alloc(stat.size);
      const { bytesRead } = await handle.read(bytes, 0, stat.size, 0);
      if (bytesRead !== stat.size) return [];
      const records: SessionAuthorityRecord[] = [];
      for (const line of bytes.toString("utf8").split(/\r?\n/)) {
        if (!line) continue;
        const record = parseRecord(JSON.parse(line) as unknown, await this.authorityKey());
        if (
          record.namespace === this.namespace &&
          record.projectId === project.id &&
          record.projectGeneration === projectGeneration(this.namespace, project)
        ) records.push(record);
      }
      return records;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === "ENOENT" ? [] : [];
    } finally {
      await handle?.close();
    }
  }

  private async requireSafeDirectory(): Promise<string> {
    await fs.mkdir(this.stateRoot, { recursive: true, mode: 0o700 });
    return this.requireExistingSafeDirectory();
  }

  private async requireExistingSafeDirectory(): Promise<string> {
    await assertLinkFreeDirectoryPath(this.stateRoot);
    return this.stateRoot;
  }

  private async authorityKey(): Promise<Buffer> {
    if (this.suppliedKey) return this.suppliedKey;
    const directory = await this.requireSafeDirectory();
    const filePath = path.join(directory, KEY_FILE);
    try {
      const handle = await fs.open(filePath, "wx", 0o600);
      try {
        const key = crypto.randomBytes(32);
        await handle.write(key, 0, key.length, 0);
        await handle.sync();
        return key;
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    await rejectLinkIfPresent(filePath);
    const handle = await fs.open(filePath, "r");
    try {
      await assertOpenedPathContained(directory, filePath);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size !== 32) {
        throw new Error("Session authority key is unsafe.");
      }
      const key = Buffer.alloc(32);
      const { bytesRead } = await handle.read(key, 0, 32, 0);
      if (bytesRead !== 32) throw new Error("Session authority key is incomplete.");
      return key;
    } finally {
      await handle.close();
    }
  }
}

function defaultAuthorityStateRoot(): string {
  const base = process.platform === "win32"
    ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
    : process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  return path.join(base, "zharwing-memory", "authority");
}

function signRecord(
  value: Omit<SessionAuthorityRecord, "mac">,
  key: Buffer
): string {
  return crypto.createHmac("sha256", key).update(JSON.stringify(value), "utf8").digest("hex");
}

function parseRecord(value: unknown, key: Buffer): SessionAuthorityRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid record.");
  const record = value as Record<string, unknown>;
  const required = new Set([
    "mac", "namespace", "owner", "projectGeneration", "projectId", "provenance",
    "recordedAt", "schema", "sessionId", "sessionRevision", "summaryRevision", "visibility"
  ]);
  const allowed = new Set([...required, "checkpointId", "checkpointRevision"]);
  const keys = Object.keys(record);
  if (
    keys.some((key) => !allowed.has(key)) ||
    [...required].some((key) => !keys.includes(key))
  ) throw new Error("Unexpected property.");
  if (record.schema !== LEDGER_SCHEMA || record.visibility !== "ai-eligible") throw new Error("Invalid authority.");
  if (
    typeof record.namespace !== "string" || !/^[a-f0-9]{64}$/.test(record.namespace) ||
    typeof record.projectGeneration !== "string" || !/^[a-f0-9]{64}$/.test(record.projectGeneration) ||
    typeof record.projectId !== "string" || typeof record.sessionId !== "string" ||
    typeof record.owner !== "string" ||
    !isSessionAuthorityProvenance(record.provenance) ||
    typeof record.sessionRevision !== "string" || !/^[a-f0-9]{64}$/.test(record.sessionRevision) ||
    typeof record.summaryRevision !== "string" || !/^[a-f0-9]{64}$/.test(record.summaryRevision)
  ) {
    throw new Error("Invalid authority subject.");
  }
  assertIdentifier(record.projectId, "project");
  assertIdentifier(record.sessionId, "session");
  assertIdentifier(record.owner, "owner");
  const hasCheckpointId = keys.includes("checkpointId");
  const hasCheckpointRevision = keys.includes("checkpointRevision");
  if (
    hasCheckpointId !== hasCheckpointRevision ||
    (record.provenance === "agent-save-checkpoint") !== hasCheckpointId ||
    (hasCheckpointId && (
      typeof record.checkpointId !== "string" ||
      typeof record.checkpointRevision !== "string" ||
      !/^[a-f0-9]{64}$/.test(record.checkpointRevision)
    ))
  ) {
    throw new Error("Invalid checkpoint authority.");
  }
  if (hasCheckpointId) assertIdentifier(record.checkpointId as string, "checkpoint");
  if (typeof record.recordedAt !== "string" || !Number.isFinite(Date.parse(record.recordedAt))) {
    throw new Error("Invalid record time.");
  }
  if (typeof record.mac !== "string" || !/^[a-f0-9]{64}$/.test(record.mac)) throw new Error("Invalid MAC.");
  const { mac, ...unsigned } = record;
  const expectedMac = signRecord(unsigned as Omit<SessionAuthorityRecord, "mac">, key);
  if (!crypto.timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expectedMac, "hex"))) {
    throw new Error("Forged record.");
  }
  return record as unknown as SessionAuthorityRecord;
}

function isSessionAuthorityProvenance(value: unknown): value is SessionAuthorityProvenance {
  return value === "agent-start-session" ||
    value === "agent-save-checkpoint" ||
    value === "agent-close-session";
}

function assertIdentifier(value: string, label: string): void {
  if (!value || value.length > MAX_IDENTIFIER_LENGTH || !/^[A-Za-z0-9._:@-]+$/.test(value)) {
    throw new Error(`Invalid ${label} authority identifier.`);
  }
}

async function rejectLinkIfPresent(filePath: string): Promise<void> {
  try {
    const stat = await fs.lstat(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Authority file is unsafe.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function assertOpenedPathContained(directory: string, filePath: string): Promise<void> {
  const [realDirectory, realFile] = await Promise.all([fs.realpath(directory), fs.realpath(filePath)]);
  if (
    comparablePath(path.dirname(realFile)) !== comparablePath(realDirectory) ||
    comparablePath(path.basename(realFile)) !== comparablePath(path.basename(filePath))
  ) {
    throw new Error("Authority file escaped its state directory.");
  }
}

async function assertLinkFreeDirectoryPath(target: string): Promise<void> {
  const resolved = path.resolve(target);
  const root = path.parse(resolved).root;
  const relative = path.relative(root, resolved);
  let current = root;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("Session authority state directory traverses a link.");
    }
  }
}

function comparablePath(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isSessionSummary(value: Session | SessionSummary): value is SessionSummary {
  return "checkpointCount" in value;
}

export function sessionAuthorityRevision(session: Session): string {
  const {
    visibility: _visibility,
    checkpoints,
    ...sessionFields
  } = session;
  return authorityRevision("zharwing.session-revision.v1", {
    ...sessionFields,
    checkpoints: checkpoints.map((checkpoint) => {
      const {
        id: _id,
        visibility: _checkpointVisibility,
        ...checkpointFields
      } = checkpoint;
      return checkpointFields;
    })
  });
}

function sessionSummaryAuthorityRevision(summary: SessionSummary): string {
  const { visibility: _visibility, ...summaryFields } = summary;
  return authorityRevision("zharwing.session-summary-revision.v1", summaryFields);
}

export function checkpointAuthorityRevision(checkpoint: SessionCheckpoint): string {
  const {
    id: _id,
    visibility: _visibility,
    ...checkpointFields
  } = checkpoint;
  return authorityRevision("zharwing.session-checkpoint-revision.v1", checkpointFields);
}

function authorityRevision(domain: string, value: unknown): string {
  return crypto.createHash("sha256")
    .update(domain, "utf8")
    .update("\0", "utf8")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite session authority value.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  throw new Error("Unsupported session authority value.");
}

function projectGeneration(namespace: string, project: Project): string {
  return crypto.createHash("sha256")
    .update("zharwing.project-generation.v1\0", "utf8")
    .update(namespace, "utf8")
    .update("\0", "utf8")
    .update(project.id, "utf8")
    .update("\0", "utf8")
    .update(project.created, "utf8")
    .update("\0", "utf8")
    .update(path.resolve(project.memoryRoot), "utf8")
    .digest("hex");
}
