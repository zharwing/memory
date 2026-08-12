import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Icon-only control with a mandatory accessible name and touch target. */
export function IconButton({ label, children, className, ...props }: {
  label: string;
  children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label">) {
  return (
    <button
      {...props}
      type={props.type ?? "button"}
      className={["icon-button", className].filter(Boolean).join(" ")}
      aria-label={label}
      title={props.title ?? label}
    >
      <span aria-hidden="true">{children}</span>
    </button>
  );
}
