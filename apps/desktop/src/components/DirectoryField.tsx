import { useId, useState } from "react";
import { canPickDirectory, pickDirectory } from "../utils/folder-picker.js";

export function DirectoryField({ value, onChange, placeholder, required, id, name, describedBy, invalid }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  id?: string;
  name?: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  const [pickerAvailable] = useState(() => canPickDirectory());
  const [pickerFailed, setPickerFailed] = useState(false);
  const capabilityHelpId = useId();
  const pickerErrorId = useId();
  const inputDescription = [
    describedBy,
    !pickerAvailable ? capabilityHelpId : undefined,
    pickerFailed ? pickerErrorId : undefined
  ].filter(Boolean).join(" ") || undefined;

  async function chooseDirectory() {
    setPickerFailed(false);
    try {
      const selected = await pickDirectory();
      if (selected) onChange(selected);
    } catch {
      setPickerFailed(true);
    }
  }

  return (
    <div>
      <div className="path-input-row">
        <input
          id={id}
          name={name}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required={required}
          aria-describedby={inputDescription}
          aria-invalid={invalid || undefined}
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          disabled={!pickerAvailable}
          onClick={() => void chooseDirectory()}
          title={pickerAvailable ? "Choose folder" : "Open the Tauri desktop app to browse folders"}
        >
          Browse
        </button>
      </div>
      {!pickerAvailable ? (
        <p id={capabilityHelpId} className="field-help">Browser mode cannot browse arbitrary local folders. Paste or type the absolute path, or use the desktop app for folder picking.</p>
      ) : null}
      {pickerFailed ? <p id={pickerErrorId} className="field-error" role="status">The folder picker did not open. Type or paste the path instead.</p> : null}
    </div>
  );
}
