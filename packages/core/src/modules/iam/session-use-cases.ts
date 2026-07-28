import type { IamRepositories, WorkspaceRecord } from "./repositories.js";

export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly revokedAt?: Date;
  readonly tokenHash?: string;
  readonly passwordHash?: string;
}

export interface SessionUserDto { readonly id: string; readonly email: string; readonly displayName: string }
export interface SessionDto { readonly id: string; readonly user: SessionUserDto; readonly expiresAt: string }

export interface SessionStore {
  get(sessionId: string): Promise<SessionRecord | null>;
  revoke(sessionId: string, revokedAt: Date): Promise<void>;
}

export interface SessionUseCases {
  getCurrentSession(sessionId: string, now?: Date): Promise<SessionDto | null>;
  logout(sessionId: string, now?: Date): Promise<void>;
  listWorkspaces(userId: string): Promise<readonly WorkspaceRecord[]>;
}

function publicSession(session: SessionRecord): SessionDto {
  return {
    id: session.id,
    user: { id: session.userId, email: session.email, displayName: session.displayName },
    expiresAt: session.expiresAt.toISOString(),
  };
}

export function createSessionUseCases(
  sessions: SessionStore,
  iam: Pick<IamRepositories, "listWorkspacesForUser">,
): SessionUseCases {
  return {
    async getCurrentSession(sessionId, now = new Date()) {
      const session = await sessions.get(sessionId);
      if (!session || session.revokedAt || session.expiresAt <= now) return null;
      return publicSession(session);
    },
    async logout(sessionId, now = new Date()) {
      const session = await sessions.get(sessionId);
      if (!session || session.revokedAt) return;
      await sessions.revoke(sessionId, now);
    },
    async listWorkspaces(userId) {
      return iam.listWorkspacesForUser(userId);
    },
  };
}

export class InMemorySessionStore implements SessionStore {
  private readonly records = new Map<string, SessionRecord>();

  constructor(records: readonly SessionRecord[] = []) {
    for (const record of records) this.records.set(record.id, record);
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    return this.records.get(sessionId) ?? null;
  }

  async revoke(sessionId: string, revokedAt: Date): Promise<void> {
    const current = this.records.get(sessionId);
    if (current && !current.revokedAt) this.records.set(sessionId, { ...current, revokedAt });
  }
}
