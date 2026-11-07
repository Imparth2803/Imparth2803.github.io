import {useEffect, useState} from "react";
import type {Handlers} from "../worker/protocol";
import {poolSize, WorkerPool} from "../worker/WorkerPool";

/* A pool of workers for one tool page, shut down when the page closes. */
export function useWorkerPool<H extends Handlers>(
  create: () => Worker,
  budget: number
): WorkerPool<H> {
  const [pool] = useState(() => new WorkerPool<H>(create, poolSize(), budget));
  useEffect(() => () => pool.dispose(), [pool]);
  return pool;
}
