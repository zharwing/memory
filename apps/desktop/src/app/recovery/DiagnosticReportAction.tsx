import { useState } from "react";
import { useDiagnosticJournal } from "./DiagnosticJournalContext.js";

export function DiagnosticReportAction() {
  const diagnostics = useDiagnosticJournal();
  const [status, setStatus] = useState<"idle" | "exported" | "failed">("idle");

  function exportReport() {
    try {
      const report = diagnostics.exportJson();
      const blob = new Blob([report], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "zharwing-memory-diagnostics.json";
      link.rel = "noopener";
      link.click();
      URL.revokeObjectURL(url);
      setStatus("exported");
    } catch {
      diagnostics.recordEvent({
        name: "recovery.failed",
        surface: "runtime",
        outcome: "refused"
      });
      setStatus("failed");
    }
  }

  return (
    <span className="diagnostic-report-action">
      <button type="button" onClick={exportReport}>Download safe diagnostic report</button>
      <span
        className={status === "failed" ? "panel-help" : "sr-only"}
        role="status"
        aria-live="polite"
      >
        {status === "exported"
          ? "Safe diagnostic report downloaded."
          : status === "failed"
            ? "The diagnostic report could not be downloaded."
            : ""}
      </span>
    </span>
  );
}
