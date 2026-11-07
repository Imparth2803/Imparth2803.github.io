import {useCallback, useEffect, useRef, useState} from "react";
import {CancelledError, ToolError} from "../worker/WorkerClient";

/* Runs one piece of work at a time and tracks its state for the page:
   what is running (for the busy label) and the last error message. */
export function useTask() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const run = useCallback(
    async <T>(label: string, work: () => Promise<T>, fallback?: string) => {
      setBusy(label);
      setError(null);
      try {
        return await work();
      } catch (e) {
        if (!mounted.current || e instanceof CancelledError) return undefined;
        if (!(e instanceof ToolError)) console.error(e);
        setError(
          e instanceof ToolError
            ? e.message
            : fallback ?? "Something went wrong. Please try again."
        );
        return undefined;
      } finally {
        if (mounted.current) setBusy(null);
      }
    },
    []
  );

  return {busy, error, setError, run};
}
