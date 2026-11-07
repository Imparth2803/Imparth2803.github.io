import {UserError} from "../text/userError";
import {Handlers, Transfer, WorkerRequest, WorkerResponse} from "./protocol";

const GENERIC_ERROR =
  "Something went wrong while working on this. The file may be damaged or in an unexpected format. Try saving it again, or paste the text instead.";
const MEMORY_ERROR =
  "This is too large for your device to handle in the browser. Try a smaller file, or split it into parts.";

/* Runs inside a worker: answers each request with the matching handler.
   Messages for people come only from UserError; anything unexpected gets a
   generic plain-language message (details go to the browser console). */
export function serve(handlers: Handlers): void {
  const scope = globalThis as unknown as DedicatedWorkerGlobalScope;
  scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const {id, method, payload} = event.data;
    let response: WorkerResponse;
    let transfer: Transferable[] = [];
    try {
      const handler = handlers[method];
      if (!handler) throw new Error(`Unknown worker method: ${method}`);
      let result = await handler(payload);
      if (result instanceof Transfer) {
        transfer = result.transfer;
        result = result.value;
      }
      response = {id, ok: true, result};
    } catch (error) {
      if (!(error instanceof UserError)) console.error(error);
      response = {id, ok: false, message: messageFor(error)};
    }
    scope.postMessage(response, transfer);
  };
}

function messageFor(error: unknown): string {
  if (error instanceof UserError) return error.message;
  if (
    error instanceof RangeError ||
    (error instanceof Error &&
      /out of memory|allocation failed/i.test(error.message))
  ) {
    return MEMORY_ERROR;
  }
  return GENERIC_ERROR;
}
