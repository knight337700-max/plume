import type { CommandEnvelope } from "./message-envelope.js";

export const QUEUE_NAMES = Object.freeze([
  "asset-processing",
  "document-analysis",
  "ai-standard",
  "ai-high",
  "render",
  "validation",
  "export",
  "maintenance",
  "notifications",
  "dead-letter",
  "default",
] as const);

export type QueueName = (typeof QUEUE_NAMES)[number];

export const COMMAND_QUEUE_ROUTES = Object.freeze({
  "asset.analyze": "asset-processing",
  "asset.thumbnail": "asset-processing",
  "asset.background_remove": "asset-processing",
  "brief.analyze": "document-analysis",
  "brief.reanalyze": "document-analysis",
  "product.match": "ai-standard",
  "asset.recommend": "ai-standard",
  "creative.generate": "ai-standard",
  "ai.live_smoke": "ai-standard",
  "ai.live_smoke.verify": "ai-standard",
  "natural_language.edit": "ai-high",
  "validation.ai_review": "ai-standard",
  "creative.render": "render",
  "creative.preview.render": "render",
  "validation.render": "render",
  "export.render": "render",
  "validation.run": "validation",
  "export.render_and_package": "export",
  "catalog.integrity_check": "maintenance",
  "catalog.future_rule_activate": "maintenance",
  "notification.dispatch": "notifications",
  "job.retry": "default",
  "retention.cleanup": "maintenance",
  "product.import": "default",
} as const satisfies Record<string, QueueName>);

export type AsyncCommand = keyof typeof COMMAND_QUEUE_ROUTES;

export function queueForCommand(command: string): QueueName {
  const queue = COMMAND_QUEUE_ROUTES[command as AsyncCommand];
  if (!queue) throw new Error(`No queue route registered for command ${command}`);
  return queue;
}

export function routeCommand<T>(envelope: CommandEnvelope<T>): {
  readonly queue: QueueName;
  readonly envelope: CommandEnvelope<T>;
} {
  return Object.freeze({ queue: queueForCommand(envelope.command), envelope });
}
