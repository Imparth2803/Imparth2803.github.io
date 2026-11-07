import type {Handlers, Received} from "./protocol";
import {CancelledError, WorkerClient} from "./WorkerClient";

interface Job {
  method: string;
  payload: unknown;
  weight: number;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

/* Several workers sharing a queue, for batches (one image per worker at a
   time). Each job has a weight (megapixels for images); jobs start only
   while the total weight in progress stays within the budget, so a batch of
   huge photos can't exhaust the device's memory. A job heavier than the
   whole budget still runs, on its own. */
export class WorkerPool<H extends Handlers> {
  private readonly clients: WorkerClient<H>[];
  private readonly idle: WorkerClient<H>[];
  private queue: Job[] = [];
  private inFlight = 0;
  private running = 0;

  constructor(
    create: () => Worker,
    size: number,
    private readonly budget: number
  ) {
    this.clients = Array.from(
      {length: Math.max(1, size)},
      () => new WorkerClient<H>(create)
    );
    this.idle = [...this.clients];
  }

  run<K extends keyof H & string>(
    method: K,
    payload: Parameters<H[K]>[0],
    weight = 0
  ): Promise<Received<Awaited<ReturnType<H[K]>>>> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        method,
        payload,
        weight,
        resolve: resolve as (v: unknown) => void,
        reject
      });
      this.next();
    });
  }

  /* Starts all the workers ahead of a batch (starting several at the
     moment the batch begins would briefly hold up the page). */
  warmUp(): void {
    this.clients.forEach(client => client.warmUp());
  }

  /* Stops everything: running jobs and anything still queued. */
  cancel(): void {
    const queued = this.queue;
    this.queue = [];
    queued.forEach(job => job.reject(new CancelledError("Stopped")));
    this.clients.forEach(client => client.cancel());
  }

  dispose(): void {
    this.cancel();
    this.clients.forEach(client => client.dispose());
  }

  private next(): void {
    while (this.queue.length > 0 && this.idle.length > 0) {
      const job = this.queue[0]!;
      if (this.running > 0 && this.inFlight + job.weight > this.budget) return;
      this.queue.shift();
      const client = this.idle.pop()!;
      this.inFlight += job.weight;
      this.running++;
      client
        .call(job.method, job.payload as never)
        .then(job.resolve, job.reject)
        .finally(() => {
          this.inFlight -= job.weight;
          this.running--;
          this.idle.push(client);
          this.next();
        });
    }
  }
}

/* Workers to use for a batch: leave one core for the page, at most four. */
export function poolSize(): number {
  const cores =
    typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 2 : 2;
  return Math.min(4, Math.max(1, cores - 1));
}
