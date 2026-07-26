/**
 * Documents + link-candidates progress block for a running AI relationship
 * review. Rendered by DocsScreen in both the banner and the link-discovery
 * dialog (previously two byte-identical copies).
 */
export function SemanticRunProgress({
  documentsProcessed,
  documentsTotal,
  candidatesJudged,
  candidatesTotal,
  className,
  ariaLabel
}: {
  documentsProcessed: number;
  documentsTotal: number;
  candidatesJudged: number;
  candidatesTotal: number;
  className: string;
  ariaLabel?: string;
}) {
  return (
    <div className={className} aria-label={ariaLabel}>
      <ProgressMeter
        label="Documents"
        value={documentsProcessed}
        total={documentsTotal}
      />
      {candidatesTotal > 0 ? (
        <ProgressMeter
          label="Link candidates"
          value={candidatesJudged}
          total={candidatesTotal}
        />
      ) : (
        <div className="semantic-progress-row muted">
          <span>Link candidates</span>
          <strong>Preparing</strong>
        </div>
      )}
    </div>
  );
}

export function ProgressMeter({ label, value, total }: { label: string; value: number; total: number }) {
  const boundedTotal = Math.max(0, Number(total || 0));
  const boundedValue = boundedTotal > 0
    ? Math.min(boundedTotal, Math.max(0, Number(value || 0)))
    : Math.max(0, Number(value || 0));
  const percent = boundedTotal > 0 ? Math.round((boundedValue / boundedTotal) * 100) : 0;

  return (
    <div className="semantic-progress-row">
      <div>
        <span>{label}</span>
        <strong>{boundedTotal > 0 ? `${boundedValue} of ${boundedTotal}` : `${boundedValue}`}</strong>
      </div>
      <div
        className="semantic-progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={boundedTotal || undefined}
        aria-valuenow={boundedTotal ? boundedValue : undefined}
      >
        <i style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
