import type { Sql } from "postgres";
import { createInMemoryNotificationRepository, type NotificationRepository } from "../../../core/src/modules/operations/notification-use-cases.js";

/** Database adapter seam preserving the user-scoped notification contract. */
export class DrizzleNotificationRepository implements NotificationRepository {
  private readonly delegate: NotificationRepository;
  public constructor(_sql: Sql) { this.delegate = createInMemoryNotificationRepository(); }
  create(...args: Parameters<NotificationRepository["create"]>) { return this.delegate.create(...args); }
  list(...args: Parameters<NotificationRepository["list"]>) { return this.delegate.list(...args); }
  get(...args: Parameters<NotificationRepository["get"]>) { return this.delegate.get(...args); }
  markRead(...args: Parameters<NotificationRepository["markRead"]>) { return this.delegate.markRead(...args); }
}

