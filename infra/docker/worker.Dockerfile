FROM node:24.15.0-alpine AS build

ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

WORKDIR /workspace
RUN corepack enable && corepack prepare pnpm@11.17.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm build:renderer-vendor
RUN pnpm exec tsc -p apps/worker/tsconfig.typecheck.json --outDir /opt/compiled --declaration false --declarationMap false --sourceMap false
RUN pnpm deploy --legacy --filter @plume/worker --prod --ignore-scripts /opt/runtime
# The compiled runtime keeps internal @plume deep imports. Hydrate their emitted
# package directories into the production dependency tree so Node ESM resolves
# the same paths as it did in the workspace.
RUN for package in /opt/compiled/packages/*; do name="$(basename "$package")"; mkdir -p "/opt/runtime/node_modules/@plume/$name"; cp -R "$package"/* "/opt/runtime/node_modules/@plume/$name/"; done
# Worker source retains a relative renderer-vendor runtime import. Its production
# dependencies must therefore be resolvable from the emitted /opt/compiled tree.
RUN renderer_vendor="$(find /opt/runtime/node_modules/.pnpm -maxdepth 1 -type d -name '@plume+renderer-vendor@*' -print -quit)" && test -n "$renderer_vendor" && for dependency in @napi-rs/canvas @kbr/renderer-contract ajv canonicalize sharp; do target="$(readlink -f "$renderer_vendor/node_modules/$dependency")"; destination="/opt/runtime/node_modules/$dependency"; mkdir -p "$(dirname "$destination")"; case "$dependency" in @*/*) link_prefix="../" ;; *) link_prefix="" ;; esac; ln -s "${link_prefix}${target#/opt/runtime/node_modules/}" "$destination"; done

FROM node:24.15.0-alpine AS runtime

ARG VCS_REF=unknown
ARG BUILD_DATE=unknown

LABEL org.opencontainers.image.title="Plume Worker" \
      org.opencontainers.image.description="Plume asynchronous job worker" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.created="$BUILD_DATE" \
      org.opencontainers.image.source="plume"

ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S plume && adduser -S -G plume plume
COPY --from=build --chown=plume:plume /opt/runtime/node_modules ./node_modules
COPY --from=build --chown=plume:plume /opt/compiled ./dist
USER plume
# Worker has no HTTP surface; the PID probe is the liveness contract.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 CMD node --input-type=module -e "try { process.kill(1, 0); } catch { process.exit(1); }"
ENTRYPOINT ["node"]
CMD ["dist/apps/worker/src/main.js"]
