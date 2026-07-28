export interface OpenApiDocument {
  readonly components?: { readonly schemas?: Readonly<Record<string, Record<string, unknown>>> };
}

export class SchemaRegistry {
  private readonly schemas = new Map<string, Record<string, unknown>>();

  constructor(document: OpenApiDocument = {}) {
    for (const [name, schema] of Object.entries(document.components?.schemas ?? {})) {
      this.schemas.set(name, schema);
    }
  }

  register(name: string, schema: Record<string, unknown>): void {
    this.schemas.set(name, schema);
  }

  get(name: string): Record<string, unknown> | undefined {
    return this.schemas.get(name);
  }

  resolve(reference: string): Record<string, unknown> {
    if (!reference.startsWith("#/components/schemas/"))
      throw new Error(`Unsupported OpenAPI reference: ${reference}`);
    const name = reference.slice("#/components/schemas/".length);
    const schema = this.get(name);
    if (!schema) throw new Error(`Unknown OpenAPI schema reference: ${name}`);
    return schema;
  }

  entries(): readonly (readonly [string, Record<string, unknown>])[] {
    return [...this.schemas.entries()];
  }
}

export function createSchemaRegistry(document: OpenApiDocument): SchemaRegistry {
  return new SchemaRegistry(document);
}
