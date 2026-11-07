/* Messages between a tool page and its background worker. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Handlers = Record<string, (payload: any) => unknown>;

export interface WorkerRequest {
  id: number;
  method: string;
  payload: unknown;
}

export type WorkerResponse =
  | {id: number; ok: true; result: unknown}
  | {id: number; ok: false; message: string};

/* A worker result whose large parts (such as an ImageBitmap) are handed
   over to the page instead of copied. */
export class Transfer<T> {
  constructor(readonly value: T, readonly transfer: Transferable[]) {}
}

/** What the page receives for a handler's return value. */
export type Received<R> = R extends Transfer<infer T> ? T : R;
