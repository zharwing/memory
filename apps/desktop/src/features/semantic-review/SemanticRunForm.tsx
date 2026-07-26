import type { SemanticRunDraft } from "./useSemanticRunDraft.js";

/**
 * Shared advanced-settings fields for AI relationship runs. Each field key
 * has sensible defaults (type, min/step, label); screens override the copy
 * and placeholders so their existing wording stays byte-identical.
 */

export type SemanticRunFieldKey = keyof SemanticRunDraft;

export interface SemanticRunFieldSpec {
  key: SemanticRunFieldKey;
  label?: string;
  placeholder?: string;
  /** Adds the `semantic-run-wide` class (spans two grid columns). */
  wide?: boolean;
  options?: Array<{ value: string; label: string }>;
}

interface FieldDefaults {
  label: string;
  input: "text" | "password" | "number" | "select" | "checkbox";
  min?: string;
  step?: string;
  options?: Array<{ value: string; label: string }>;
}

const FIELD_DEFAULTS: Record<SemanticRunFieldKey, FieldDefaults> = {
  mode: {
    label: "Mode",
    input: "select",
    options: [
      { value: "review", label: "Review" },
      { value: "dry-run", label: "Dry run" },
      { value: "auto", label: "Auto" }
    ]
  },
  endpoint: { label: "Endpoint override", input: "text" },
  model: { label: "Model override", input: "text" },
  apiKey: { label: "API key", input: "password" },
  maxDocuments: { label: "Max docs", input: "number", min: "1", step: "1" },
  maxCandidates: { label: "Max candidates", input: "number", min: "1", step: "1" },
  maxCandidatesPerDocument: { label: "Per doc", input: "number", min: "1", step: "1" },
  timeoutSeconds: { label: "Timeout (sec)", input: "number", min: "1", step: "1" },
  maxOutputTokens: { label: "Output tokens", input: "number", min: "128", step: "128" },
  jsonMode: { label: "Use strict JSON responses when supported.", input: "checkbox" }
};

function stringFieldPatch(key: SemanticRunFieldKey, value: string): Partial<SemanticRunDraft> {
  return { [key]: value } as unknown as Partial<SemanticRunDraft>;
}

export interface SemanticRunFieldProps {
  field: SemanticRunFieldSpec;
  draft: SemanticRunDraft;
  disabled?: boolean;
  onPatch: (patch: Partial<SemanticRunDraft>) => void;
}

export function SemanticRunField({ field, draft, disabled, onPatch }: SemanticRunFieldProps) {
  const defaults = FIELD_DEFAULTS[field.key];
  const label = field.label ?? defaults.label;

  if (defaults.input === "checkbox") {
    return (
      <label className="checkbox-row semantic-json-mode">
        <input
          type="checkbox"
          checked={Boolean(draft.jsonMode)}
          disabled={disabled}
          onChange={(event) => onPatch({ jsonMode: event.target.checked })}
        />
        <span>{label}</span>
      </label>
    );
  }

  if (defaults.input === "select") {
    const options = field.options ?? defaults.options ?? [];
    return (
      <label className={field.wide ? "semantic-run-wide" : undefined}>
        <span>{label}</span>
        <select
          value={String(draft[field.key])}
          disabled={disabled}
          onChange={(event) => onPatch(stringFieldPatch(field.key, event.target.value))}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className={field.wide ? "semantic-run-wide" : undefined}>
      <span>{label}</span>
      <input
        type={defaults.input}
        min={defaults.min}
        step={defaults.step}
        value={String(draft[field.key])}
        disabled={disabled}
        onChange={(event) => onPatch(stringFieldPatch(field.key, event.target.value))}
        placeholder={field.placeholder}
      />
    </label>
  );
}

export interface SemanticRunFormProps {
  fields: SemanticRunFieldSpec[];
  draft: SemanticRunDraft;
  disabled?: boolean;
  onPatch: (patch: Partial<SemanticRunDraft>) => void;
  /** Extra classes appended to `semantic-run-form`, e.g. `semantic-run-form-basic`. */
  className?: string;
}

export function SemanticRunForm({ fields, draft, disabled, onPatch, className }: SemanticRunFormProps) {
  return (
    <div className={className ? `semantic-run-form ${className}` : "semantic-run-form"}>
      {fields.map((field) => (
        <SemanticRunField key={field.key} field={field} draft={draft} disabled={disabled} onPatch={onPatch} />
      ))}
    </div>
  );
}
