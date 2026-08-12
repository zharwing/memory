import { useEffect, useRef } from "react";
import type { PublicError } from "@zharwing/memory-core";
import { publicMessageCopy } from "./public-error-copy.js";

export function FormErrorSummary({
  error,
  fieldLabels = {},
  onFocusField
}: {
  readonly error?: PublicError;
  readonly fieldLabels?: Readonly<Record<string, string>>;
  readonly onFocusField?: (field: string) => void;
}) {
  const summary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) summary.current?.focus();
  }, [error?.code, error?.messageId]);
  if (!error) return null;
  const fields = Object.entries(error.fieldErrors ?? {});
  return (
    <div className="notice danger" role="alert" tabIndex={-1} ref={summary}>
      <strong>{publicMessageCopy(error.messageId)}</strong>
      {fields.length ? (
        <ul>
          {fields.map(([field, messageId]) => (
            <li key={field}>
              <button type="button" onClick={() => onFocusField?.(field)}>
                {fieldLabels[field] ?? "Field"}: {publicMessageCopy(messageId)}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
