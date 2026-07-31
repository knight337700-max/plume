# Gate H Worker Runtime Command Inventory

Status: `PARTIAL_COMPLETED` — H-STG-009 inventory and classification only.

## Evidence

- The catalog source is `packages/core/src/async/queue-routing.ts` and contains 22 command routes; the runtime registry adds `dead-letter`, for 23 catalog types.
- `git grep` found no API or application `queue.add`, `enqueueCommand`, `publishCommand`, or `routeCommand` producer. The only queue publisher is the uninstantiated helper `apps/worker/src/handlers/outbox/publish-outbox.ts`.
- The async API surfaces return `202` with a generated job ID but do not enqueue a `CommandEnvelope`; representative files are `apps/api/src/routes/campaign/brief.ts`, `apps/api/src/routes/campaign/product-matching.ts`, `apps/api/src/routes/campaign/asset-pool.ts`, `apps/api/src/routes/creative/creatives.ts`, and `apps/api/src/routes/validation/validation.ts`.
- `packages/testkit/src/harness/process-harness.ts` starts Fastify and two health-only HTTP servers. It does not start `apps/worker/src/main.ts`, a BullMQ consumer, or a scheduler process.
- `apps/api/e2e/jacomo-flow.spec.ts` fabricates creative, render, validation, manifest, and ZIP results after the API calls. It is therefore not a queued JACOMO trace.

## Classification

`STAGING_ENABLED` is intentionally empty. A command cannot be staging-enabled until a real producer, envelope schema, application service, and Worker handler are wired together.

| command | queue | producers | payload_type | payload_schema | application_service | repositories / adapters | emitted_in_current_product | required_for_jacomo_mvp | status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `asset.analyze` | `asset-processing` | `POST /assets/:assetId.analyze` (202-only) | `AnalyzeImageInput` | null | `createImageAnalysisHandler` | image source, analysis store; no durable composition | false | false | `BLOCKED_MISSING_IMPLEMENTATION` |
| `asset.thumbnail` | `asset-processing` | none found | `CreateThumbnailInput` | null | `createThumbnailHandler` | thumbnail source/store; no producer | false | false | `STAGING_DISABLED` |
| `asset.background_remove` | `asset-processing` | `POST /assets/:assetId.background-remove` (202-only) | null | null | none; adapter is explicitly disabled | none | false | false | `STAGING_DISABLED` |
| `brief.analyze` | `document-analysis` | `POST /campaigns/:campaignId/brief.analyze` (202-only) | `AnalyzeBriefInput` | null | `createCampaignAnalystHandler` → `BriefUseCases.createVersion` | Agent orchestrator, campaign repositories | false | true | `BLOCKED_MISSING_IMPLEMENTATION` |
| `brief.reanalyze` | `document-analysis` | none found | `AnalyzeBriefInput` | null | same as `brief.analyze` | Agent orchestrator, campaign repositories | false | true | `BLOCKED_MISSING_IMPLEMENTATION` |
| `product.match` | `ai-standard` | `POST /campaigns/:campaignId/product-matching.run` (202-only) | `ProductMatchInput` | null | `createProductMatcherHandler` → `ProductMatchingUseCases.run` | Agent orchestrator, campaign repositories | false | true | `BLOCKED_MISSING_IMPLEMENTATION` |
| `asset.recommend` | `ai-standard` | `POST /campaigns/:campaignId/assets.recommend` (202-only) | `RecommendAssetsInput` | null | `createAssetCuratorHandler` → `CampaignAssetPoolUseCases.recommend` | Agent orchestrator, campaign repositories | false | true | `BLOCKED_MISSING_IMPLEMENTATION` |
| `creative.generate` | `ai-standard` | generation request route creates records only | `GenerateCopyInput` / `PlanLayoutInput` / `ComposeGenerationItemInput` | null | copy generator, layout planner, generation item composer | Agent orchestrator, creative/campaign repositories | false | true | `BLOCKED_MISSING_IMPLEMENTATION` |
| `natural_language.edit` | `ai-high` | none found | `PlanEditOperationsInput` | null | `createNaturalLanguageEditorHandler` | Agent orchestrator; application write path not queued | false | true | `BLOCKED_MISSING_IMPLEMENTATION` |
| `validation.ai_review` | `ai-standard` | none found | policy review input | null | `createPolicyReviewerHandler` | Agent orchestrator, validation application service not composed | false | true | `BLOCKED_MISSING_IMPLEMENTATION` |
| `creative.render` | `render` | `POST /creative-versions/:versionId.render` (202-only) | `RenderWorkerInput` | null | `createRenderWorkerHandler` | creative repositories, deterministic renderer, object storage, file store | false | true | `BLOCKED_MISSING_IMPLEMENTATION` |
| `creative.preview.render` | `render` | same render route with `PREVIEW` purpose | `RenderWorkerInput` | null | `createRenderWorkerHandler` | creative repositories, deterministic renderer, object storage, file store | false | true | `BLOCKED_MISSING_IMPLEMENTATION` |
| `validation.render` | `render` | none found | `RenderWorkerInput` | null | render worker can produce a `VALIDATION` purpose, but no command producer | creative repositories, deterministic renderer, object storage | false | true | `BLOCKED_MISSING_IMPLEMENTATION` |
| `export.render` | `render` | export workflow has no render enqueue | `RenderWorkerInput` | null | render worker can produce a `FINAL_EXPORT` purpose, but no command producer | creative repositories, deterministic renderer, object storage | false | true | `BLOCKED_MISSING_IMPLEMENTATION` |
| `validation.run` | `validation` | `POST /creative-versions/:versionId/validation-runs` runs core use case directly | `ValidationWorkerInput` | null | `createValidationWorkerHandler` → deterministic validator | validation repositories, rule compiler | false | true | `BLOCKED_MISSING_IMPLEMENTATION` |
| `export.render_and_package` | `export` | `POST /campaigns/:campaignId/export-jobs` creates records only | `ExportWorkerInput` | null | `createExportWorkerHandler` → package builder | export repositories, renderer output, package builder | false | true | `BLOCKED_MISSING_IMPLEMENTATION` |
| `catalog.integrity_check` | `maintenance` | none found | catalog repository | null | `createCatalogIntegrityHandler` | catalog repository | false | false | `STAGING_DISABLED` |
| `catalog.future_rule_activate` | `maintenance` | none found | null | null | none found | none | false | false | `STAGING_DISABLED` |
| `notification.dispatch` | `notifications` | none found | notification message | null | notification use case exists, Worker handler absent | notification repository | false | false | `STAGING_DISABLED` |
| `job.retry` | `default` | retry API changes state only | job retry payload | null | job use case exists, Worker handler absent | job repository | false | false | `STAGING_DISABLED` |
| `retention.cleanup` | `maintenance` | none found | null | null | none found | none | false | false | `STAGING_DISABLED` |
| `product.import` | `default` | no queue producer found | `ProductImportWorkerInput` | null | `createProductImportWorker` → `ProductUseCases.create` | product repositories, import parser | false | false | `STAGING_DISABLED` |
| `dead-letter` | `dead-letter` | runtime queue only | dead-letter metadata | null | no consumer handler; registry only routes the queue | BullMQ dead-letter queue | false | false | `STAGING_DISABLED` |

## JACOMO decision

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

All 12 are `BLOCKED_MISSING_IMPLEMENTATION` for the queued workflow. They either have no producer at all or have an API surface that returns a queued-looking response without publishing a command. The current E2E cannot be used as a Worker trace because it does not start a Worker and fabricates the final artifacts.

Per Gate H Phase 2A.1 section 6 and section 26, H-STG-010 through H-STG-012 must not begin until the common application layer and real queue producer are implemented. Adding a constant-success handler, calling Fastify/localhost from the Worker, or treating the existing API-only E2E as a queue E2E would violate the prompt.

## Required minimum work before composition

1. Define versioned payload schemas and `CommandEnvelope` validation for the 12 JACOMO commands.
2. Add a real producer port and inject BullMQ/outbox publishing into the API/application layer; remove 202-only fake job responses.
3. Replace the current in-memory repository seams used by the runtime path with durable implementations before claiming PostgreSQL-backed composition.
4. Extend the process harness to start the actual Worker and Scheduler, then assert job completion, operation/SSE state, duplicate delivery, retry release, and dead-letter metadata.
