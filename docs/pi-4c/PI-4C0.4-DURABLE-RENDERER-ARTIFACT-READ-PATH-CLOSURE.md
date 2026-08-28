# PI-4C0.4 — Durable Renderer Artifact Read-Path Closure

## Purpose and boundary

PI-4C0.4 closes the durable read path for Project renderer artifacts. The
Frozen canonical renderer continues to render bytes and write its object to
ObjectStorage. The non-Frozen integration seam now makes the renderer result
readable through the durable PLUME graph without changing the renderer,
Frozen34, PI-4B, Web UI, Railway, or Production.

The authoritative source baseline is `338dd618b4d99e90acbf3ba06441e1da04c3722e`.
No database migration is required for this closure; the existing
`file_object` and `creative_render` tables are used.

## D1 — Completion-boundary durability

Project `creative.render` execution is identified from its durable
`CreativeVersion -> Creative -> CreativeSet -> GenerationRequest` graph. The
worker rehydrates the Project generation context and its immutable
`asset_pool_snapshot_json` before invoking the Frozen handler. It does not
query live Project, Campaign, or Campaign Asset state while consuming the
render command.

The workflow repository is decorated at the `completeItem` boundary. For a
Project render, the decorator:

1. validates the renderer outcome, version, purpose, and workspace/project
   ownership;
2. verifies the exact renderer object with `ObjectStorage.head`;
3. persists the deduplicated `FileObject` and `CreativeRender` in one SQL
   transaction; and
4. delegates workflow completion only after that transaction commits.

An incomplete outcome, unsafe object key, missing object, storage mismatch,
or graph mismatch fails closed and leaves the workflow item available for
retry. Legacy non-Project workflow completion passes through unchanged.

## D2 — Durable renderer artifact graph

Renderer objects use the existing renderer namespace:

```text
renders/{workspaceId}/{creativeVersionId}/{checksumSha256}.png
```

The integration seam records the exact bucket, object key, byte count,
checksum, MIME type, dimensions, render mode, and renderer metadata in
`file_object` and `creative_render.render_config_json`. `FileObject` identity
is workspace-scoped and content-deduplicated by the existing
`(workspace_id, checksum_sha256, bytes)` constraint. A deterministic UUID
derived from the command message identity makes replay idempotent; a duplicate
delivery cannot create a second `CreativeRender`.

The SQL creative repository now reads Project renders from `creative_render`
instead of its in-memory delegate. Its legacy fallback remains available only
when the requested CreativeVersion is not a durable Project row.

## D3 — Secure server-side read path

The API exposes:

```text
GET /api/v1/workspaces/{workspaceId}/creative-versions/{versionId}/renders
GET /api/v1/workspaces/{workspaceId}/creative-versions/{versionId}/renders/{renderId}/download-url
```

The download endpoint accepts only workspace, version, and render IDs. The
server resolves the CreativeVersion, CreativeRender, and FileObject and then
verifies workspace/version ownership, completed status, renderer namespace,
ObjectStorage bucket/key/size/checksum, and finally creates a short-lived GET
presigned URL. It never accepts a browser-supplied object key. Cross-workspace
and wrong-version lookups return not found. The existing generic file
download route continues to enforce the upload namespace and cannot be used to
read a renderer artifact.

Production API composition supplies the SQL creative repository and the same
SQL-backed FileObject repository to the render download service. Missing
production Project/creative/render dependencies fail closed; no in-memory
fallback is used for the production composition.

## D4 — Validation proof

The real local integration test uses PostgreSQL, Redis/BullMQ, and MinIO. It
proves the complete path:

```text
A (Project asset snapshot)
  -> C (durable CreativeSet / Creative / CreativeVersion)
  -> generate (durable creative.generate)
  -> A (snapshot-backed asset usage)
  -> render (Frozen canonical renderer)
  -> FileObject + CreativeRender
  -> list + exact-byte download
```

The test also proves:

- duplicate delivery of the same durable message keeps one render and one
  creative graph;
- a distinct render message can create a separate render without graph
  duplication;
- a retryable FileObject/CreativeRender persistence failure occurs before
  workflow completion and succeeds on retry;
- stopping the dispatcher, WorkerBootstrap, composition, and SQL client,
  then creating fresh SQL/repository/API objects, preserves the same
  GenerationRequest, CreativeSet, Creative, CreativeVersion, current-version
  pointer, AssetUsage, FileObject, and CreativeRender rows;
- the persisted render is downloadable after that recreation and the returned
  bytes have the persisted SHA-256 and byte count;
- cross-workspace, wrong-version, unsafe-object-key, and generic-download
  regressions are rejected;
- legacy non-Project rendering remains a no-op for the Project artifact seam.

The durable current-version contract is explicit: SQL `createVersion` inserts
the append-only version and atomically updates `creative.current_version_id`.
Duplicate deterministic version creation leaves the pointer resolving to that
version, and a fresh SQL repository returns the same `currentVersionId`.

## Production composition and frozen boundaries

`apps/api/src/main.ts` constructs `DrizzleCreativeRepositories` and
`CreativeRenderArtifactDownload` from the authoritative PostgreSQL client and
the SQL FileObject repository. `apps/worker/src/composition.ts` installs the
completion decorator around the durable workflow repository before passing it
to the Frozen handler.

The final validation records that:

- `apps/worker/src/handlers/jacomo-runtime.ts` remains at the required
  Frozen blob;
- `apps/worker/src/handlers/canonical-product.ts` is unchanged;
- `packages/infrastructure/src/render/**`,
  `packages/renderer-vendor/**`, and `SOURCE_LOCK.json` are unchanged;
- Frozen34, PI-4B, Web UI, backend/runtime files outside this closure, Railway,
  and Production are untouched;
- no direct main push, force push, PR, merge, or deployment is performed by
  this Gate.

## Final validation record

Validation is run from a clean candidate commit on
`codex/pi-4c0-4-durable-renderer-artifact-read-path`. The Evidence package
contains the exact changed-file diff, source and test bodies, PostgreSQL /
Redis / MinIO integration output, API and worker composition proof, frozen
boundary checks, root contracts/typecheck/lint/integrity output,
changed-files-only Prettier output, checksum manifest, secret scan, and outer
ZIP SHA-256.

This document records the closure design and verification contract only; it
does not authorize PI-4C git integration, PI-4C.4 merge, PI-4D, or Production.
