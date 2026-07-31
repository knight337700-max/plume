import type { Job } from "bullmq";
import { COMMAND_QUEUE_ROUTES, QUEUE_NAMES, type QueueName } from "../../../packages/core/src/async/queue-routing.js";
import type { QueueHandler } from "../../../packages/infrastructure/src/queue/bullmq.js";
import type { WorkerHandlerRegistration } from "./bootstrap.js";

export type RuntimeJobHandler = (job: Job<unknown>) => Promise<unknown>;

export class PermanentJobError extends Error {
  readonly retryable = false;

  constructor(message: string) {
    super(message);
    this.name = "PermanentJobError";
  }
}

export const RUNTIME_JOB_TYPES = Object.freeze([
  ...Object.keys(COMMAND_QUEUE_ROUTES),
  "dead-letter",
]);

export interface RuntimeHandlerRegistry {
  readonly registrations: readonly WorkerHandlerRegistration[];
  readonly missingJobTypes: readonly string[];
}

function queueForType(messageType: string): QueueName {
  const queue = COMMAND_QUEUE_ROUTES[messageType as keyof typeof COMMAND_QUEUE_ROUTES];
  if (queue) return queue;
  if (messageType === "dead-letter") return "dead-letter";
  throw new PermanentJobError(`UNKNOWN_JOB_TYPE:${messageType}`);
}

function registrationHandler(
  messageTypes: readonly string[],
  handlers: Readonly<Record<string, RuntimeJobHandler>>,
): QueueHandler<unknown> {
  return async (_payload, job) => {
    if (!messageTypes.includes(job.name)) throw new PermanentJobError(`UNKNOWN_JOB_TYPE:${job.name}`);
    const handler = handlers[job.name];
    if (!handler) throw new PermanentJobError(`RUNTIME_HANDLER_NOT_CONFIGURED:${job.name}`);
    return handler(job as Job<unknown>);
  };
}

export function createRuntimeHandlerRegistry(
  handlers: Readonly<Record<string, RuntimeJobHandler>>,
): RuntimeHandlerRegistry {
  const byQueue = new Map<QueueName, string[]>();
  for (const messageType of RUNTIME_JOB_TYPES) {
    const queue = queueForType(messageType);
    const messageTypes = byQueue.get(queue) ?? [];
    messageTypes.push(messageType);
    byQueue.set(queue, messageTypes);
  }
  const registrations = QUEUE_NAMES.map((queue) => {
    const messageTypes = Object.freeze([...(byQueue.get(queue) ?? [])]);
    return Object.freeze({
      queue,
      messageTypes,
      handler: registrationHandler(messageTypes, handlers),
    });
  });
  return Object.freeze({
    registrations: Object.freeze(registrations),
    missingJobTypes: Object.freeze(RUNTIME_JOB_TYPES.filter((messageType) => handlers[messageType] === undefined)),
  });
}
