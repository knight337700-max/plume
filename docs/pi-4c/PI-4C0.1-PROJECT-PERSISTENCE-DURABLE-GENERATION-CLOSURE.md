# PI-4C0.1 Project Persistence and Durable Generation Closure

## 1. PI-4C0 blocker closure

PI-4C0.1 adds the durable Project domain required to close the Project and Project Asset contract gap. This document records the implementation state; it does not declare PI-4C0.1 standalone final PASS.

## 2. Project SQL persistence

Migration `0012_project_asset_contract.sql` introduces Project persistence. `DrizzleProjectRepositories` provides SQL create, read, update, archive, revision control, and restart-safe retrieval.

## 3. Project Asset Reference persistence

Project Asset References persist as SQL records and are returned after repository/application object recreation. Effective asset-pool calculation reads durable Campaign, Asset, and Project context.

## 4. Production fail-closed DI

API production composition requires the Project durable dependencies. Missing dependencies fail closed; it does not select an in-memory Project fallback.

## 5. Enqueue-time snapshot

`ProjectGenerationPreparer` derives the effective asset pool on the server before enqueue and freezes the Project asset snapshot for the command.

## 6. Durable command payload

`creative.generate` carries `projectId` and `assetPoolSnapshot` only as an additive internal durable command contract. Legacy non-Project payloads remain valid.

## 7. Project generation persistence

`DurableProjectGenerationPersistence` writes `GenerationRequest.projectId`, `GenerationRequest.assetPoolSnapshotJson`, and `CreativeSet.projectId` in PostgreSQL, with duplicate delivery protection.

## 8. Known PI-4C0.1 review defect

The PI-4C0.1 candidate incorrectly changed Frozen `apps/worker/src/handlers/jacomo-runtime.ts`, and persistence alone did not make the enqueue snapshot the worker execution authority.

## 9. Corrected by PI-4C0.2

PI-4C0.2 restores the Frozen handler byte-for-byte and moves Project persistence plus snapshot execution context to non-Frozen worker composition. Its WorkerBootstrap/BullMQ integration test proves snapshot A remains authoritative after live state changes to C.
