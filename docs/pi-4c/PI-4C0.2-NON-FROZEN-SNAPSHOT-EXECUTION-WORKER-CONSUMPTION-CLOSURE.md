# PI-4C0.2 Non-Frozen Snapshot Execution and Worker Consumption Closure

## 1. Gate purpose

Correct PI-4C0.1 review blockers without reopening the Project persistence design or changing Frozen34.

## 2. Authoritative SHAs

The authoritative parent is `d746e8336caba325a3ee92879e4a9e2a37c02bfe`; PI-4C0 base is `bd9db56a7b50bfc36bfcca34ff24f97b54b3ec83`; the reviewed PI-4C0.1 candidate is `e5fa1d86c157db19741d943f55560a074207c4c2`.

## 3. F1 Frozen34 violation

The reviewed candidate modified Frozen `apps/worker/src/handlers/jacomo-runtime.ts`, which is outside the permitted correction surface.

## 4. Frozen source restoration

PI-4C0.2 restores that handler from the authoritative parent and verifies its exact Git blob identity.

## 5. Non-Frozen execution wrapper

`project-generation-execution.ts` wraps `creative.generate` in worker composition. The Frozen runtime handler is invoked unchanged inside that wrapper.

## 6. Per-job Project execution context

An `AsyncLocalStorage` context holds workspace, campaign, Project, job, and immutable snapshot state. Context is scoped to the job invocation.

## 7. Snapshot-aware repository projection

A non-Frozen Campaign repository decorator intercepts only asset-pool reads matching the Project job context and projects the immutable snapshot; all other repository calls delegate unchanged.

## 8. Canonical Product snapshot rule

For each canonical Product, exactly one `PRODUCT` snapshot asset is required. Missing and ambiguous snapshot entries fail closed.

## 9. No live identity re-resolution

The execution decorator never reads live Campaign or Project asset selections for a Project-scoped canonical Product identity. Live safety validation remains the responsibility of normal asset validation, not identity replacement.

## 10. DurableProjectGenerationPersistence location

Persistence is invoked by the non-Frozen wrapper before Frozen handler execution. The PostgreSQL transaction locks the durable root job and makes duplicate delivery return the same GenerationRequest and CreativeSet.

## 11. Actual outbox/BullMQ/runtime-registry/worker flow

The integration test enqueues through `DurableAsyncCommandPublisher`, dispatches the PostgreSQL outbox to BullMQ, routes through the runtime registry, and consumes via `WorkerBootstrap`. It does not directly call a handler for this hard pass.

## 12. Local Redis test topology

Tests use local PostgreSQL on `localhost:5432`, local Redis on `localhost:6379`, deterministic injected object storage, mock provider mode, and no Railway, remote service, or live provider call.

## 13. Snapshot mutation-after-enqueue proof

The test enqueues snapshot asset A, changes the live selected asset to C before dispatch, and proves persisted and generated canonical output use A while the live Campaign delegate receives zero asset-pool reads.

## 14. Concurrent job isolation proof

Focused unit tests run concurrent Project contexts with different assets and prove each receives only its own snapshot projection.

## 15. Legacy non-Project compatibility

When neither `projectId` nor a snapshot is present, the wrapper delegates unchanged to the existing `creative.generate` handler.

## 16. Duplicate delivery/idempotency

PostgreSQL integration validates concurrent persistence calls for one durable job create exactly one GenerationRequest and one CreativeSet.

## 17. PostgreSQL persistence

Integration checks preserve Project and Project Asset References across object recreation and preserve `projectId`, `assetPoolSnapshotJson`, and `CreativeSet.projectId`.

## 18. Validation

The candidate is subject to migration, focused Postgres and Redis integration, contracts, typecheck, lint, integrity, and changed-file Prettier validation.

## 19. Frozen34 cumulative proof

The final candidate must show zero cumulative diff for the Frozen handler relative to `d746e8336caba325a3ee92879e4a9e2a37c02bfe` and an identical blob hash.

## 20. PI-4C readiness

This is a local correction candidate only. It does not authorize PI-4C Core UI, push, PR, merge, Railway, remote DB, or Production operations.
