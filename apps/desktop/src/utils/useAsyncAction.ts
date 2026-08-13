import { useRef, useState } from "react";

/**
 * Owns the local pending guard shared by forms whose domain store already
 * records public operation failures. Repeated submissions are ignored until
 * the active action settles, and callers keep ownership of draft reset rules.
 */
export function useAsyncAction() {
  const active = useRef(false);
  const [pending, setPending] = useState(false);

  async function run<Result>(action: () => Promise<Result>): Promise<Result | undefined> {
    if (active.current) return undefined;
    active.current = true;
    setPending(true);
    try {
      return await action();
    } catch {
      // Domain operation ledgers own public failure state and recovery copy.
      return undefined;
    } finally {
      active.current = false;
      setPending(false);
    }
  }

  return { pending, run } as const;
}
