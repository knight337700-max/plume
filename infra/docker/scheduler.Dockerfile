FROM node:24.15.0-alpine AS build

ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm exec tsc -p apps/scheduler/tsconfig.json --outDir /opt/compiled
RUN pnpm deploy --legacy --filter @plume/scheduler --prod --ignore-scripts /opt/runtime

FROM node:24.15.0-alpine AS runtime

ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="Plume Scheduler" \
      org.opencontainers.image.description="Plume scheduled job coordinator" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.created="$BUILD_DATE" \
      org.opencontainers.image.source="plume"

ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S plume && adduser -S -G plume plume
COPY --from=build --chown=plume:plume /opt/runtime/node_modules ./node_modules
COPY --from=build --chown=plume:plume /opt/compiled ./dist
USER plume
# Scheduler has no HTTP surface; the PID probe is the liveness contract.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node --input-type=module -e "try { process.kill(1, 0); } catch { process.exit(1); }"
ENTRYPOINT ["node"]
CMD ["dist/src/main.js"]
