import cookie from "@fastify/cookie";
import fastifySession from "@fastify/session";
import type { FastifyPluginAsync } from "fastify";

export interface SessionPluginOptions {
  readonly secret?: string;
  readonly environment?: "development" | "test" | "production";
}

export const sessionPlugin: FastifyPluginAsync<SessionPluginOptions> = async (app, options) => {
  const environment =
    options.environment ??
    (process.env.NODE_ENV as SessionPluginOptions["environment"]) ??
    "development";
  const secret =
    options.secret ??
    process.env.SESSION_SECRET ??
    "plume-development-session-secret-change-me-32-chars";
  if (secret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");

  await app.register(cookie);
  await app.register(fastifySession, {
    secret,
    cookie: {
      httpOnly: true,
      secure: environment === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 8 * 60 * 60,
    },
  });
};
