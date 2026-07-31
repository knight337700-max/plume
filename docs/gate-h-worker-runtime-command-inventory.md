# Gate H Worker Runtime Command Inventory

Status: `COMPLETED` — H-STG-009 inventory reconciled through H-STG-010,
H-STG-011, and H-STG-012. Remote CI/PR confirmation is recorded in the Gate H
execution log after push.

## Current H-STG-010–012 decision

The 12-command JACOMO candidate set remains classified as follows:

- External entry: `creative.generate`.
- Internal Worker steps: `creative.render`, `validation.run`,
  `export.render_and_package`.
- Optional/disabled until separately implemented: the remaining eight
  candidates (`brief.analyze`, `product.match`, `asset.recommend`,
  `natural_language.edit`, `creative.preview.render`, `validation.ai_review`,
  `validation.render`, and `export.render`).

Only the four active commands are registered by the staging Worker. The API
creates `async_job`, `async_job_item`, and `outbox_message` rows transactionally;
the Worker-owned Outbox dispatcher publishes canonical `CommandEnvelope`
payloads to BullMQ. The real process harness starts the actual API producer,
Worker consumers, Outbox dispatcher, Scheduler lease, MinIO storage, and Redis.
The queued JACOMO E2E completed eight durable items (one root, three renders,
three validations, one export), verified PNG and ZIP bytes from object storage,
replayed a published command through the idempotency guard, and observed an
exhausted delivery on the dead-letter queue.

## Evidence

The following bullets are the H-STG-009 baseline snapshot, retained to show the
reconciliation delta:

- The catalog source is `packages/core/src/async/queue-routing.ts` and contains 22 command routes; the runtime registry adds `dead-letter`, for 23 catalog types.
- At that snapshot, no API or application producer was wired; the only queue publisher was the uninstantiated helper `apps/worker/src/handlers/outbox/publish-outbox.ts`.
- At that snapshot, the API surfaces returned queued-looking responses without publishing a canonical envelope.
- At that snapshot, the process harness started Fastify and two health-only HTTP servers rather than the Worker and Scheduler.
- At that snapshot, the API E2E fabricated creative, render, validation, manifest, and ZIP results.

## Classification

`STAGING_ENABLED` is intentionally empty. A command cannot be staging-enabled until a real producer, envelope schema, application service, and Worker handler are wired together.

| command | queue | producers | payload_type | payload_schema | application_service | repositories / adapters | emitted_in_current_product | required_for_jacomo_mvp | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `asset.analyze` | `asset-processing` | `POST /assets/:assetId.analyze` (202-only) | `AnalyzeImageInput` | null | `createImageAnalysisHandler` | image source, analysis store; no durable composition | false | false | `BLOCKED_MISSING_IMPLEMENTATION` |
| `asset.thumbnail` | `asset-processing` | none found | `CreateThumbnailInput` | null | `createThumbnailHandler` | thumbnail source/store; no producer | false | false | `STAGING_DISABLED` |
| `asset.background_remove` | `asset-processing` | `POST /assets/:assetId.background-remove` (202-only) | null | null | none; adapter is explicitly disabled | none | false | false | `STAGING_DISABLED` |
| `brief.analyze` | `document-analysis` | 202 route intentionally disabled | `AnalyzeBriefInput` | null | existing analyst handler not composed in staging | existing application ports | false | false | `STAGING_DISABLED_OPTIONAL` |
| `brief.reanalyze` | `document-analysis` | none | `AnalyzeBriefInput` | null | existing analyst handler not composed in staging | existing application ports | false | false | `STAGING_DISABLED_OPTIONAL` |
| `product.match` | `ai-standard` | 202 route intentionally disabled | `ProductMatchInput` | null | existing matcher handler not composed in staging | existing application ports | false | false | `STAGING_DISABLED_OPTIONAL` |
| `asset.recommend` | `ai-standard` | 202 route intentionally disabled | `RecommendAssetsInput` | null | existing curator handler not composed in staging | existing application ports | false | false | `STAGING_DISABLED_OPTIONAL` |
| `creative.generate` | `ai-standard` | `POST /campaigns/:campaignId/generation-requests` → durable publisher | `CreativeGeneratePayload` | `plume.async.creative.generate.v1` | `composeJacomoCreative` | PostgreSQL Job/Item/Outbox, Worker composition | true | true | `STAGING_ENABLED_EXTERNAL_ENTRY` |
| `natural_language.edit` | `ai-high` | none; optional staging command | `PlanEditOperationsInput` | null | existing editor handler not composed in staging | application write path not queued | false | false | `STAGING_DISABLED_OPTIONAL` |
| `validation.ai_review` | `ai-standard` | none; optional staging command | policy review input | null | existing reviewer handler not composed in staging | validation application service not composed | false | false | `STAGING_DISABLED_OPTIONAL` |
| `creative.render` | `render` | Worker internal outbox from `creative.generate` | `CreativeRenderPayload` | `plume.async.creative.render.v1` | deterministic `renderCreativeDocument` | Worker workflow repository, deterministic renderer, S3-compatible storage | true | true | `STAGING_ENABLED_INTERNAL_STEP` |
| `creative.preview.render` | `render` | 202 route intentionally disabled | `RenderWorkerInput` | null | same renderer adapter reserved for a later activation | creative repositories, deterministic renderer, object storage | false | false | `STAGING_DISABLED_OPTIONAL` |
| `validation.render` | `render` | none; optional staging command | `RenderWorkerInput` | null | same renderer adapter reserved for a later activation | deterministic renderer, object storage | false | false | `STAGING_DISABLED_OPTIONAL` |
| `export.render` | `render` | none; optional staging command | `RenderWorkerInput` | null | same renderer adapter reserved for a later activation | deterministic renderer, object storage | false | false | `STAGING_DISABLED_OPTIONAL` |
| `validation.run` | `validation` | Worker internal outbox from `creative.render` | `ValidationRunPayload` | `plume.async.validation.run.v1` | deterministic validator | Worker workflow repository, rule snapshot, durable render references | true | true | `STAGING_ENABLED_INTERNAL_STEP` |
| `export.render_and_package` | `export` | Worker internal outbox after all validation items complete | `ExportPackagePayload` | `plume.async.export.render_and_package.v1` | `buildExportPackage` | Worker workflow repository, S3-compatible storage, package builder | true | true | `STAGING_ENABLED_INTERNAL_STEP` |
| `catalog.integrity_check` | `maintenance` | none found | catalog repository | null | `createCatalogIntegrityHandler` | catalog repository | false | false | `STAGING_DISABLED` |
| `catalog.future_rule_activate` | `maintenance` | none found | null | null | none found | none | false | false | `STAGING_DISABLED` |
| `notification.dispatch` | `notifications` | none found | notification message | null | notification use case exists, Worker handler absent | notification repository | false | false | `STAGING_DISABLED` |
| `job.retry` | `default` | retry API changes state only | job retry payload | null | job use case exists, Worker handler absent | job repository | false | false | `STAGING_DISABLED` |
| `retention.cleanup` | `maintenance` | none found | null | null | none found | none | false | false | `STAGING_DISABLED` |
| `product.import` | `default` | no queue producer found | `ProductImportWorkerInput` | null | `createProductImportWorker` → `ProductUseCases.create` | product repositories, import parser | false | false | `STAGING_DISABLED` |
| `dead-letter` | `dead-letter` | runtime queue only | dead-letter metadata | null | no consumer handler; registry only routes the queue | BullMQ dead-letter queue | false | false | `STAGING_DISABLED` |

## JACOMO decision and completion evidence

The JACOMO candidate set is:

```text
brief.analyze
product.match
asset.recommend
creative.generate
natural_language.edit
creative.render
creative.preview.render
validation.run
validation.ai_review
validation.render
export.render
export.render_and_package
```

The four active commands are no longer blocked. The remaining eight are
explicitly disabled and their API routes return `JOB_TYPE_NOT_ENABLED` rather
than fabricating `202` work. The implementation includes versioned payload
schemas, canonical envelope validation, transactional Job/JobItem/Outbox
creation, one Worker-owned dispatcher, durable job queries, real Worker
composition, deterministic render/validation/package handlers, duplicate
delivery idempotency, retry release semantics, exhausted-delivery dead-letter
recording, and graceful shutdown ordering.
