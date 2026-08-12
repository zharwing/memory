import type {
  DiagnosticEvent,
  DiagnosticSink
} from "../../app/composition/ports.js";
import { localDiagnostics } from "./diagnostic-journal.js";

const MAX_DIAGNOSTIC_EVENTS = 200;

/** Compatibility sink backed by the same bounded, sanitized local journal. */
export class InMemoryDiagnosticSink implements DiagnosticSink {
  #events: DiagnosticEvent[] = [];

  record(event: DiagnosticEvent): void {
    // Preserve the compatibility snapshot without retaining correlation IDs;
    // callers may have supplied an untrusted value despite its string type.
    const safeEvent: DiagnosticEvent = Object.freeze({
      name: event.name,
      ...(event.sessionState ? { sessionState: event.sessionState } : {}),
      ...(event.lockReason ? { lockReason: event.lockReason } : {})
    });
    this.#events.push(safeEvent);
    if (this.#events.length > MAX_DIAGNOSTIC_EVENTS) this.#events.shift();
    if (event.name === "browser.session.state") {
      localDiagnostics.recordEvent({
        name: "browser.session.state",
        surface: "session",
        sessionState: event.sessionState
      });
      return;
    }
    if (event.name === "runtime.created" || event.name === "runtime.disposed") {
      localDiagnostics.recordEvent({ name: event.name, surface: "runtime" });
      return;
    }
    if (event.name === "contract.failure") {
      localDiagnostics.recordFailure({ name: "failure.caught", surface: "runtime" }, true);
    }
  }

  snapshot(): readonly DiagnosticEvent[] {
    return Object.freeze(this.#events.map((event) => Object.freeze({ ...event })));
  }

  clear(): void {
    this.#events = [];
    localDiagnostics.clear();
  }
}
