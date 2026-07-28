import { createTenantContext, type TenantContext } from "./tenant-context.js";

export interface RequestContext extends TenantContext {
  readonly requestId: string;
  readonly actorId?: string;
}

export function createRequestContext(input: {
  workspaceId?: string;
  correlationId?: string;
  requestId?: string;
  actorId?: string;
}): RequestContext {
  const tenant = createTenantContext(input);
  const requestId = input.requestId?.trim();
  if (!requestId) throw new Error("requestId is required");
  return Object.freeze({
    ...tenant,
    requestId,
    ...(input.actorId?.trim() ? { actorId: input.actorId.trim() } : {}),
  });
}
