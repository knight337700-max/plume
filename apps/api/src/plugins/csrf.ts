import { timingSafeEqual, randomBytes } from "node:crypto";
import type { FastifyPluginAsync } from "fastify";

interface SessionWithCsrf {
  csrfToken?: string;
}

function isExempt(request: { method: string; url: string }): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  return request.url.includes("/events/stream") || request.url.includes("/download-url");
}

function matches(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

export const csrfPlugin: FastifyPluginAsync = async (app) => {
  app.addHook("onRequest", async (request, reply) => {
    const session = (request as unknown as { session?: SessionWithCsrf }).session;
    if (!session) return;
    session.csrfToken ??= randomBytes(32).toString("hex");
    reply.header("x-csrf-token", session.csrfToken);
    if (isExempt(request)) return;
    const received = request.headers["x-csrf-token"];
    if (typeof received !== "string" || !matches(session.csrfToken, received)) {
      const error = new Error("CSRF validation failed");
      Object.assign(error, { code: "CSRF_VALIDATION_FAILED", statusCode: 403 });
      throw error;
    }
  });
};

export { isExempt as isCsrfExempt };
