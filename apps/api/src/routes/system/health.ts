import type { FastifyInstance } from "fastify";

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get(
    "/api/v1/health",
    {
      config: { operationId: "getHealth" },
      schema: {
        response: {
          200: {
            type: "object",
            additionalProperties: false,
            required: ["status", "version", "time"],
            properties: {
              status: { type: "string", enum: ["ok", "degraded"] },
              version: { type: "string" },
              time: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
    async (request, reply) => {
      reply.header("x-request-id", request.id);
      reply.header("etag", `W/\"health-${process.env.APP_VERSION ?? "0.1.0"}\"`);
      return {
        status: "ok",
        version: process.env.APP_VERSION ?? "0.1.0",
        time: new Date().toISOString(),
      };
    },
  );
}
