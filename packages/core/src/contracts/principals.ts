import type {
  AuthenticatedPrincipal,
  PrincipalAudience,
  PrincipalClaims,
  ProjectId
} from "../types.js";
import type { OperationName } from "./operation-registry.js";
import { isOperationName } from "./operation-registry.js";
import {
  ContractDecodeError,
  arraySchema,
  enumSchema,
  integerSchema,
  nullableSchema,
  objectSchema,
  stringSchema,
  type RuntimeSchema
} from "./runtime-schema.js";
import { projectIdSchema } from "./identifiers.js";

export const ALL_PRINCIPAL_AUDIENCES = [
  "browser",
  "desktop",
  "agent",
  "admin",
  "provider",
  "backup"
] as const satisfies readonly PrincipalAudience[];

export type OperationPrincipalClaims = PrincipalClaims<OperationName>;
export type AuthenticatedOperationPrincipal = AuthenticatedPrincipal<OperationName>;

const principalClaimsWireSchema = objectSchema({
  principalId: stringSchema,
  sessionId: stringSchema,
  sessionOwner: stringSchema,
  audience: enumSchema(ALL_PRINCIPAL_AUDIENCES),
  operations: arraySchema(stringSchema),
  projectId: nullableSchema(projectIdSchema),
  issuedAt: stringSchema,
  expiresAt: stringSchema,
  authorityEpoch: integerSchema,
  policyDigest: stringSchema,
  rotationId: stringSchema,
  revocationId: stringSchema
});

export const principalClaimsSchema: RuntimeSchema<OperationPrincipalClaims> = {
  description: "bounded operation principal claims",
  parse(value, path = "principal") {
    const parsed = principalClaimsWireSchema.parse(value, path);
    for (const field of [
      "principalId",
      "sessionId",
      "sessionOwner",
      "policyDigest",
      "rotationId",
      "revocationId"
    ] as const) {
      if (parsed[field].trim().length === 0) {
        throw new ContractDecodeError(`${path}.${field}`, "a non-empty string", parsed[field]);
      }
    }
    if (parsed.authorityEpoch < 0) {
      throw new ContractDecodeError(`${path}.authorityEpoch`, "a non-negative integer", parsed.authorityEpoch);
    }
    const issuedAt = Date.parse(parsed.issuedAt);
    const expiresAt = Date.parse(parsed.expiresAt);
    if (!Number.isFinite(issuedAt)) {
      throw new ContractDecodeError(`${path}.issuedAt`, "an ISO timestamp", parsed.issuedAt);
    }
    if (!Number.isFinite(expiresAt) || expiresAt <= issuedAt) {
      throw new ContractDecodeError(`${path}.expiresAt`, "an ISO timestamp after issuedAt", parsed.expiresAt);
    }
    const operations = parsed.operations.map((operation, index) => {
      if (!isOperationName(operation)) {
        throw new ContractDecodeError(`${path}.operations[${index}]`, "a registered operation", operation);
      }
      return operation;
    });
    if (operations.length === 0 || new Set(operations).size !== operations.length) {
      throw new ContractDecodeError(`${path}.operations`, "a non-empty unique operation set", operations);
    }
    return { ...parsed, operations };
  }
};

export function parsePrincipalClaims(value: unknown): OperationPrincipalClaims {
  return principalClaimsSchema.parse(value);
}

export type PrincipalInvalidReason =
  | "not-yet-valid"
  | "expired"
  | "authority-epoch-mismatch"
  | "principal-revoked"
  | "session-revoked"
  | "revocation-id-revoked"
  | "rotation-superseded";

export interface PrincipalValidityContext {
  /** Epoch milliseconds supplied by the authority-owned clock. */
  readonly now: number;
  readonly authorityEpoch: number;
  readonly revokedPrincipalIds?: ReadonlySet<string>;
  readonly revokedSessionIds?: ReadonlySet<string>;
  readonly revokedRevocationIds?: ReadonlySet<string>;
  /** When provided, only these rotation identifiers remain current. */
  readonly activeRotationIds?: ReadonlySet<string>;
}

export type PrincipalValidity =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: PrincipalInvalidReason };

export function isPrincipalAudience(value: unknown): value is PrincipalAudience {
  return typeof value === "string" && (ALL_PRINCIPAL_AUDIENCES as readonly string[]).includes(value);
}

export function evaluatePrincipalValidity(
  principal: PrincipalClaims,
  context: PrincipalValidityContext
): PrincipalValidity {
  const issuedAt = Date.parse(principal.issuedAt);
  const expiresAt = Date.parse(principal.expiresAt);

  if (!Number.isFinite(issuedAt) || issuedAt > context.now) {
    return { valid: false, reason: "not-yet-valid" };
  }
  if (!Number.isFinite(expiresAt) || expiresAt <= context.now) {
    return { valid: false, reason: "expired" };
  }
  if (principal.authorityEpoch !== context.authorityEpoch) {
    return { valid: false, reason: "authority-epoch-mismatch" };
  }
  if (context.revokedPrincipalIds?.has(principal.principalId)) {
    return { valid: false, reason: "principal-revoked" };
  }
  if (context.revokedSessionIds?.has(principal.sessionId)) {
    return { valid: false, reason: "session-revoked" };
  }
  if (context.revokedRevocationIds?.has(principal.revocationId)) {
    return { valid: false, reason: "revocation-id-revoked" };
  }
  if (context.activeRotationIds && !context.activeRotationIds.has(principal.rotationId)) {
    return { valid: false, reason: "rotation-superseded" };
  }
  return { valid: true };
}

export function isPrincipalCurrent(
  principal: PrincipalClaims,
  context: PrincipalValidityContext
): boolean {
  return evaluatePrincipalValidity(principal, context).valid;
}

export function principalAllowsOperation(
  principal: PrincipalClaims<string>,
  operation: OperationName
): boolean {
  return principal.operations.includes(operation);
}

/**
 * A project-scoped request always requires an exact non-null binding. Global
 * operations may be called by either global or project-bound principals.
 */
export function principalAllowsProject(
  principal: PrincipalClaims,
  requestedProjectId: ProjectId | undefined,
  projectScope: "none" | "required"
): boolean {
  if (projectScope === "none") {
    // Global operations may omit project identity. If their compatibility
    // input happens to carry one, it never turns a null/global principal into
    // authority for an arbitrary project.
    return requestedProjectId === undefined || principal.projectId === requestedProjectId;
  }
  return requestedProjectId !== undefined && principal.projectId === requestedProjectId;
}

/**
 * Narrows the registrar proof without mutating credential claims. Authorities
 * should freeze the returned object before sharing it with application code.
 */
export function markPrincipalAuthenticated<Operation extends string>(
  principal: PrincipalClaims<Operation>
): AuthenticatedPrincipal<Operation> {
  const operations = Object.freeze([...principal.operations]);
  return Object.freeze({ ...principal, operations, authenticated: true });
}
