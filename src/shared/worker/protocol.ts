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
