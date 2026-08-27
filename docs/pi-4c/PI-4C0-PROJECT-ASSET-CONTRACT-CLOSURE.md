# PI-4C0 Project / Asset Domain Contract Closure

## Scope and authoritative parent

- Parent main: `d746e8336caba325a3ee92879e4a9e2a37c02bfe`
- Gate: `PI-4C0_PROJECT_ASSET_DOMAIN_CONTRACT_CLOSURE`
- Scope: PI-4A open questions OQ01–OQ08 only
- Runtime UI, AI provider, Renderer, Railway, and Production are unchanged.

## Closure decisions

| Question                        | Status | Implemented contract                                                                                                                                                                                      |
| ------------------------------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OQ01 First-class Project entity | CLOSED | Dedicated workspace-scoped Project aggregate under exactly one immutable Campaign; `ACTIVE`/`ARCHIVED`; optimistic revision concurrency.                                                                  |
| OQ02 Project ↔ CreativeSet     | CLOSED | `CreativeSet.projectId` is nullable for legacy records, required for the new project-scoped generation flow, queryable by Project, and excluded from update patches.                                      |
| OQ03 Project authorization      | CLOSED | Read access inherits authenticated workspace/campaign access. Mutations use existing `OWNER`/`ADMIN`/`EDITOR` route policy; no Project ACL table exists.                                                  |
| OQ04 Campaign asset semantics   | CLOSED | Campaign Asset Pool entries remain references to exact AssetVersion IDs in the brand/workspace library; no binary copy is created.                                                                        |
| OQ05 Project asset CRUD         | CLOSED | Project-local links reference same-workspace AssetVersions, validate optional products against confirmed parent-Campaign products, and support list/add/remove.                                           |
| OQ06 asset inheritance          | CLOSED | Effective pool is a live union of selected Campaign references and Project-local links; generation stores an immutable exact-version snapshot.                                                            |
| OQ07 asset roles                | CLOSED | One shared taxonomy: `LOGO`, `MODEL`, `PRODUCT`, `KEY_VISUAL`, `BACKGROUND`, `BADGE`, `GRAPHIC`, `REFERENCE`. New Campaign writes normalize omitted roles to `REFERENCE`; legacy DB rows may remain null. |
| OQ08 usage graph                | CLOSED | Usage is derived from existing CreativeAssetUsage → CreativeVersion → Creative → CreativeSet relationships and exposes Project/Campaign context without a second source of truth.                         |

OQ09 and later questions remain deferred and were not changed.

## API surface

- `GET|POST /api/v1/workspaces/:workspaceId/campaigns/:campaignId/projects`
- `GET|PATCH|DELETE /api/v1/workspaces/:workspaceId/projects/:projectId`
- `GET /api/v1/workspaces/:workspaceId/projects/:projectId/creative-sets`
- `GET|POST /api/v1/workspaces/:workspaceId/projects/:projectId/assets`
- `DELETE /api/v1/workspaces/:workspaceId/projects/:projectId/assets/:referenceId`
- `GET /api/v1/workspaces/:workspaceId/projects/:projectId/assets/effective`
- `GET /api/v1/workspaces/:workspaceId/projects/:projectId/asset-usages`
- Existing Campaign generation endpoint accepts `projectId` for the new target flow.

Project `PATCH` and `DELETE` use the existing weak revision ETag/`If-Match` contract. Mutation routes carry `OWNER`, `ADMIN`, and `EDITOR` role metadata enforced by the existing authorization plugin in production composition.

## Asset inheritance and conflict behavior

The effective identity is `assetVersionId + product scope`. A Campaign and Project reference to the same identity is returned once with source `BOTH`, explicit source metadata, and mutable/inherited flags. Different roles on the same effective identity are exposed as `ASSET_ROLE_CONFLICT`; generation fails closed rather than selecting hidden precedence. Inactive, missing, or license-ineligible assets also fail closed for project-scoped generation.

The effective read model is live. At generation creation, eligible entries are copied into `GenerationRequest.assetPoolSnapshotJson` with exact AssetVersion, product scope, role, and source. Later pool edits cannot mutate that snapshot.

## Persistence and compatibility

Migration `0012_project_asset_contract.sql` creates Project and Project Asset Reference persistence, adds the shared role type, and adds nullable `project_id` relationships to GenerationRequest and CreativeSet. Existing Campaign-only GenerationRequests and CreativeSets stay valid as legacy unassigned records; no fake Project is backfilled.

## Validation notes

Core tests cover Project lifecycle/concurrency, workspace isolation, Campaign product validation, live inheritance/de-duplication, generation snapshot identity, and CreativeSet propagation. API route/OpenAPI coverage and TypeScript checks cover the transport composition. Local PostgreSQL migration execution requires a running test database; the migration remains statically checked when that service is unavailable.
