import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { mapError } from "../errors/map-error.js";

export const problemDetailsPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.setErrorHandler((error, request, reply) => {
    const problem = mapError(error, request.id);
    reply.status(problem.status).type("application/problem+json").send(problem);
  });
};
