# PI-4C0.3 Project Canonical Creative Durability Closure

## Scope

PI-4C0.3 closes the durable Project generation graph without changing Frozen34, Renderer, PI-4B, or Web UI. The authoritative execution path remains `creative.generate` followed by `creative.render` through PostgreSQL outbox and BullMQ.

## D1 — Durable canonical output

Project generation persists one connected PostgreSQL graph:

`GenerationRequest → CreativeSet → Creative → CreativeVersion → CreativeAssetUsage`

The worker-owned persistence seam creates the GenerationRequest and its items. Frozen canonical generation creates the sole deterministic CreativeSet, Creative, CreativeVersion, and usage records through the SQL-first repository.

## D2 — Single CreativeSet identity

The GenerationRequest and Frozen canonical result reference the same CreativeSet ID. No random shadow CreativeSet is created. Duplicate delivery of the same durable message and job identity is consumed through BullMQ and leaves one GenerationRequest, the expected GenerationRequestItem count, one CreativeSet, one Creative, one CreativeVersion, and no duplicate asset usage.

## Current-version ownership

Project SQL `createVersion` owns the atomic version-pointer invariant. It appends the CreativeVersion and updates `creative.current_version_id` to that version in the same transaction. Replaying a deterministic version ID verifies its existing Creative ownership and repairs or preserves the same pointer without rewriting the version body.

Core `CreativeVersionRecord.formatProfileId` remains the canonical renderer/catalog key. SQL `creative_version.format_profile_id` remains the durable FormatProfile UUID, and reads project the UUID back to the canonical key.

## D3 — Production durable composition

Default worker composition constructs PostgreSQL-backed Project Campaign, Asset, Creative, and FileObject dependencies. Optional in-memory repositories are legacy non-Project delegates; Project execution does not fall back to them.

## D4 — Render snapshot continuity

The API freezes the Project effective asset snapshot before enqueue. Generation consumes snapshot A even after live Campaign selection changes to C. Render reconstructs Project context from the durable `Version → Creative → CreativeSet → GenerationRequest` graph and resolves A again. The worker does not reread live Campaign or Project asset selection for canonical Project execution.

## Full recreation proof

The hard-pass test completes generate and render, stops the outbox dispatcher and WorkerBootstrap, closes composition, discards its repository context, closes the original SQL client, and creates a fresh SQL client and repositories. The fresh objects return the same GenerationRequest, CreativeSet, Creative, CreativeVersion, current-version pointer, and AssetUsage graph.

## Frozen boundary

Frozen canonical handlers and Renderer Source Lock are unchanged. PI-4B and Web UI are unchanged. No Railway, remote database, Production, or live-provider operation is part of this closure.

## Final validation contract

The candidate must pass focused PostgreSQL plus Redis/BullMQ integration, migrations 0001 through 0012, contract generation/drift checks, root typecheck, lint, integrity, cumulative changed-files Prettier, head-only regression attribution, and cumulative Frozen34 comparison.
