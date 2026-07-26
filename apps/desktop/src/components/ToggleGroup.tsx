import type { ReactNode } from "react";

/**
 * Selected-button-group idiom shared by `.option-chips`,
 * `.segmented-control`, and `.quick-presets`. Pass the existing container
 * class via `className` so each site keeps its current look. `value` may be
 * an array for multi-select (chips that toggle).
 */
export function ToggleGroup({
  value,
  onChange,
  options,
  className,
  ariaLabel,
  role
}: {
  value: string | string[];
  onChange: (value: string) => void;
  options: Array<{ value: string; label: ReactNode }>;
  className: string;
  ariaLabel?: string;
  role?: string;
}) {
  const isSelected = (optionValue: string) =>
    Array.isArray(value) ? value.includes(optionValue) : value === optionValue;

  return (
    <div className={className} role={role} aria-label={ariaLabel}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={isSelected(option.value) ? "selected" : ""}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
