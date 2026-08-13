import { createContext, useContext, type ReactNode } from "react";
import type { DiagnosticJournal } from "../../platform/diagnostics/diagnostic-journal.js";

const DiagnosticJournalContext = createContext<DiagnosticJournal | null>(null);

export function DiagnosticJournalProvider({
  children,
  journal
}: {
  readonly children: ReactNode;
  readonly journal: DiagnosticJournal;
}) {
  return (
    <DiagnosticJournalContext.Provider value={journal}>
      {children}
    </DiagnosticJournalContext.Provider>
  );
}

export function useDiagnosticJournal(): DiagnosticJournal {
  const journal = useContext(DiagnosticJournalContext);
  if (!journal) throw new Error("DiagnosticJournalProvider is missing.");
  return journal;
}
