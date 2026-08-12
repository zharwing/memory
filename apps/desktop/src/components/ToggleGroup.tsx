import { type KeyboardEvent, type ReactNode, useRef } from "react";

type ToggleRole = "group" | "radiogroup" | "tablist";

/** Selected-control primitive with explicit state and composite keyboard behavior. */
export function ToggleGroup({
  value,
  onChange,
  options,
  className,
  ariaLabel,
  role = Array.isArray(value) ? "group" : "radiogroup"
}: {
  value: string | string[];
  onChange: (value: string) => void;
  options: Array<{ value: string; label: ReactNode; disabled?: boolean }>;
  className: string;
  ariaLabel: string;
  role?: ToggleRole;
}) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const isSelected = (optionValue: string) =>
    Array.isArray(value) ? value.includes(optionValue) : value === optionValue;
  const composite = role === "radiogroup" || role === "tablist";
  const anySelected = options.some((option) => isSelected(option.value));
  const firstEnabledIndex = Math.max(0, options.findIndex((option) => !option.disabled));

  function handleCompositeKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!composite || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const enabled = options.map((option, optionIndex) => option.disabled ? -1 : optionIndex).filter((item) => item >= 0);
    if (!enabled.length) return;
    const currentPosition = Math.max(0, enabled.indexOf(index));
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const nextPosition = event.key === "Home"
      ? 0
      : event.key === "End"
        ? enabled.length - 1
        : (currentPosition + (forward ? 1 : -1) + enabled.length) % enabled.length;
    const nextIndex = enabled[nextPosition];
    buttonRefs.current[nextIndex]?.focus();
    onChange(options[nextIndex].value);
  }

  return (
    <div className={className} role={role} aria-label={ariaLabel}>
      {options.map((option, index) => {
        const selected = isSelected(option.value);
        const semanticProps: {
          role?: "tab" | "radio";
          "aria-selected"?: boolean;
          "aria-checked"?: boolean;
          "aria-pressed"?: boolean;
          tabIndex?: number;
        } = role === "tablist"
          ? { role: "tab", "aria-selected": selected, tabIndex: selected || (!anySelected && index === firstEnabledIndex) ? 0 : -1 }
          : role === "radiogroup"
            ? { role: "radio", "aria-checked": selected, tabIndex: selected || (!anySelected && index === firstEnabledIndex) ? 0 : -1 }
            : { "aria-pressed": selected };
        return (
          <button
            key={option.value}
            ref={(element) => { buttonRefs.current[index] = element; }}
            type="button"
            className={selected ? "selected" : ""}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleCompositeKey(event, index)}
            {...semanticProps}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
