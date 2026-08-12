import {
  cloneElement,
  isValidElement,
  type InputHTMLAttributes,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  useEffect,
  useId,
  useRef
} from "react";

interface FieldProps {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactElement<Record<string, unknown>>;
}

/** Label/help/error association owner for custom form controls. */
export function Field({ label, help, error, required, className, children }: FieldProps) {
  const generatedId = useId();
  const childId = typeof children.props.id === "string" ? children.props.id : generatedId;
  const helpId = help ? `${childId}-help` : undefined;
  const errorId = error ? `${childId}-error` : undefined;
  const describedBy = [
    typeof children.props["aria-describedby"] === "string" ? children.props["aria-describedby"] : undefined,
    helpId,
    errorId
  ].filter(Boolean).join(" ") || undefined;
  const control = cloneElement(children, {
    id: childId,
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
    "aria-required": required || undefined,
    required: required || children.props.required
  });

  return (
    <div className={["field", className].filter(Boolean).join(" ")}>
      <label className="field-label" htmlFor={childId}>
        {label}
        {required ? <span className="field-required" aria-hidden="true"> *</span> : null}
      </label>
      {control}
      {help ? <div id={helpId} className="field-help">{help}</div> : null}
      {error ? <div id={errorId} className="field-error">{error}</div> : null}
    </div>
  );
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "children"> {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  fieldClassName?: string;
}

export function TextField({ label, help, error, fieldClassName, required, ...inputProps }: TextFieldProps) {
  return (
    <Field label={label} help={help} error={error} required={required} className={fieldClassName}>
      <input {...inputProps} />
    </Field>
  );
}

interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label: ReactNode;
  help?: ReactNode;
  error?: ReactNode;
  fieldClassName?: string;
  children: ReactNode;
}

export function SelectField({ label, help, error, fieldClassName, required, children, ...selectProps }: SelectFieldProps) {
  return (
    <Field label={label} help={help} error={error} required={required} className={fieldClassName}>
      <select {...selectProps}>{children}</select>
    </Field>
  );
}

export interface FormError {
  id?: string;
  message: ReactNode;
}

/** Focusable, announced form error summary; values remain owned by the form. */
export function ErrorSummary({ title = "Please correct the following", errors }: {
  title?: string;
  errors: FormError[];
}) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const signature = errors.map((error) => `${error.id ?? "form"}:${String(error.message)}`).join("|");
  useEffect(() => {
    if (errors.length) ref.current?.focus();
  }, [errors.length, signature]);
  if (!errors.length) return null;
  return (
    <div ref={ref} className="error-summary" aria-labelledby={titleId} tabIndex={-1}>
      <h2 id={titleId} className="error-summary-title">{title}</h2>
      <ul>
        {errors.map((error, index) => (
          <li key={`${error.id ?? "form"}-${index}`}>
            {error.id ? <a href={`#${error.id}`}>{error.message}</a> : error.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function isFormControl(element: ReactNode): element is ReactElement<Record<string, unknown>> {
  return isValidElement(element);
}
