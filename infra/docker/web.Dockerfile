FROM node:24.15.0-alpine AS build

ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm --filter @plume/ui build && pnpm --filter @plume/web build

FROM node:24.15.0-alpine AS runtime

ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="Plume Web" \
      org.opencontainers.image.description="Plume creative workflow web application" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.created="$BUILD_DATE" \
      org.opencontainers.image.source="plume"

ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
RUN addgroup -S plume && adduser -S -G plume plume
COPY --from=build --chown=plume:plume /workspace/apps/web/dist ./dist
USER plume
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node --input-type=module -e "const response = await fetch('http://127.0.0.1:' + (process.env.PORT ?? '8080')); if (!response.ok) process.exit(1)"
ENTRYPOINT ["node"]
CMD ["--input-type=module", "-e", "import { createServer } from 'node:http'; import { readFile } from 'node:fs/promises'; import { extname, join, normalize } from 'node:path'; const root = '/app/dist'; const types = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }; const server = createServer(async (request, response) => { const requestPath = normalize(new URL(request.url ?? '/', 'http://localhost').pathname); const filePath = join(root, requestPath === '/' ? 'index.html' : requestPath.slice(1)); try { const body = await readFile(filePath); response.writeHead(200, { 'content-type': types[extname(filePath)] ?? 'application/octet-stream' }); response.end(body); } catch { const body = await readFile(join(root, 'index.html')); response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); response.end(body); } }); server.listen(Number(process.env.PORT ?? '8080'), '0.0.0.0');"]
