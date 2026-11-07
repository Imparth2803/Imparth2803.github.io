import type {Handlers, WorkerRequest, WorkerResponse} from "./protocol";

/* An error to show as-is: it already carries a plain-language message. */
export class ToolError extends Error {}

/* Thrown for requests that were stopped with cancel(). */
export class CancelledError extends Error {}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/* Talks to one tool's worker. The worker starts on first use; cancel() stops
   whatever it is doing by shutting it down (a fresh one starts next time). */
export class WorkerClient<H extends Handlers> {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  constructor(private readonly create: () => Worker) {}

  call<K extends keyof H & string>(
    method: K,
    payload: Parameters<H[K]>[0]
  ): Promise<Awaited<ReturnType<H[K]>>> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, {resolve: resolve as (v: unknown) => void, reject});
      const request: WorkerRequest = {id, method, payload};
      worker.postMessage(request);
    });
  }

  cancel(): void {
    this.shutDown(new CancelledError("Stopped"));
  }

  /* Starts the worker now, so the first real job doesn't wait for it. */
  warmUp(): void {
    this.ensureWorker();
  }

  dispose(): void {
    this.shutDown(new CancelledError("Closed"));
  }

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = this.create();
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      if (response.ok) pending.resolve(response.result);
      else pending.reject(new ToolError(response.message));
    };
    worker.onerror = event => {
      event.preventDefault();
      this.shutDown(
        new ToolError(
          "The tool stopped unexpectedly. Reload the page and try again. If it happens again, try a smaller file."
        )
      );
    };
    this.worker = worker;
    return worker;
  }

  private shutDown(reason: Error): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach(p => p.reject(reason));
    this.pending.clear();
  }
}
