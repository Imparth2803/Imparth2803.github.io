import {useEffect, useState} from "react";
import type {InspectResult} from "../tabular/inspect";
import type {ReadOptions, Source} from "../tabular/source";
import {CancelledError, ToolError} from "../worker/WorkerClient";

export type InspectState =
  | {status: "empty"}
  | {status: "reading"}
  | {status: "ready"; result: InspectResult}
  | {status: "error"; message: string};

export type InspectFn = (payload: {
  source: Source;
  read: ReadOptions;
}) => Promise<InspectResult>;

/* Reads the sheets and columns of the current input in the worker
   (`inspect` must keep the same identity between renders), so the
   page can offer sheet and column choices. Pasted text is read after a short
   pause in typing. */
export function useInspect(
  inspect: InspectFn,
  source: Source | null,
  read: ReadOptions
): InspectState {
  const {split, maxRows, encoding, excelDates} = read;
  const [state, setState] = useState<InspectState>({status: "empty"});
  useEffect(() => {
    if (!source) {
      setState({status: "empty"});
      return;
    }
    let current = true;
    const timer = setTimeout(
      () => {
        setState({status: "reading"});
        inspect({source, read: {split, maxRows, encoding, excelDates}}).then(
          result => current && setState({status: "ready", result}),
          error => {
            if (!current || error instanceof CancelledError) return;
            setState({
              status: "error",
              message:
                error instanceof ToolError
                  ? error.message
                  : "This couldn't be read. Please try again."
            });
          }
        );
      },
      source.kind === "text" ? 300 : 0
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [inspect, source, split, maxRows, encoding, excelDates]);
  return state;
}
