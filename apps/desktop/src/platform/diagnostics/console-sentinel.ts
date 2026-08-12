import { localDiagnostics, type LocalDiagnosticJournal } from "./diagnostic-journal.js";

export interface ConsoleSentinel {
  dispose(): void;
}

/**
 * Production-only sentinel for unexpected dependency output. Arguments are
 * deliberately neither forwarded nor inspected: they may contain provider
 * text, paths, tokens, or private memory content. Detection stays local.
 */
export function installProductionConsoleSentinel(
  enabled: boolean,
  journal: LocalDiagnosticJournal = localDiagnostics
): ConsoleSentinel {
  if (!enabled || typeof console === "undefined") return { dispose: () => undefined };
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = () => {
    journal.recordEvent({
      name: "dependency.console.output",
      surface: "dependency",
      consoleLevel: "warn"
    });
  };
  console.error = () => {
    journal.recordEvent({
      name: "dependency.console.output",
      surface: "dependency",
      consoleLevel: "error"
    });
  };
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      console.warn = originalWarn;
      console.error = originalError;
    }
  };
}
