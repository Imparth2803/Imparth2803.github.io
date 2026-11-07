import {useCallback, useEffect, useRef, useState} from "react";
import {CancelledError, ToolError} from "../worker/WorkerClient";

export type ItemState<R> =
  | {status: "waiting"}
  | {status: "done"; result: R}
  | {status: "failed"; message: string};

/* Runs one job per item (in parallel, through a worker pool) and tracks each
   item's outcome. One failure never stops the others. */
export function useBatch<T extends {id: number}, R>() {
  const [states, setStates] = useState<Map<number, ItemState<R>>>(new Map());
  const [running, setRunning] = useState(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    []
  );

  const run = useCallback(
    async (items: readonly T[], work: (item: T) => Promise<R>) => {
      setRunning(true);
      setStates(new Map(items.map(item => [item.id, {status: "waiting"}])));
      await Promise.all(
        items.map(item =>
          work(item).then(
            result =>
              mounted.current &&
              setStates(s => new Map(s).set(item.id, {status: "done", result})),
            error => {
              if (!mounted.current || error instanceof CancelledError) return;
              if (!(error instanceof ToolError)) console.error(error);
              const message =
                error instanceof ToolError
                  ? error.message
                  : "Something went wrong with this image. Please try again.";
              setStates(s =>
                new Map(s).set(item.id, {status: "failed", message})
              );
            }
          )
        )
      );
      if (mounted.current) setRunning(false);
    },
    []
  );

  /* Updates one item's result (e.g. after redoing it with other settings). */
  const update = useCallback((id: number, state: ItemState<R>) => {
    setStates(s => new Map(s).set(id, state));
  }, []);

  const clear = useCallback(() => setStates(new Map()), []);

  let done = 0;
  let failed = 0;
  states.forEach(state => {
    if (state.status === "done") done++;
    if (state.status === "failed") failed++;
  });

  return {
    states,
    running,
    run,
    update,
    clear,
    done,
    failed,
    total: states.size
  };
}
