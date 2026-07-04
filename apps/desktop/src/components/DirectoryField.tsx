import { useEffect, useState } from "react";
import { canPickDirectory, pickDirectory } from "../utils/folder-picker.js";

export function DirectoryField({ value, onChange, placeholder, required }: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
}) {
  const [pickerAvailable, setPickerAvailable] = useState(false);

  useEffect(() => {
    setPickerAvailable(canPickDirectory());
  }, []);

  async function chooseDirectory() {
    const selected = await pickDirectory();
    if (selected) onChange(selected);
  }

  return (
    <div>
      <div className="path-input-row">
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} />
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
        <p className="field-help">Browser mode cannot browse arbitrary local folders. Paste or type the absolute path, or use the desktop app for folder picking.</p>
      ) : null}
    </div>
  );
}
