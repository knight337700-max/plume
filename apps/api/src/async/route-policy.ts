export function jobTypeNotEnabled(command: string): never {
  const error = new Error(`Async command is not enabled for this staging workflow: ${command}`);
  Object.assign(error, { code: "JOB_TYPE_NOT_ENABLED", statusCode: 409, retryable: false });
  throw error;
}

export function headerValue(
  request: unknown,
  name: string,
): string | undefined {
  const headers = (request as { headers?: Record<string, string | string[] | undefined> }).headers;
  const value = headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

export function actorReference(request: unknown): string | undefined {
  const session = (request as { session?: { userId?: string } }).session;
  return session?.userId ?? headerValue(request, "x-user-id");
}
