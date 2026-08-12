import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OperationName } from "@zharwing/memory-core";
import {
  DURABLE_DOMAIN_EFFECT_SCHEMA,
  isDurableDomainEffectOperation,
  type DurableDomainEffect
} from "@zharwing/memory-store";

const JOURNAL_SCHEMA = "zharwing.operation-effects.v2";
const JOURNAL_FILE = "operation-effects.jsonl";
const KEY_FILE = "operation-effects.key";
const LOCK_FILE = "operation-effects.lock";
const DEFAULT_MAXIMUM_IDENTITIES = 100_000;
const DEFAULT_MAXIMUM_JOURNAL_BYTES = 128 * 1024 * 1024;
const STALE_LOCK_MS = 60_000;
const MAXIMUM_LOCK_BYTES = 1_024;

type JournalEvent = "claim" | "complete-receipt" | "release";

interface EffectJournalRecord {
  readonly schema: typeof JOURNAL_SCHEMA;
  readonly namespace: string;
  readonly scopeDigest: string;
  readonly inputDigest: string;
  readonly claimId: string;
  readonly event: JournalEvent;
  readonly recordedAt: string;
  readonly mac: string;
}

interface EffectState {
  readonly scopeDigest: string;
  readonly inputDigest: string;
  readonly claimId: string;
  readonly state: "in-flight" | "complete" | "released";
}

export interface OperationEffectIdentity {
  /** Stable logical owner. Credential sessions and principal ids are excluded. */
  readonly sessionOwner: string;
  readonly projectId: string | null;
  readonly projectGeneration: string | null;
  readonly operation: OperationName;
  readonly idempotencyKey: string;
  readonly inputDigest: string;
}

export type EffectClaimDecision =
  | { readonly kind: "claimed"; readonly effect?: DurableDomainEffect }
  | {
      readonly kind: "reconcile";
      readonly state: "in-flight" | "complete";
      readonly claimId: string;
      readonly effect: DurableDomainEffect;
    }
  | { readonly kind: "conflict" }
  | { readonly kind: "outcome-unknown"; readonly state: "in-flight" | "complete" }
  | { readonly kind: "unavailable" };

export interface OperationEffectJournalOptions {
  readonly namespace: string;
  readonly stateRoot?: string;
  readonly key?: Buffer;
  readonly now?: () => Date;
  readonly maximumIdentities?: number;
  readonly maximumJournalBytes?: number;
}

/**
 * Integrity-protected durable claim ledger. It stores only bounded digests,
 * random claim ids, state transitions, and MACs. Raw owner/key/input/project,
 * private domain bytes, and projected response bytes never enter this file.
 */
export class OperationEffectJournal {
  private readonly namespace: string;
  private readonly stateRoot: string;
  private readonly suppliedKey?: Buffer;
  private readonly now: () => Date;
  private readonly maximumIdentities: number;
  private readonly maximumJournalBytes: number;

  constructor(options: OperationEffectJournalOptions) {
    if (!isDigest(options.namespace)) throw new Error("Invalid operation effect namespace.");
    this.namespace = options.namespace;
    this.stateRoot = path.resolve(options.stateRoot ?? defaultEffectStateRoot(this.namespace));
    this.suppliedKey = options.key ? Buffer.from(options.key) : undefined;
    if (this.suppliedKey && this.suppliedKey.length !== 32) {
      throw new Error("Operation effect key must be 32 bytes.");
    }
    this.now = options.now ?? (() => new Date());
    this.maximumIdentities = boundedPositiveInteger(
      options.maximumIdentities ?? DEFAULT_MAXIMUM_IDENTITIES,
      "Operation effect identity capacity",
      DEFAULT_MAXIMUM_IDENTITIES
    );
    this.maximumJournalBytes = boundedPositiveInteger(
      options.maximumJournalBytes ?? DEFAULT_MAXIMUM_JOURNAL_BYTES,
      "Operation effect journal byte capacity",
      DEFAULT_MAXIMUM_JOURNAL_BYTES
    );
  }

  claim(identity: OperationEffectIdentity, claimId: string): EffectClaimDecision {
    try {
      assertIdentity(identity);
      assertBoundedText(claimId, "claim", 256);
      return this.withLock(() => {
        const scopeDigest = effectScopeDigest(this.namespace, identity);
        const states = this.readStates();
        const previous = states.get(scopeDigest);
        if (previous) {
          if (previous.inputDigest !== identity.inputDigest) return { kind: "conflict" };
          if (previous.state !== "released") {
            const effect = this.domainEffect(identity, scopeDigest, "reconcile");
            return effect
              ? { kind: "reconcile", state: previous.state, claimId: previous.claimId, effect }
              : { kind: "outcome-unknown", state: previous.state };
          }
        } else if (states.size >= this.maximumIdentities) {
          return { kind: "unavailable" };
        }

        this.append({
          schema: JOURNAL_SCHEMA,
          namespace: this.namespace,
          scopeDigest,
          inputDigest: identity.inputDigest,
          claimId,
          event: "claim",
          recordedAt: this.now().toISOString()
        }, states);
        const effect = this.domainEffect(identity, scopeDigest, "apply");
        return { kind: "claimed", ...(effect ? { effect } : {}) };
      });
    } catch {
      return { kind: "unavailable" };
    }
  }

  complete(claimId: string): boolean {
    return this.settle(claimId, "complete-receipt");
  }

  release(claimId: string): boolean {
    return this.settle(claimId, "release");
  }

  /** Rewrites each authoritative identity into one canonical state sequence. */
  compact(): boolean {
    try {
      return this.withLock(() => {
        this.rewrite(this.readStates());
        return true;
      });
    } catch {
      return false;
    }
  }

  private settle(claimId: string, event: Exclude<JournalEvent, "claim">): boolean {
    try {
      assertBoundedText(claimId, "claim", 256);
      return this.withLock(() => {
        const states = this.readStates();
        const state = [...states.values()].find((candidate) => candidate.claimId === claimId);
        if (!state) return false;
        if (event === "complete-receipt" && state.state === "complete") return true;
        if (state.state !== "in-flight") return false;
        this.append({
          schema: JOURNAL_SCHEMA,
          namespace: this.namespace,
          scopeDigest: state.scopeDigest,
          inputDigest: state.inputDigest,
          claimId,
          event,
          recordedAt: this.now().toISOString()
        }, states);
        return true;
      });
    } catch {
      return false;
    }
  }

  private domainEffect(
    identity: OperationEffectIdentity,
    effectId: string,
    mode: DurableDomainEffect["mode"]
  ): DurableDomainEffect | undefined {
    if (
      !isDurableDomainEffectOperation(identity.operation) ||
      !identity.projectGeneration ||
      !isDigest(identity.projectGeneration)
    ) {
      return undefined;
    }
    const unsigned = {
      schema: DURABLE_DOMAIN_EFFECT_SCHEMA,
      effectId,
      projectGeneration: identity.projectGeneration,
      operation: identity.operation,
      inputDigest: identity.inputDigest
    } as const;
    const markerKey = crypto.createHmac("sha256", this.effectKey())
      .update("zharwing.domain-effect-key.v1\0", "utf8")
      .update(JSON.stringify(unsigned), "utf8")
      .digest("hex");
    const effect = { ...unsigned, mode } as DurableDomainEffect;
    Object.defineProperty(effect, "markerKey", {
      value: markerKey,
      enumerable: false,
      configurable: false,
      writable: false
    });
    return Object.freeze(effect);
  }

  private readStates(): Map<string, EffectState> {
    const directory = this.requireSafeDirectory();
    const filePath = path.join(directory, JOURNAL_FILE);
    rejectLinkIfPresent(filePath);
    let handle: number;
    try {
      handle = fs.openSync(filePath, "r");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return new Map();
      throw error;
    }
    try {
      assertOpenedPathContained(directory, filePath);
      const stat = fs.fstatSync(handle);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > this.maximumJournalBytes) {
        throw new Error("Operation effect journal is unsafe or oversized.");
      }
      assertSameOpenedFile(filePath, stat);
      const bytes = Buffer.alloc(stat.size);
      const bytesRead = fs.readSync(handle, bytes, 0, stat.size, 0);
      if (bytesRead !== stat.size) throw new Error("Operation effect journal read was incomplete.");
      const key = this.effectKey();
      const states = new Map<string, EffectState>();
      for (const line of bytes.toString("utf8").split(/\r?\n/)) {
        if (!line) continue;
        if (Buffer.byteLength(line, "utf8") > 2_048) throw new Error("Effect record is oversized.");
        const record = parseRecord(JSON.parse(line) as unknown, key);
        if (record.namespace !== this.namespace) throw new Error("Operation effect namespace mismatch.");
        applyRecord(states, record);
      }
      if (states.size > this.maximumIdentities) {
        throw new Error("Operation effect identity capacity exceeded.");
      }
      return states;
    } finally {
      fs.closeSync(handle);
    }
  }

  private append(
    unsigned: Omit<EffectJournalRecord, "mac">,
    currentStates: Map<string, EffectState>
  ): void {
    const directory = this.requireSafeDirectory();
    const filePath = path.join(directory, JOURNAL_FILE);
    rejectLinkIfPresent(filePath);
    const record: EffectJournalRecord = { ...unsigned, mac: signRecord(unsigned, this.effectKey()) };
    const line = `${JSON.stringify(record)}\n`;
    let currentSize = fileSizeIfPresent(filePath);
    if (currentSize + Buffer.byteLength(line, "utf8") > this.maximumJournalBytes) {
      this.rewrite(currentStates);
      currentSize = fileSizeIfPresent(filePath);
      if (currentSize + Buffer.byteLength(line, "utf8") > this.maximumJournalBytes) {
        throw new Error("Operation effect journal capacity exceeded.");
      }
    }
    const handle = fs.openSync(filePath, "a+", 0o600);
    try {
      assertOpenedPathContained(directory, filePath);
      const stat = fs.fstatSync(handle);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== currentSize) {
        throw new Error("Operation effect journal changed during append.");
      }
      assertSameOpenedFile(filePath, stat);
      fs.writeSync(handle, line, undefined, "utf8");
      fs.fsyncSync(handle);
    } finally {
      fs.closeSync(handle);
    }
  }

  private rewrite(states: Map<string, EffectState>): void {
    const directory = this.requireSafeDirectory();
    const filePath = path.join(directory, JOURNAL_FILE);
    rejectLinkIfPresent(filePath);
    const key = this.effectKey();
    const lines: string[] = [];
    for (const state of [...states.values()].sort((left, right) =>
      left.scopeDigest.localeCompare(right.scopeDigest)
    )) {
      const recordedAt = this.now().toISOString();
      const claim = signedLine({
        schema: JOURNAL_SCHEMA,
        namespace: this.namespace,
        scopeDigest: state.scopeDigest,
        inputDigest: state.inputDigest,
        claimId: state.claimId,
        event: "claim",
        recordedAt
      }, key);
      lines.push(claim);
      if (state.state !== "in-flight") {
        lines.push(signedLine({
          schema: JOURNAL_SCHEMA,
          namespace: this.namespace,
          scopeDigest: state.scopeDigest,
          inputDigest: state.inputDigest,
          claimId: state.claimId,
          event: state.state === "complete" ? "complete-receipt" : "release",
          recordedAt
        }, key));
      }
    }
    const bytes = Buffer.from(lines.length ? `${lines.join("\n")}\n` : "", "utf8");
    if (bytes.length > this.maximumJournalBytes) {
      throw new Error("Compacted operation effect journal exceeds capacity.");
    }
    const temporary = path.join(directory, `.${JOURNAL_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`);
    let handle: number | undefined;
    try {
      handle = fs.openSync(temporary, "wx", 0o600);
      fs.writeSync(handle, bytes, 0, bytes.length, 0);
      fs.fsyncSync(handle);
      fs.closeSync(handle);
      handle = undefined;
      rejectLinkIfPresent(filePath);
      fs.renameSync(temporary, filePath);
      syncDirectoryBestEffort(directory);
    } catch (error) {
      if (handle !== undefined) fs.closeSync(handle);
      try { fs.unlinkSync(temporary); } catch { /* best-effort private temp cleanup */ }
      throw error;
    }
  }

  private withLock<T>(work: () => T): T {
    const directory = this.requireSafeDirectory();
    const lockPath = path.join(directory, LOCK_FILE);
    const nonce = crypto.randomUUID();
    let handle = acquireLock(lockPath, nonce);
    if (handle === undefined && reclaimStaleLock(lockPath)) {
      handle = acquireLock(lockPath, nonce);
    }
    if (handle === undefined) throw new Error("Operation effect journal is busy.");
    fs.closeSync(handle);
    try {
      return work();
    } finally {
      releaseLock(lockPath, nonce);
    }
  }

  private requireSafeDirectory(): string {
    fs.mkdirSync(this.stateRoot, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(this.stateRoot);
    if (!stat.isDirectory() || stat.isSymbolicLink()) {
      throw new Error("Operation effect state directory is unsafe.");
    }
    const real = fs.realpathSync(this.stateRoot);
    if (comparablePath(real) !== comparablePath(this.stateRoot)) {
      throw new Error("Operation effect state directory traverses a link.");
    }
    return this.stateRoot;
  }

  private effectKey(): Buffer {
    if (this.suppliedKey) return this.suppliedKey;
    const directory = this.requireSafeDirectory();
    const filePath = path.join(directory, KEY_FILE);
    try {
      const handle = fs.openSync(filePath, "wx", 0o600);
      try {
        const key = crypto.randomBytes(32);
        fs.writeSync(handle, key, 0, key.length, 0);
        fs.fsyncSync(handle);
        syncDirectoryBestEffort(directory);
        return key;
      } finally {
        fs.closeSync(handle);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    rejectLinkIfPresent(filePath);
    const handle = fs.openSync(filePath, "r");
    try {
      assertOpenedPathContained(directory, filePath);
      const stat = fs.fstatSync(handle);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size !== 32) {
        throw new Error("Operation effect key is unsafe.");
      }
      assertSameOpenedFile(filePath, stat);
      const key = Buffer.alloc(32);
      const bytesRead = fs.readSync(handle, key, 0, 32, 0);
      if (bytesRead !== 32) throw new Error("Operation effect key read was incomplete.");
      return key;
    } finally {
      fs.closeSync(handle);
    }
  }
}

export function operationEffectNamespace(memoryRoot: string): string {
  return crypto.createHash("sha256")
    .update("zharwing.operation-effect-namespace.v1\0", "utf8")
    .update(path.resolve(memoryRoot), "utf8")
    .digest("hex");
}

function effectScopeDigest(namespace: string, identity: OperationEffectIdentity): string {
  return digestParts("zharwing.operation-effect-scope.v2", [
    namespace,
    identity.sessionOwner,
    identity.projectGeneration ?? "global",
    identity.operation,
    identity.idempotencyKey
  ]);
}

function applyRecord(states: Map<string, EffectState>, record: EffectJournalRecord): void {
  const previous = states.get(record.scopeDigest);
  if (record.event === "claim") {
    if (previous && (previous.state !== "released" || previous.inputDigest !== record.inputDigest)) {
      throw new Error("Invalid operation effect claim transition.");
    }
    states.set(record.scopeDigest, {
      scopeDigest: record.scopeDigest,
      inputDigest: record.inputDigest,
      claimId: record.claimId,
      state: "in-flight"
    });
    return;
  }
  if (
    !previous || previous.state !== "in-flight" ||
    previous.claimId !== record.claimId || previous.inputDigest !== record.inputDigest
  ) {
    throw new Error("Invalid operation effect settlement transition.");
  }
  states.set(record.scopeDigest, {
    ...previous,
    state: record.event === "complete-receipt" ? "complete" : "released"
  });
}

function parseRecord(value: unknown, key: Buffer): EffectJournalRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid effect record.");
  const record = value as Record<string, unknown>;
  const expectedKeys = [
    "claimId", "event", "inputDigest", "mac", "namespace", "recordedAt", "schema", "scopeDigest"
  ].sort();
  if (Object.keys(record).sort().join("\0") !== expectedKeys.join("\0")) {
    throw new Error("Unexpected operation effect property.");
  }
  if (
    record.schema !== JOURNAL_SCHEMA ||
    typeof record.namespace !== "string" || !isDigest(record.namespace) ||
    typeof record.scopeDigest !== "string" || !isDigest(record.scopeDigest) ||
    typeof record.inputDigest !== "string" || !isDigest(record.inputDigest) ||
    typeof record.claimId !== "string" || !record.claimId || Buffer.byteLength(record.claimId, "utf8") > 256 ||
    !["claim", "complete-receipt", "release"].includes(String(record.event)) ||
    typeof record.recordedAt !== "string" || !Number.isFinite(Date.parse(record.recordedAt)) ||
    typeof record.mac !== "string" || !isDigest(record.mac)
  ) {
    throw new Error("Invalid operation effect record.");
  }
  const unsigned: Omit<EffectJournalRecord, "mac"> = {
    schema: JOURNAL_SCHEMA,
    namespace: record.namespace,
    scopeDigest: record.scopeDigest,
    inputDigest: record.inputDigest,
    claimId: record.claimId,
    event: record.event as JournalEvent,
    recordedAt: record.recordedAt
  };
  const expectedMac = signRecord(unsigned, key);
  if (!crypto.timingSafeEqual(Buffer.from(record.mac, "hex"), Buffer.from(expectedMac, "hex"))) {
    throw new Error("Forged operation effect record.");
  }
  return { ...unsigned, mac: record.mac };
}

function signRecord(unsigned: Omit<EffectJournalRecord, "mac">, key: Buffer): string {
  return crypto.createHmac("sha256", key).update(JSON.stringify(unsigned), "utf8").digest("hex");
}

function signedLine(unsigned: Omit<EffectJournalRecord, "mac">, key: Buffer): string {
  return JSON.stringify({ ...unsigned, mac: signRecord(unsigned, key) });
}

function assertIdentity(identity: OperationEffectIdentity): void {
  assertBoundedText(identity.sessionOwner, "session owner", 512);
  if (identity.projectId !== null) assertBoundedText(identity.projectId, "project", 512);
  if (identity.projectGeneration !== null && !isDigest(identity.projectGeneration)) {
    throw new Error("Invalid project generation.");
  }
  if ((identity.projectId === null) !== (identity.projectGeneration === null)) {
    throw new Error("Project id and generation must be bound together.");
  }
  if (isDurableDomainEffectOperation(identity.operation) && !identity.projectGeneration) {
    throw new Error("Durable domain effects require a project generation.");
  }
  assertBoundedText(identity.operation, "operation", 256);
  assertBoundedText(identity.idempotencyKey, "idempotency key", 256);
  if (!isDigest(identity.inputDigest)) throw new Error("Invalid operation input digest.");
}

function acquireLock(lockPath: string, nonce: string): number | undefined {
  let handle: number | undefined;
  try {
    handle = fs.openSync(lockPath, "wx", 0o600);
    const bytes = Buffer.from(JSON.stringify({
      pid: process.pid,
      createdAt: new Date().toISOString(),
      nonce
    }), "utf8");
    fs.writeSync(handle, bytes, 0, bytes.length, 0);
    fs.fsyncSync(handle);
    return handle;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") return undefined;
    if (handle !== undefined) {
      try { fs.closeSync(handle); } catch { /* preserve the original failure */ }
      try { fs.unlinkSync(lockPath); } catch { /* bounded lock cleanup */ }
    }
    throw error;
  }
}

function reclaimStaleLock(lockPath: string): boolean {
  rejectLinkIfPresent(lockPath);
  let stat: ReturnType<typeof fs.lstatSync>;
  try {
    stat = fs.lstatSync(lockPath);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAXIMUM_LOCK_BYTES) return false;
  try {
    const record = JSON.parse(fs.readFileSync(lockPath, "utf8")) as {
      pid?: unknown;
      createdAt?: unknown;
    };
    const pid = Number(record.pid);
    const createdAt = typeof record.createdAt === "string" ? Date.parse(record.createdAt) : Number.NaN;
    if (
      !Number.isSafeInteger(pid) || pid < 1 || !Number.isFinite(createdAt) ||
      Date.now() - createdAt < STALE_LOCK_MS || processIsAlive(pid)
    ) {
      return false;
    }
    const stale = `${lockPath}.${crypto.randomUUID()}.stale`;
    fs.renameSync(lockPath, stale);
    fs.unlinkSync(stale);
    return true;
  } catch {
    return false;
  }
}

function releaseLock(lockPath: string, nonce: string): void {
  try {
    const stat = fs.lstatSync(lockPath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAXIMUM_LOCK_BYTES) return;
    const record = JSON.parse(fs.readFileSync(lockPath, "utf8")) as { nonce?: unknown };
    if (record.nonce === nonce) fs.unlinkSync(lockPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
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

function fileSizeIfPresent(filePath: string): number {
  try {
    return fs.statSync(filePath).size;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

function digestParts(domain: string, values: readonly string[]): string {
  const hash = crypto.createHash("sha256").update(`${domain}\0`, "utf8");
  for (const value of values) {
    const bytes = Buffer.from(value, "utf8");
    hash.update(String(bytes.length), "utf8").update(":", "utf8").update(bytes).update("\0", "utf8");
  }
  return hash.digest("hex");
}

function assertBoundedText(value: string, label: string, maximumLength: number): void {
  if (!value || Buffer.byteLength(value, "utf8") > maximumLength) {
    throw new Error(`Invalid ${label}.`);
  }
}

function boundedPositiveInteger(value: number, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new Error(`${label} must be a bounded positive safe integer.`);
  }
  return value;
}

function isDigest(value: string): boolean {
  return /^[a-f0-9]{64}$/.test(value);
}

function defaultEffectStateRoot(namespace: string): string {
  const base = process.platform === "win32"
    ? process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming")
    : process.env.XDG_STATE_HOME || path.join(os.homedir(), ".local", "state");
  return path.join(base, "zharwing-memory", "authority", "operation-effects", namespace);
}

function rejectLinkIfPresent(filePath: string): void {
  try {
    const stat = fs.lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("Operation effect file is unsafe.");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

function assertOpenedPathContained(directory: string, filePath: string): void {
  const realDirectory = fs.realpathSync(directory);
  const realFile = fs.realpathSync(filePath);
  if (
    comparablePath(path.dirname(realFile)) !== comparablePath(realDirectory) ||
    path.basename(realFile) !== path.basename(filePath)
  ) {
    throw new Error("Operation effect file escaped its state directory.");
  }
}

function assertSameOpenedFile(filePath: string, opened: ReturnType<typeof fs.fstatSync>): void {
  const current = fs.lstatSync(filePath);
  if (
    !current.isFile() || current.isSymbolicLink() || current.nlink !== 1 ||
    current.dev !== opened.dev || current.ino !== opened.ino
  ) {
    throw new Error("Operation effect file changed during safe open.");
  }
}

function comparablePath(value: string): string {
  const normalized = path.normalize(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function syncDirectoryBestEffort(directory: string): void {
  let handle: number | undefined;
  try {
    handle = fs.openSync(directory, "r");
    fs.fsyncSync(handle);
  } catch (error) {
    if (!["EACCES", "EBADF", "EINVAL", "EISDIR", "ENOTSUP", "EPERM"].includes(
      (error as NodeJS.ErrnoException).code || ""
    )) {
      throw error;
    }
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}
