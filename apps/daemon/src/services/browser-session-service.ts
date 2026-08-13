import crypto from "node:crypto";
import type { AuthenticatedPrincipal, OperationName } from "@zharwing/memory-core";
import {
  AuthorityService,
  createOpaqueCredential,
  type AuthorityClock,
  type PrincipalGrant
} from "./authority-service.js";

export const BROWSER_SESSION_COOKIE = "zharwing_browser_session";

export interface BrowserSecretSource {
  create(): string;
}

export interface BrowserBootstrapGrant {
  readonly principalId: string;
  readonly sessionOwner: string;
  readonly operations: readonly OperationName[];
  readonly projectId: string | null;
  readonly allowedProjectIds: readonly string[];
  readonly policyDigest?: string;
}

export interface BrowserBootstrapIssue {
  /** Returned only to the trusted launcher, never by an HTTP issuance route. */
  readonly code: string;
  readonly expiresAt: string;
}

export interface BrowserSessionIssue {
  /** Used once by the HTTP adapter to create an HttpOnly cookie. */
  readonly cookie: string;
  /** Browser keeps this value in memory and sends it on consequential POSTs. */
  readonly csrfToken: string;
  readonly expiresAt: string;
  readonly rotationId: string;
  readonly principal: AuthenticatedPrincipal<OperationName>;
  /** Daemon-only cookie attribute decision derived from the bound origin. */
  readonly secureCookie: boolean;
}

interface BootstrapRecord {
  readonly digest: Buffer;
  readonly origin: string;
  readonly host: string;
  readonly grant: BrowserBootstrapGrant;
  readonly expiresAt: number;
}

interface BrowserSessionRecord {
  readonly cookieDigest: Buffer;
  readonly csrfDigest: Buffer;
  readonly origin: string;
  readonly host: string;
  readonly allowedProjectIds: Set<string>;
  readonly principal: AuthenticatedPrincipal<OperationName>;
  readonly expiresAt: number;
  readonly personalPreview: boolean;
}

export interface BrowserSessionOptions {
  readonly bootstrapTtlMs?: number;
  readonly sessionTtlMs?: number;
  readonly maxBootstraps?: number;
  readonly maxSessions?: number;
}

const DEFAULT_BOOTSTRAP_TTL_MS = 60_000;
const DEFAULT_SESSION_TTL_MS = 15 * 60_000;
const DEFAULT_MAX_BOOTSTRAPS = 64;
const DEFAULT_MAX_SESSIONS = 128;

/** Digest-only, process-local browser bootstrap and cookie/CSRF session owner. */
export class BrowserSessionService {
  private readonly bootstraps: BootstrapRecord[] = [];
  private readonly sessions: BrowserSessionRecord[] = [];
  private readonly bootstrapTtlMs: number;
  private readonly sessionTtlMs: number;
  private readonly maxBootstraps: number;
  private readonly maxSessions: number;

  constructor(
    private readonly authority: AuthorityService,
    private readonly clock: AuthorityClock,
    private readonly secrets: BrowserSecretSource = { create: createOpaqueCredential },
    options: BrowserSessionOptions = {}
  ) {
    this.bootstrapTtlMs = positiveBounded(options.bootstrapTtlMs, DEFAULT_BOOTSTRAP_TTL_MS);
    this.sessionTtlMs = positiveBounded(options.sessionTtlMs, DEFAULT_SESSION_TTL_MS);
    this.maxBootstraps = positiveBounded(options.maxBootstraps, DEFAULT_MAX_BOOTSTRAPS);
    this.maxSessions = positiveBounded(options.maxSessions, DEFAULT_MAX_SESSIONS);
  }

  /**
   * Trusted-launcher API. Only a digest is retained. The returned code must be
   * delivered out-of-band or in a URL fragment, never logged or placed in a
   * query string.
   */
  issueBootstrap(
    origin: string,
    host: string,
    grant: BrowserBootstrapGrant
  ): BrowserBootstrapIssue {
    const normalizedOrigin = exactOrigin(origin);
    const normalizedHost = exactHost(host);
    if (grant.operations.length === 0) {
      throw new Error("Browser bootstrap requires an explicit operation grant.");
    }
    if (grant.projectId !== null && !grant.allowedProjectIds.includes(grant.projectId)) {
      throw new Error("Initial browser project must be included in the project binding.");
    }
    this.prune();
    if (this.bootstraps.length >= this.maxBootstraps) {
      throw new Error("Browser bootstrap capacity reached.");
    }
    const code = this.secrets.create();
    assertOpaqueSecret(code);
    const expiresAt = this.clock.now() + this.bootstrapTtlMs;
    this.bootstraps.push({
      digest: secretDigest(code),
      origin: normalizedOrigin,
      host: normalizedHost,
      grant: freezeBootstrapGrant(grant),
      expiresAt
    });
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }

  consumeBootstrap(code: string, origin: string, host: string): BrowserSessionIssue | undefined {
    if (!isOpaqueSecret(code)) return undefined;
    const digest = secretDigest(code);
    const record = findDigest(this.bootstraps, digest, (entry) => entry.digest);
    if (!record) return undefined;

    // Consumption is atomic in the daemon event loop and happens before any
    // branch that could reveal why the code was refused.
    this.bootstraps.splice(this.bootstraps.indexOf(record), 1);
    if (
      record.expiresAt <= this.clock.now() ||
      record.origin !== safeExactOrigin(origin) ||
      record.host !== safeExactHost(host)
    ) {
      return undefined;
    }
    return this.createSession(record.origin, record.host, record.grant);
  }

  /**
   * Explicit personal-preview compatibility. The HTTP adapter may call this
   * only for loopback, authMode=none preview requests. Hardened-local and
   * token-authenticated preview never reach this authority-free path.
   */
  establishUnboundPreviewSession(
    origin: string,
    host: string,
    operations: readonly OperationName[],
    allowedProjectIds: readonly string[] = []
  ): BrowserSessionIssue {
    if (operations.length === 0) throw new Error("Preview session requires operations.");
    return this.createSession(exactOrigin(origin), exactHost(host), {
      principalId: "personal-preview-browser",
      sessionOwner: "personal-preview-loopback",
      operations,
      projectId: null,
      // Compatibility preview is explicitly authority-free, but project
      // choices still come from the daemon's current registry rather than
      // browser-supplied ids.
      allowedProjectIds
    }, true);
  }

  authenticate(
    cookie: string | undefined,
    csrfToken: string | undefined,
    origin: string | undefined,
    host: string,
    requireCsrf = true,
    allowPersonalPreviewTokenFallback = false
  ): AuthenticatedPrincipal<OperationName> | undefined {
    return this.authenticatedRecord(
      cookie,
      csrfToken,
      origin,
      host,
      requireCsrf,
      allowPersonalPreviewTokenFallback
    )?.principal;
  }

  switchProject(
    cookie: string,
    csrfToken: string,
    origin: string,
    host: string,
    projectId: string,
    allowPersonalPreviewTokenFallback = false
  ): BrowserSessionIssue | undefined {
    const record = this.authenticatedRecord(
      cookie,
      csrfToken,
      origin,
      host,
      true,
      allowPersonalPreviewTokenFallback
    );
    const principal = record?.principal;
    if (!record || !principal || !projectId || projectId.trim() !== projectId) return undefined;
    // A browser cannot turn caller knowledge of an id into authority. Existing
    // projects must be launcher-granted; newly created projects are added only
    // by allowCreatedProject after decoded create-project success.
    if (!record.allowedProjectIds.has(projectId)) return undefined;
    const allowedProjectIds = [...record.allowedProjectIds];
    const grant: BrowserBootstrapGrant = {
      principalId: principal.principalId,
      sessionOwner: principal.sessionOwner,
      operations: principal.operations,
      projectId,
      allowedProjectIds,
      policyDigest: principal.policyDigest
    };
    this.revokeRecord(record);
    return this.createSession(record.origin, record.host, grant, record.personalPreview);
  }

  rotateSession(
    cookie: string,
    csrfToken: string,
    origin: string,
    host: string,
    allowPersonalPreviewTokenFallback = false
  ): BrowserSessionIssue | undefined {
    const record = this.authenticatedRecord(
      cookie,
      csrfToken,
      origin,
      host,
      true,
      allowPersonalPreviewTokenFallback
    );
    const principal = record?.principal;
    if (!record || !principal) return undefined;
    const grant: BrowserBootstrapGrant = {
      principalId: principal.principalId,
      sessionOwner: principal.sessionOwner,
      operations: principal.operations,
      projectId: principal.projectId,
      allowedProjectIds: [...record.allowedProjectIds],
      policyDigest: principal.policyDigest
    };
    this.revokeRecord(record);
    return this.createSession(record.origin, record.host, grant, record.personalPreview);
  }

  revokeCookie(cookie: string | undefined): void {
    if (!cookie || !isOpaqueSecret(cookie)) return;
    const record = findDigest(this.sessions, secretDigest(cookie), (entry) => entry.cookieDigest);
    if (record) this.revokeRecord(record);
  }

  revokePrincipal(principal: AuthenticatedPrincipal<OperationName>): void {
    const record = this.sessions.find((candidate) => candidate.principal === principal);
    if (record) this.revokeRecord(record);
  }

  /**
   * Adds only a project just created by this authenticated browser invocation.
   * The HTTP adapter calls this after decoded operation success, never from
   * caller input, so an empty first-run grant cannot claim an existing project.
   */
  allowCreatedProject(
    principal: AuthenticatedPrincipal<OperationName>,
    projectId: string
  ): boolean {
    if (!projectId || projectId.trim() !== projectId || !this.authority.isCurrent(principal)) {
      return false;
    }
    const record = this.sessions.find(
      (candidate) => candidate.principal.sessionId === principal.sessionId
    );
    if (!record || record.principal !== principal) return false;
    record.allowedProjectIds.add(projectId);
    return true;
  }

  cookieHeader(issue: BrowserSessionIssue): string {
    const maxAge = Math.max(0, Math.floor((Date.parse(issue.expiresAt) - this.clock.now()) / 1_000));
    const secure = issue.secureCookie ? "; Secure" : "";
    return `${BROWSER_SESSION_COOKIE}=${issue.cookie}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
  }

  expiredCookieHeader(origin?: string): string {
    const secure = safeExactOrigin(origin)?.startsWith("https://") ? "; Secure" : "";
    return `${BROWSER_SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
  }

  private createSession(
    origin: string,
    host: string,
    grant: BrowserBootstrapGrant,
    personalPreview = false
  ): BrowserSessionIssue {
    this.prune();
    if (this.sessions.length >= this.maxSessions) {
      throw new Error("Browser session capacity reached.");
    }
    const cookie = this.secrets.create();
    const csrfToken = this.secrets.create();
    assertOpaqueSecret(cookie);
    assertOpaqueSecret(csrfToken);
    const principalGrant: PrincipalGrant = {
      principalId: grant.principalId,
      sessionOwner: grant.sessionOwner,
      audience: "browser",
      operations: grant.operations,
      projectId: grant.projectId,
      ttlMs: this.sessionTtlMs,
      policyDigest: grant.policyDigest
    };
    const principal = this.authority.issuePrincipal(principalGrant);
    const expiresAt = Date.parse(principal.expiresAt);
    const record: BrowserSessionRecord = {
      cookieDigest: secretDigest(cookie),
      csrfDigest: secretDigest(csrfToken),
      origin,
      host,
      allowedProjectIds: new Set(grant.allowedProjectIds),
      principal,
      expiresAt,
      personalPreview
    };
    this.sessions.push(record);
    return {
      cookie,
      csrfToken,
      expiresAt: principal.expiresAt,
      rotationId: principal.rotationId,
      principal,
      secureCookie: origin.startsWith("https://")
    };
  }

  private authenticatedRecord(
    cookie: string | undefined,
    csrfToken: string | undefined,
    origin: string | undefined,
    host: string,
    requireCsrf: boolean,
    allowPersonalPreviewTokenFallback: boolean
  ): BrowserSessionRecord | undefined {
    if (!cookie || !isOpaqueSecret(cookie)) return undefined;
    this.prune();
    const normalizedOrigin = safeExactOrigin(origin);
    const normalizedHost = safeExactHost(host);
    if (!normalizedOrigin || !normalizedHost) return undefined;
    const cookieRecord = findDigest(this.sessions, secretDigest(cookie), (entry) => entry.cookieDigest);
    if (!cookieRecord || !this.recordMatchesRequest(cookieRecord, normalizedOrigin, normalizedHost)) {
      return undefined;
    }
    if (!requireCsrf) return cookieRecord;
    if (!csrfToken || !isOpaqueSecret(csrfToken)) return undefined;
    const csrfDigest = secretDigest(csrfToken);
    if (crypto.timingSafeEqual(cookieRecord.csrfDigest, csrfDigest)) return cookieRecord;
    if (!allowPersonalPreviewTokenFallback || !cookieRecord.personalPreview) return undefined;

    // Personal-preview tabs share the browser cookie jar but intentionally keep
    // independent in-memory CSRF values and project claims. A newer tab may
    // overwrite the cookie. In explicit loopback/no-auth mode only, accept the
    // older tab's still-current CSRF record while retaining a valid preview
    // cookie as the browser-origin gate. Hardened/bootstrap sessions never use
    // this fallback.
    const tokenRecord = findDigest(this.sessions, csrfDigest, (entry) => entry.csrfDigest);
    if (
      !tokenRecord?.personalPreview ||
      !this.recordMatchesRequest(tokenRecord, normalizedOrigin, normalizedHost)
    ) {
      return undefined;
    }
    return tokenRecord;
  }

  private recordMatchesRequest(
    record: BrowserSessionRecord,
    origin: string,
    host: string
  ): boolean {
    return record.expiresAt > this.clock.now() &&
      this.authority.isCurrent(record.principal) &&
      record.origin === origin &&
      record.host === host;
  }

  private revokeRecord(record: BrowserSessionRecord): void {
    this.authority.revokeSession(record.principal.sessionId);
    this.authority.revokeRotation(record.principal.rotationId);
    const index = this.sessions.indexOf(record);
    if (index >= 0) this.sessions.splice(index, 1);
  }

  private prune(): void {
    const now = this.clock.now();
    for (let index = this.bootstraps.length - 1; index >= 0; index -= 1) {
      if (this.bootstraps[index]!.expiresAt <= now) this.bootstraps.splice(index, 1);
    }
    for (let index = this.sessions.length - 1; index >= 0; index -= 1) {
      const record = this.sessions[index]!;
      if (record.expiresAt <= now || !this.authority.isCurrent(record.principal)) {
        this.revokeRecord(record);
      }
    }
  }
}

function findDigest<T>(items: readonly T[], digest: Buffer, select: (item: T) => Buffer): T | undefined {
  let match: T | undefined;
  for (const item of items) {
    if (crypto.timingSafeEqual(select(item), digest)) match = item;
  }
  return match;
}

function secretDigest(value: string): Buffer {
  return crypto.createHash("sha256").update(value, "utf8").digest();
}

function isOpaqueSecret(value: string): boolean {
  return value.length >= 32 && value.length <= 4_096;
}

function assertOpaqueSecret(value: string): void {
  if (!isOpaqueSecret(value)) throw new Error("Secret source returned an invalid opaque value.");
}

function exactOrigin(value: string): string {
  const parsed = new URL(value);
  if (parsed.origin !== value || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    throw new Error("Browser origin must be exact and absolute.");
  }
  return parsed.origin;
}

function safeExactOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return exactOrigin(value);
  } catch {
    return undefined;
  }
}

function exactHost(value: string): string {
  if (!value || /[\s/@]/.test(value)) throw new Error("Browser host must be exact.");
  const parsed = new URL(`http://${value}`);
  if (parsed.host !== value) throw new Error("Browser host must be exact.");
  return parsed.host;
}

function safeExactHost(value: string): string | undefined {
  try {
    return exactHost(value);
  } catch {
    return undefined;
  }
}

function freezeBootstrapGrant(grant: BrowserBootstrapGrant): BrowserBootstrapGrant {
  return Object.freeze({
    ...grant,
    operations: Object.freeze([...new Set(grant.operations)]),
    allowedProjectIds: Object.freeze([...new Set(grant.allowedProjectIds)])
  });
}

function positiveBounded(value: number | undefined, fallback: number): number {
  const candidate = value ?? fallback;
  if (!Number.isSafeInteger(candidate) || candidate <= 0) {
    throw new Error("Browser session limits must be positive safe integers.");
  }
  return candidate;
}
