FROM node:24.15.0-alpine AS build

ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts
# Compile production API sources only; repository E2E harness files are not runtime artifacts.
RUN find apps/api/src -type f -name '*.ts' ! -name '*.test.ts' ! -name '*.integration.test.ts' -print0 | xargs -0 pnpm exec tsc --target ES2022 --module ESNext --moduleResolution Bundler --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --noImplicitOverride --noImplicitReturns --noFallthroughCasesInSwitch --forceConsistentCasingInFileNames --isolatedModules --verbatimModuleSyntax --resolveJsonModule --skipLibCheck --rootDir . --outDir /opt/compiled --declaration false --declarationMap false --sourceMap false
RUN pnpm deploy --legacy --filter @plume/api --prod --ignore-scripts /opt/runtime

FROM node:24.15.0-alpine AS runtime

ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="Plume API" \
      org.opencontainers.image.description="Plume creative workflow API" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.created="$BUILD_DATE" \
      org.opencontainers.image.source="plume"

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
WORKDIR /app
RUN addgroup -S plume && adduser -S -G plume plume
COPY --from=build --chown=plume:plume /opt/runtime/node_modules ./node_modules
COPY --from=build --chown=plume:plume /opt/compiled ./dist
USER plume
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node --input-type=module -e "const response = await fetch('http://127.0.0.1:' + (process.env.PORT ?? '3000') + '/api/v1/health'); if (!response.ok) process.exit(1)"
ENTRYPOINT ["node"]
CMD ["dist/apps/api/src/main.js"]
