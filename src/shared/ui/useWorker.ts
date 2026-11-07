import {useEffect, useState} from "react";
import type {Handlers} from "../worker/protocol";
import {WorkerClient} from "../worker/WorkerClient";

/* One worker per open tool page, shut down when the page closes. */
export function useWorker<H extends Handlers>(
  create: () => Worker
): WorkerClient<H> {
  const [client] = useState(() => new WorkerClient<H>(create));
  useEffect(() => () => client.dispose(), [client]);
  return client;
}
