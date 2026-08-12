import crypto from "node:crypto";
import {
  isPrincipalCurrent,
  markPrincipalAuthenticated,
  type AuthenticatedPrincipal,
  type OperationName,
  type PrincipalAudience,
  type PrincipalClaims
} from "@zharwing/memory-core";

export interface AuthorityClock {
  now(): number;
}

export interface AuthorityIds {
  create(prefix: string): string;
}

export interface PrincipalGrant {
  readonly principalId: string;
  readonly sessionOwner: string;
  readonly audience: PrincipalAudience;
  readonly operations: readonly OperationName[];
  readonly projectId: string | null;
  readonly ttlMs: number;
  readonly policyDigest?: string;
  readonly rotationId?: string;
  readonly revocationId?: string;
}

interface CredentialRecord {
  readonly digest: Buffer;
  readonly principal: AuthenticatedPrincipal<OperationName>;
}

const MAX_CREDENTIAL_LENGTH = 4_096;

/**
 * In-memory authority for one daemon process. Raw credentials are accepted at
 * the trusted composition boundary and immediately reduced to fixed-length
 * digests. Every returned principal is immutable and time/epoch/revocation
 * checked again by the operation registrar before dispatch.
 */
export class AuthorityService {
  private readonly credentials: CredentialRecord[] = [];
  private readonly revokedPrincipalIds = new Set<string>();
  private readonly revokedSessionIds = new Set<string>();
  private readonly revokedRevocationIds = new Set<string>();
  private readonly activeRotationIds = new Set<string>();
  private epoch: number;

  constructor(
    private readonly clock: AuthorityClock,
    private readonly ids: AuthorityIds,
    initialEpoch = 1
  ) {
    if (!Number.isSafeInteger(initialEpoch) || initialEpoch < 1) {
      throw new Error("Authority epoch must be a positive safe integer.");
    }
    this.epoch = initialEpoch;
  }

  get authorityEpoch(): number {
    return this.epoch;
  }

  issuePrincipal(grant: PrincipalGrant): AuthenticatedPrincipal<OperationName> {
    if (!grant.principalId || !grant.sessionOwner || grant.operations.length === 0) {
      throw new Error("Principal identity, owner, and operation set are required.");
    }
    if (!Number.isSafeInteger(grant.ttlMs) || grant.ttlMs <= 0) {
      throw new Error("Principal TTL must be a positive safe integer.");
    }
    const issuedAt = this.clock.now();
    const rotationId = grant.rotationId ?? this.ids.create("rotation");
    const claims: PrincipalClaims<OperationName> = {
      principalId: grant.principalId,
      sessionId: this.ids.create("principal-session"),
      sessionOwner: grant.sessionOwner,
      audience: grant.audience,
      operations: Object.freeze([...new Set(grant.operations)]),
      projectId: grant.projectId,
      issuedAt: new Date(issuedAt).toISOString(),
      expiresAt: new Date(issuedAt + grant.ttlMs).toISOString(),
      authorityEpoch: this.epoch,
      policyDigest: grant.policyDigest ?? "policy:hardened-local/v1",
      rotationId,
      revocationId: grant.revocationId ?? this.ids.create("revocation")
    };
    this.activeRotationIds.add(rotationId);
    return freezePrincipal(markPrincipalAuthenticated(claims));
  }

  registerCredential(
    credential: string,
    grant: PrincipalGrant
  ): AuthenticatedPrincipal<OperationName> {
    assertCredential(credential);
    const digest = credentialDigest(credential);
    if (this.findCredential(digest)) {
      throw new Error("Credential is already registered.");
    }
    const principal = this.issuePrincipal(grant);
    this.credentials.push({ digest, principal });
    return principal;
  }

  authenticate(credential: string | undefined): AuthenticatedPrincipal<OperationName> | undefined {
    if (!credential || credential.length > MAX_CREDENTIAL_LENGTH) return undefined;
    const record = this.findCredential(credentialDigest(credential));
    if (!record || !this.isCurrent(record.principal)) return undefined;
    return record.principal;
  }

  isCurrent(principal: AuthenticatedPrincipal<OperationName>): boolean {
    return isPrincipalCurrent(principal, {
      now: this.clock.now(),
      authorityEpoch: this.epoch,
      revokedPrincipalIds: this.revokedPrincipalIds,
      revokedSessionIds: this.revokedSessionIds,
      revokedRevocationIds: this.revokedRevocationIds,
      activeRotationIds: this.activeRotationIds
    });
  }

  revokePrincipal(principalId: string): void {
    if (principalId) this.revokedPrincipalIds.add(principalId);
  }

  revokeSession(sessionId: string): void {
    if (sessionId) this.revokedSessionIds.add(sessionId);
  }

  revokeRevocationId(revocationId: string): void {
    if (revocationId) this.revokedRevocationIds.add(revocationId);
  }

  revokeRotation(rotationId: string): void {
    if (rotationId) this.activeRotationIds.delete(rotationId);
  }

  rotateCredential(
    oldCredential: string,
    newCredential: string,
    grant: PrincipalGrant
  ): AuthenticatedPrincipal<OperationName> {
    const oldRecord = this.findCredential(credentialDigestChecked(oldCredential));
    if (!oldRecord || !this.isCurrent(oldRecord.principal)) {
      throw new Error("Current credential is not active.");
    }
    assertCredential(newCredential);
    this.revokeSession(oldRecord.principal.sessionId);
    this.revokeRotation(oldRecord.principal.rotationId);
    this.removeCredential(oldRecord);
    return this.registerCredential(newCredential, grant);
  }

  advanceAuthorityEpoch(): number {
    this.epoch += 1;
    this.credentials.length = 0;
    this.activeRotationIds.clear();
    return this.epoch;
  }

  private findCredential(digest: Buffer): CredentialRecord | undefined {
    let match: CredentialRecord | undefined;
    // Digests have a fixed length. Complete the scan so credential presence is
    // not exposed through an early string comparison.
    for (const record of this.credentials) {
      if (crypto.timingSafeEqual(record.digest, digest)) match = record;
    }
    return match;
  }

  private removeCredential(record: CredentialRecord): void {
    const index = this.credentials.indexOf(record);
    if (index >= 0) this.credentials.splice(index, 1);
  }
}

export function systemAuthorityClock(): AuthorityClock {
  return { now: () => Date.now() };
}

export function cryptoAuthorityIds(): AuthorityIds {
  return { create: (prefix) => `${prefix}:${crypto.randomUUID()}` };
}

export function createOpaqueCredential(): string {
  return crypto.randomBytes(32).toString("base64url");
}

function credentialDigestChecked(credential: string): Buffer {
  assertCredential(credential);
  return credentialDigest(credential);
}

function credentialDigest(credential: string): Buffer {
  return crypto.createHash("sha256").update(credential, "utf8").digest();
}

function assertCredential(credential: string): void {
  if (!credential || credential.length < 32 || credential.length > MAX_CREDENTIAL_LENGTH) {
    throw new Error("Credential must be a bounded opaque value.");
  }
}

function freezePrincipal(
  principal: AuthenticatedPrincipal<OperationName>
): AuthenticatedPrincipal<OperationName> {
  Object.freeze(principal.operations);
  return Object.freeze(principal);
}
