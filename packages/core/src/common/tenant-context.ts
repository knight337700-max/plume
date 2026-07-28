export interface TenantContext {
  readonly workspaceId: string;
  readonly correlationId: string;
}

export function createTenantContext(input: {
  workspaceId?: string;
  correlationId?: string;
}): TenantContext {
  const workspaceId = input.workspaceId?.trim();
  const correlationId = input.correlationId?.trim();
  if (!workspaceId) throw new Error("workspaceId is required");
  if (!correlationId) throw new Error("correlationId is required");
  return Object.freeze({ workspaceId, correlationId });
}

export function withTenantContext<T>(context: TenantContext, fn: (context: TenantContext) => T): T {
  return fn(context);
}
