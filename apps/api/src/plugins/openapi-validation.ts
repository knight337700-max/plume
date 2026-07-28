import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  createSchemaRegistry,
  type OpenApiDocument,
  type SchemaRegistry,
} from "./schema-registry.js";

export interface OpenApiValidationOptions {
  readonly document: OpenApiDocument;
  readonly registry?: SchemaRegistry;
}

export const openApiValidationPlugin: FastifyPluginAsync<OpenApiValidationOptions> = async (
  app: FastifyInstance,
  options,
) => {
  const registry = options.registry ?? createSchemaRegistry(options.document);
  for (const [name, schema] of registry.entries()) app.addSchema({ $id: name, ...schema });
  app.decorate("openApiSchemas", registry);
};

export function resolveOpenApiSchema(registry: SchemaRegistry, schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if ("$ref" in schema && typeof schema.$ref === "string") return registry.resolve(schema.$ref);
  if (Array.isArray(schema)) return schema.map((item) => resolveOpenApiSchema(registry, item));
  return Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, resolveOpenApiSchema(registry, value)]),
  );
}
