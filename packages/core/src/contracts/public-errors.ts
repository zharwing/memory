import {
  ContractDecodeError,
  arraySchema,
  enumSchema,
  numberRangeSchema,
  objectSchema,
  optionalSchema,
  type RuntimeSchema
} from "./runtime-schema.js";

export const PUBLIC_ERROR_REGISTRY = {
  validation: {
    messageId: "operation.validation",
    category: "validation",
    severity: "warning",
    retry: "never",
    recoveryActions: ["review-input"]
  },
  unauthorized: {
    messageId: "operation.unauthorized",
    category: "authorization",
    severity: "error",
    retry: "never",
    recoveryActions: ["unlock-session"]
  },
  forbidden: {
    messageId: "operation.forbidden",
    category: "authorization",
    severity: "error",
    retry: "never",
    recoveryActions: ["return"]
  },
  not_found: {
    messageId: "operation.not_found",
    category: "validation",
    severity: "warning",
    retry: "never",
    recoveryActions: ["return", "refresh"]
  },
  conflict: {
    messageId: "operation.conflict",
    category: "conflict",
    severity: "warning",
    retry: "manual",
    recoveryActions: ["refresh"]
  },
  unavailable: {
    messageId: "operation.unavailable",
    category: "transport",
    severity: "warning",
    retry: "manual",
    recoveryActions: ["retry"]
  },
  timeout: {
    messageId: "operation.timeout",
    category: "transport",
    severity: "warning",
    retry: "after-reconcile",
    recoveryActions: ["reconcile"]
  },
  cancelled: {
    messageId: "operation.cancelled",
    category: "transport",
    severity: "info",
    retry: "manual",
    recoveryActions: ["retry"]
  },
  protocol: {
    messageId: "operation.protocol",
    category: "transport",
    severity: "error",
    retry: "manual",
    recoveryActions: ["reload"]
  },
  compatibility: {
    messageId: "operation.compatibility",
    category: "transport",
    severity: "critical",
    retry: "never",
    recoveryActions: ["restart-service"]
  },
  outcome_unknown: {
    messageId: "operation.outcome_unknown",
    category: "transport",
    severity: "error",
    retry: "after-reconcile",
    recoveryActions: ["reconcile"]
  },
  internal: {
    messageId: "operation.internal",
    category: "internal",
    severity: "error",
    retry: "never",
    recoveryActions: ["reload"]
  }
} as const;

export type PublicErrorCode = keyof typeof PUBLIC_ERROR_REGISTRY;
export type PublicMessageId = (typeof PUBLIC_ERROR_REGISTRY)[PublicErrorCode]["messageId"];
export type PublicErrorCategory = (typeof PUBLIC_ERROR_REGISTRY)[PublicErrorCode]["category"];
export type PublicErrorSeverity = (typeof PUBLIC_ERROR_REGISTRY)[PublicErrorCode]["severity"];
export type PublicRetry = (typeof PUBLIC_ERROR_REGISTRY)[PublicErrorCode]["retry"];
export type PublicRecoveryAction =
  | "review-input"
  | "unlock-session"
  | "return"
  | "refresh"
  | "retry"
  | "reconcile"
  | "reload"
  | "restart-service";

/** Only values in this closed object may be interpolated into owned UI copy. */
export interface PublicErrorParameters {
  readonly retryAfterSeconds?: number;
}

export interface PublicError {
  readonly code: PublicErrorCode;
  readonly messageId: PublicMessageId;
  readonly category: PublicErrorCategory;
  readonly severity: PublicErrorSeverity;
  readonly retry: PublicRetry;
  readonly recoveryActions: readonly PublicRecoveryAction[];
  readonly parameters?: PublicErrorParameters;
  readonly fieldErrors?: Readonly<Record<string, PublicMessageId>>;
  readonly debugId?: string;
}

export interface PublicErrorOptions {
  readonly parameters?: PublicErrorParameters;
  readonly fieldErrors?: Readonly<Record<string, PublicMessageId>>;
  readonly debugId?: string;
}

const publicErrorCodes = Object.keys(PUBLIC_ERROR_REGISTRY) as [PublicErrorCode, ...PublicErrorCode[]];
const messageIds = Object.values(PUBLIC_ERROR_REGISTRY).map((entry) => entry.messageId) as [
  PublicMessageId,
  ...PublicMessageId[]
];
const recoveryActions: [PublicRecoveryAction, ...PublicRecoveryAction[]] = [
  "review-input",
  "unlock-session",
  "return",
  "refresh",
  "retry",
  "reconcile",
  "reload",
  "restart-service"
];

const safeDebugIdSchema: RuntimeSchema<string> = boundedOwnedStringSchema(
  "a bounded opaque diagnostic id",
  80,
  /^[A-Za-z0-9][A-Za-z0-9:_-]*$/
);
const fieldErrorsSchema: RuntimeSchema<Record<string, PublicMessageId>> = {
  description: "a bounded map of owned field names to public message ids",
  parse(value, path = "value") {
    if (!isRecord(value)) throw new ContractDecodeError(path, this.description, value);
    const entries = Object.entries(value);
    if (entries.length > 32) throw new ContractDecodeError(path, this.description, value);
    return Object.fromEntries(entries.map(([key, messageId]) => {
      if (!/^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(key)) {
        throw new ContractDecodeError(`${path}.${key}`, "an owned field identifier", key);
      }
      return [key, enumSchema(messageIds).parse(messageId, `${path}.${key}`)];
    }));
  }
};
const parametersSchema = objectSchema({
  retryAfterSeconds: optionalSchema(numberRangeSchema(0, 86_400))
});

const publicErrorShapeSchema = objectSchema({
  code: enumSchema(publicErrorCodes),
  messageId: enumSchema(messageIds),
  category: enumSchema(["validation", "authorization", "conflict", "transport", "internal"]),
  severity: enumSchema(["info", "warning", "error", "critical"]),
  retry: enumSchema(["never", "manual", "after-reconcile"]),
  recoveryActions: arraySchema(enumSchema(recoveryActions)),
  parameters: optionalSchema(parametersSchema),
  fieldErrors: optionalSchema(fieldErrorsSchema),
  debugId: optionalSchema(safeDebugIdSchema)
});

/**
 * Decodes the closed public error algebra and proves all redundant fields agree
 * with the registry entry selected by `code`. Unknown keys are rejected so an
 * upstream message, stack, path, provider payload, or token cannot hitchhike in
 * a nominally safe error envelope.
 */
export const publicErrorSchema: RuntimeSchema<PublicError> = {
  description: "a canonical registered public error",
  parse(value, path = "value") {
    const parsed = publicErrorShapeSchema.parse(value, path);
    const canonical = PUBLIC_ERROR_REGISTRY[parsed.code];
    if (
      parsed.messageId !== canonical.messageId ||
      parsed.category !== canonical.category ||
      parsed.severity !== canonical.severity ||
      parsed.retry !== canonical.retry ||
      !sameActions(parsed.recoveryActions, canonical.recoveryActions)
    ) {
      throw new ContractDecodeError(path, `the canonical ${parsed.code} public error`, value);
    }
    return freezePublicError(parsed);
  }
};

export function createPublicError(
  code: PublicErrorCode,
  options: PublicErrorOptions = {}
): PublicError {
  const definition = PUBLIC_ERROR_REGISTRY[code];
  const safeOptions = sanitizePublicErrorOptions(options);
  return freezePublicError({
    code,
    messageId: definition.messageId,
    category: definition.category,
    severity: definition.severity,
    retry: definition.retry,
    recoveryActions: definition.recoveryActions,
    ...safeOptions
  });
}

function freezePublicError(error: PublicError): PublicError {
  return Object.freeze({
    ...error,
    recoveryActions: Object.freeze([...error.recoveryActions]),
    ...(error.parameters ? { parameters: Object.freeze({ ...error.parameters }) } : {}),
    ...(error.fieldErrors ? { fieldErrors: Object.freeze({ ...error.fieldErrors }) } : {})
  });
}

export function isPublicError(value: unknown): value is PublicError {
  try {
    publicErrorSchema.parse(value);
    return true;
  } catch {
    return false;
  }
}

function sanitizePublicErrorOptions(
  options: PublicErrorOptions
): PublicErrorOptions {
  let parameters: PublicErrorParameters | undefined;
  let fieldErrors: Readonly<Record<string, PublicMessageId>> | undefined;
  let debugId: string | undefined;
  try {
    if (options.parameters !== undefined) parameters = parametersSchema.parse(options.parameters);
  } catch {
    // Drop an unsafe optional parameter rather than reflecting it into a wire envelope.
  }
  try {
    if (options.fieldErrors !== undefined) fieldErrors = fieldErrorsSchema.parse(options.fieldErrors);
  } catch {
    // Field keys are externally influenced on some validation paths; fail closed.
  }
  try {
    if (options.debugId !== undefined) debugId = safeDebugIdSchema.parse(options.debugId);
  } catch {
    // Diagnostic identifiers are optional and must never become a raw-text bypass.
  }
  return {
    ...(parameters ? { parameters } : {}),
    ...(fieldErrors ? { fieldErrors } : {}),
    ...(debugId ? { debugId } : {})
  };
}

function boundedOwnedStringSchema(
  description: string,
  maximumLength: number,
  pattern: RegExp
): RuntimeSchema<string> {
  return {
    description,
    parse(value, path = "value") {
      if (typeof value !== "string" || value.length > maximumLength || !pattern.test(value)) {
        throw new ContractDecodeError(path, description, value);
      }
      return value;
    }
  };
}

function sameActions(
  actual: readonly PublicRecoveryAction[],
  expected: readonly PublicRecoveryAction[]
): boolean {
  return actual.length === expected.length && actual.every((action, index) => action === expected[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
