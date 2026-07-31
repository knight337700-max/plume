import { Job, Queue, Worker, type ConnectionOptions, type JobsOptions } from "bullmq";

export interface BullMqAdapterOptions {
  readonly redisUrl?: string;
  readonly environmentPrefix?: string;
  readonly prefix?: string;
}

export interface QueueMessage<T = unknown> {
  readonly name?: string;
  readonly data: T;
  readonly options?: JobsOptions;
}

export type QueueHandler<T> = (data: T, job: Job<T>) => Promise<unknown> | unknown;

export interface DeadLetterPayload {
  readonly sourceQueue: string;
  readonly sourceJobId: string;
  readonly sourceJobName: string;
  readonly attemptsMade: number;
  readonly failedReason: string;
  readonly data: unknown;
  readonly failedAt: string;
}

function redisConnection(redisUrl: string): ConnectionOptions {
  const parsed = new URL(redisUrl);
  const database = parsed.pathname.replace(/^\//, "");
  return {
    host: parsed.hostname || "localhost",
    port: parsed.port ? Number(parsed.port) : 6379,
    ...(parsed.password ? { password: decodeURIComponent(parsed.password) } : {}),
    ...(database ? { db: Number(database) } : {}),
    ...(parsed.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

export class BullMqAdapter {
  private readonly connection: ConnectionOptions;
  private readonly prefix: string;
  private readonly queues = new Map<string, Queue>();
  private readonly workers = new Set<Worker>();

  constructor(options: BullMqAdapterOptions = {}) {
    this.connection = redisConnection(
      options.redisUrl ?? process.env.REDIS_URL ?? "redis://localhost:6379",
    );
    this.prefix = (options.prefix ?? options.environmentPrefix ?? process.env.QUEUE_PREFIX?.trim() ?? "development").replace(
      /[^a-z0-9_-]/gi,
      "-",
    );
  }

  get queuePrefix(): string {
    return this.prefix;
  }

  queueName(queue: string): string {
    return `${this.prefix}:${queue}`;
  }

  getQueue(queue: string): Queue {
    const name = this.queueName(queue);
    const existing = this.queues.get(name);
    if (existing) return existing;
    const created = new Queue(queue, { connection: this.connection, prefix: this.prefix });
    this.queues.set(name, created);
    return created;
  }

  async enqueue<T>(queue: string, message: QueueMessage<T>): Promise<Job<T>> {
    return this.getQueue(queue).add(message.name ?? "message", message.data, {
      attempts: message.options?.attempts ?? 3,
      backoff: message.options?.backoff ?? { type: "exponential", delay: 5_000 },
      ...message.options,
    });
  }

  consume<T>(
    queue: string,
    handler: QueueHandler<T>,
    options: { readonly concurrency?: number } = {},
  ): Worker {
    const worker = new Worker(
      queue,
      async (job) => handler(job.data as T, job as Job<T>),
      { connection: this.connection, prefix: this.prefix, concurrency: options.concurrency ?? 1 },
    );
    worker.on("failed", (job, error) => {
      if (!job || job.attemptsMade < (job.opts.attempts ?? 1)) return;
      void this.enqueue<DeadLetterPayload>("dead-letter", {
        name: "dead-letter",
        data: {
          sourceQueue: queue,
          sourceJobId: String(job.id),
          sourceJobName: job.name,
          attemptsMade: job.attemptsMade,
          failedReason: error instanceof Error ? error.message : String(error),
          data: job.data,
          failedAt: new Date().toISOString(),
        },
        options: { attempts: 1, jobId: `dead-letter-${this.prefix}-${String(job.id).replace(/[^a-z0-9_-]/gi, "-")}` },
      }).catch(() => undefined);
    });
    this.workers.add(worker);
    return worker;
  }

  async close(): Promise<void> {
    await Promise.all([...this.workers].map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.workers.clear();
    this.queues.clear();
  }
}

export function createBullMqAdapter(options: BullMqAdapterOptions = {}): BullMqAdapter {
  return new BullMqAdapter(options);
}
