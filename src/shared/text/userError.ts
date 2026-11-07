/* An error whose message is written for the person using the tool: what went
   wrong and what to do next, in plain words. Anything else is reported with
   a generic message (see shared/worker/serve.ts). */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UserError";
  }
}
