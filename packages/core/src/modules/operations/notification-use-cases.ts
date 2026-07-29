import { randomUUID } from "node:crypto";

export interface NotificationRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly eventId?: string | null;
  readonly notificationType: string;
  readonly title: string;
  readonly body: string;
  readonly deepLink?: string | null;
  readonly createdAt: string;
  readonly readAt?: string | null;
}

export interface CreateNotificationInput {
  readonly id?: string;
  readonly workspaceId: string;
  readonly userId: string;
  readonly eventId?: string | null;
  readonly notificationType: string;
  readonly title: string;
  readonly body: string;
  readonly deepLink?: string | null;
  readonly createdAt?: string;
}

export interface NotificationRepository {
  create(input: CreateNotificationInput): Promise<NotificationRecord>;
  list(workspaceId: string, userId: string, unreadOnly?: boolean): Promise<readonly NotificationRecord[]>;
  get(workspaceId: string, userId: string, id: string): Promise<NotificationRecord | null>;
  markRead(workspaceId: string, userId: string, id: string, readAt?: string): Promise<NotificationRecord>;
}

export interface NotificationUseCases {
  create(input: CreateNotificationInput): Promise<NotificationRecord>;
  list(input: { readonly workspaceId: string; readonly userId: string; readonly unreadOnly?: boolean }): Promise<readonly NotificationRecord[]>;
  markRead(input: { readonly workspaceId: string; readonly userId: string; readonly notificationId: string }): Promise<NotificationRecord>;
}

function notFound(): Error {
  const error = new Error("Notification not found");
  Object.assign(error, { code: "RESOURCE_NOT_FOUND", statusCode: 404 });
  return error;
}

export function createInMemoryNotificationRepository(seed: readonly NotificationRecord[] = [], now: () => Date = () => new Date()): NotificationRepository {
  const notifications = new Map(seed.map((item) => [item.id, item]));
  return {
    async create(input) {
      const item: NotificationRecord = Object.freeze({ id: input.id ?? randomUUID(), workspaceId: input.workspaceId, userId: input.userId, ...(input.eventId === undefined ? {} : { eventId: input.eventId }), notificationType: input.notificationType, title: input.title, body: input.body, ...(input.deepLink === undefined ? {} : { deepLink: input.deepLink }), createdAt: input.createdAt ?? now().toISOString(), readAt: null });
      notifications.set(item.id, item);
      return item;
    },
    async list(workspaceId, userId, unreadOnly = false) {
      return [...notifications.values()].filter((item) => item.workspaceId === workspaceId && item.userId === userId && (!unreadOnly || item.readAt === null || item.readAt === undefined)).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    },
    async get(workspaceId, userId, id) {
      const item = notifications.get(id);
      return item?.workspaceId === workspaceId && item.userId === userId ? item : null;
    },
    async markRead(workspaceId, userId, id, readAt = now().toISOString()) {
      const current = notifications.get(id);
      if (!current || current.workspaceId !== workspaceId || current.userId !== userId) throw notFound();
      if (current.readAt) return current;
      const updated = Object.freeze({ ...current, readAt });
      notifications.set(id, updated);
      return updated;
    },
  };
}

export function createNotificationUseCases(repository: NotificationRepository): NotificationUseCases {
  return {
    create: (input) => repository.create(input),
    list: (input) => repository.list(input.workspaceId, input.userId, input.unreadOnly),
    async markRead(input) {
      const current = await repository.get(input.workspaceId, input.userId, input.notificationId);
      if (!current) throw notFound();
      return repository.markRead(input.workspaceId, input.userId, input.notificationId);
    },
  };
}

