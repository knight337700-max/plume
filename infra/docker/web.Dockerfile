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
COPY --chown=plume:plume infra/docker/web-runtime-server.mjs ./web-runtime-server.mjs
USER plume
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node --input-type=module -e "const response = await fetch('http://127.0.0.1:' + (process.env.PORT ?? '8080')); if (!response.ok) process.exit(1)"
ENTRYPOINT ["node"]
CMD ["web-runtime-server.mjs"]
