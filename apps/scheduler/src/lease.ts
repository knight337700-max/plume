interface LeaseState {
  owner: string;
  expiresAt: number;
}

const leases = new Map<string, LeaseState>();

export interface SchedulerLease {
  readonly key: string;
  readonly owner: string;
  acquire(): boolean;
  renew(): boolean;
  release(): void;
  isOwner(): boolean;
}

export function createSchedulerLease(
  key: string,
  owner = crypto.randomUUID(),
  ttlMs = 30_000,
): SchedulerLease {
  const now = () => Date.now();
  return {
    key,
    owner,
    acquire() {
      const current = leases.get(key);
      if (current && current.expiresAt > now() && current.owner !== owner) return false;
      leases.set(key, { owner, expiresAt: now() + ttlMs });
      return true;
    },
    renew() {
      const current = leases.get(key);
      if (!current || current.owner !== owner || current.expiresAt <= now()) return false;
      current.expiresAt = now() + ttlMs;
      return true;
    },
    release() {
      if (leases.get(key)?.owner === owner) leases.delete(key);
    },
    isOwner() {
      const current = leases.get(key);
      return Boolean(current && current.owner === owner && current.expiresAt > now());
    },
  };
}
