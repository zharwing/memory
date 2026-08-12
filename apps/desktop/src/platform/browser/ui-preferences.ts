import type { UiPreferenceStore } from "../../app/composition/ports.js";

export class BrowserUiPreferences implements UiPreferenceStore {
  constructor(private readonly prefix = "zharwing-memory:") {}

  get(key: string): string | undefined {
    try {
      return globalThis.localStorage?.getItem(`${this.prefix}${key}`) ?? undefined;
    } catch {
      return undefined;
    }
  }

  set(key: string, value: string | undefined): void {
    try {
      if (value === undefined) globalThis.localStorage?.removeItem(`${this.prefix}${key}`);
      else globalThis.localStorage?.setItem(`${this.prefix}${key}`, value);
    } catch {
      // Preferences are optional; private browsing/storage denial stays local.
    }
  }
}
