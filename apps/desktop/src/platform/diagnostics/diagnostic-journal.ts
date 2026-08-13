import {
  createPublicError,
  isPublicError,
  type PublicError,
  type PublicErrorCategory,
  type PublicErrorCode,
  type PublicErrorSeverity,
  type PublicMessageId,
  type PublicRecoveryAction
} from "@zharwing/memory-core";

export type DiagnosticSurface =
  | "root"
  | "route"
  | "resource"
  | "form"
  | "operation"
  | "session"
  | "runtime"
  | "dependency";

export type DiagnosticEventName =
  | "failure.caught"
  | "recovery.requested"
  | "recovery.completed"
  | "recovery.failed"
  | "browser.session.state"
  | "runtime.created"
  | "runtime.disposed"
  | "dependency.console.output";

export interface SafeDiagnosticInput {
  readonly name: DiagnosticEventName;
  readonly surface: DiagnosticSurface;
  readonly error?: unknown;
  readonly publicError?: PublicError;
  readonly recoveryAction?: PublicRecoveryAction;
  readonly outcome?: "accepted" | "refused" | "unknown";
  readonly sessionState?: "active" | "locked";
  readonly consoleLevel?: "warn" | "error";
}

export type ClosedDiagnosticInput = Omit<SafeDiagnosticInput, "error">;

export interface SafeDiagnosticEvent {
  readonly sequence: number;
  readonly elapsedMilliseconds: number;
  readonly name: DiagnosticEventName;
  readonly surface: DiagnosticSurface;
  readonly code?: PublicErrorCode;
  readonly messageId?: PublicMessageId;
  readonly category?: PublicErrorCategory;
  readonly severity?: PublicErrorSeverity;
  readonly recoveryAction?: PublicRecoveryAction;
  readonly outcome?: "accepted" | "refused" | "unknown";
  readonly sessionState?: "active" | "locked";
  readonly consoleLevel?: "warn" | "error";
}

export interface SanitizedDiagnosticReport {
  readonly schemaVersion: 1;
  readonly localOnly: true;
  readonly generatedAt: string;
  readonly eventCount: number;
  readonly truncated: boolean;
  readonly events: readonly SafeDiagnosticEvent[];
}

/** Runtime-owned, local-only diagnostics capability exposed to composition and recovery UI. */
export interface DiagnosticJournal {
  recordEvent(input: ClosedDiagnosticInput): void;
  recordFailure(
    input: Omit<SafeDiagnosticInput, "error" | "publicError">,
    error: unknown
  ): void;
  snapshot(): readonly SafeDiagnosticEvent[];
  createReport(now?: Date): SanitizedDiagnosticReport;
  exportJson(now?: Date): string;
  clear(): void;
}

const MAX_EVENTS = 200;
const MAX_REPORT_BYTES = 64 * 1024;

/**
 * Bounded process-local diagnostics. The public API accepts only a closed set
 * of enum-like metadata; raw messages, stacks, paths, payloads, and values are
 * never retained. `error` is classified and discarded synchronously.
 */
export class LocalDiagnosticJournal implements DiagnosticJournal {
  #events: SafeDiagnosticEvent[] = [];
  #sequence = 0;
  readonly #startedAt = Date.now();

  private record(input: SafeDiagnosticInput): void {
    const publicError = input.publicError ?? classifyUnknownFailure(input.error);
    const event: SafeDiagnosticEvent = Object.freeze({
      sequence: ++this.#sequence,
      elapsedMilliseconds: Math.max(0, Date.now() - this.#startedAt),
      name: input.name,
      surface: input.surface,
      ...(publicError ? {
        code: publicError.code,
        messageId: publicError.messageId,
        category: publicError.category,
        severity: publicError.severity
      } : {}),
      ...(input.recoveryAction ? { recoveryAction: input.recoveryAction } : {}),
      ...(input.outcome ? { outcome: input.outcome } : {}),
      ...(input.sessionState ? { sessionState: input.sessionState } : {}),
      ...(input.consoleLevel ? { consoleLevel: input.consoleLevel } : {})
    });
    this.#events.push(event);
    if (this.#events.length > MAX_EVENTS) this.#events.splice(0, this.#events.length - MAX_EVENTS);
  }

  recordEvent(input: ClosedDiagnosticInput): void {
    this.record(input);
  }

  recordFailure(input: Omit<SafeDiagnosticInput, "error" | "publicError">, error: unknown): void {
    this.record({ ...input, error });
  }

  snapshot(): readonly SafeDiagnosticEvent[] {
    return Object.freeze(this.#events.map((event) => Object.freeze({ ...event })));
  }

  createReport(now = new Date()): SanitizedDiagnosticReport {
    let events = [...this.#events];
    let truncated = this.#sequence > events.length;
    let report = buildReport(now, events, truncated);
    while (serializedReportBytes(report) > MAX_REPORT_BYTES && events.length > 0) {
      events.shift();
      truncated = true;
      report = buildReport(now, events, truncated);
    }
    return Object.freeze(report);
  }

  exportJson(now = new Date()): string {
    return `${JSON.stringify(this.createReport(now), null, 2)}\n`;
  }

  clear(): void {
    this.#events = [];
  }
}

function classifyUnknownFailure(error: unknown): PublicError | undefined {
  try {
    if (isPublicError(error)) return error;
    if (isRecord(error) && isPublicError(error.publicError)) return error.publicError;
    return error === undefined ? undefined : createPublicError("internal");
  } catch {
    return createPublicError("internal");
  }
}

function buildReport(
  now: Date,
  events: readonly SafeDiagnosticEvent[],
  truncated: boolean
): SanitizedDiagnosticReport {
  return {
    schemaVersion: 1,
    localOnly: true,
    generatedAt: Number.isFinite(now.getTime()) ? now.toISOString() : new Date(0).toISOString(),
    eventCount: events.length,
    truncated,
    events: Object.freeze(events.map((event) => Object.freeze({ ...event })))
  };
}

function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function serializedReportBytes(report: SanitizedDiagnosticReport): number {
  return utf8ByteLength(`${JSON.stringify(report, null, 2)}\n`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
