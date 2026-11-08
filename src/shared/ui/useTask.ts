import {useCallback, useEffect, useRef, useState} from "react";
import {CancelledError, ToolError} from "../worker/WorkerClient";
import {track} from "../usage";

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
      const started = performance.now();
      const finished = (outcome: string) =>
        track("task", {outcome, ms: Math.round(performance.now() - started)});
      try {
        const result = await work();
        finished("ok");
        return result;
      } catch (e) {
        finished(e instanceof CancelledError ? "cancelled" : "error");
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
