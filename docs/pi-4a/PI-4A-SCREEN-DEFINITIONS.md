# PI-4A Screen Definitions

Status: `FREEZE_CANDIDATE`

Baseline: `18cfac0cbf9ba54306ddd66415a7f00baafb70b4`

The ten definitions below freeze structure and behavior, not visual styling. `Unsupported` controls must remain absent or disabled with a reason until the named contract gap is closed.

## Screen: Global Shell

### Purpose

Provide stable account scope, primary navigation, route context, notifications, and recovery affordances around every PLUME screen. `AI Creative` is Home.

### Entry

Authenticated application entry, deep link, or return from any child route.

### Exit / Next

AI Creative, Campaigns, Projects reached through Campaign context, or Settings. Assets are contextual and never a top-level destination.

### Primary Actions

Navigate to AI Creative; select account/workspace; open a Campaign or Settings.

### Secondary Actions

Open notifications/job status, profile/session controls, help, and breadcrumbs.

### Required Data

Current user, workspace membership/role, selected workspace, route, Campaign/Project context when applicable.

### Optional Data

Unread notification count and active/recent job summary.

### Layout Zones

Persistent sidebar; top bar with scope and status; breadcrumb/context row; main content; transient toast/dialog layer.

### Components

App shell, side navigation, account selector, breadcrumb, status badge, notification popover, route outlet, toast region.

### User States

Authenticated/authorized, authenticated/no workspace, unauthorized route, session expired, offline/reconnecting.

### Empty State

No workspace: explain that workspace membership is required; do not show product routes as usable.

### Loading State

Shell skeleton with navigation disabled until identity and workspace scope resolve.

### Failure State

Identity or workspace lookup error appears in the content area; route failure must not erase the persistent recovery shell.

### Retry / Recovery

Retry identity/scope load, reauthenticate on expiry, return Home on invalid context, reconnect event stream without losing the route.

### Permissions / Scope

Workspace membership gates all content. Route actions additionally honor Campaign resource policies and role checks.

### Backend Contract Dependency

Workspace/IAM identity and membership are supported. Global notification persistence is not established; job status may use current job/SSE contracts.

### Renderer Contract Dependency

None for shell navigation. Renderer status may be surfaced only for a concrete render job.

### Astryx Mapping

`AppShell`, `SideNav`, `Breadcrumb`, `Select`, `Popover`, `Badge`, `Toast`, `Skeleton`, `Dialog` through the PLUME adapter.

### PLUME Custom Components

`PlumeAppShell`, `WorkspaceSwitcher`, `ContextBreadcrumbs`, `GlobalJobIndicator`, route guards.

### Open Questions

Whether global notifications require durable inbox storage is deferred; it does not alter IA.

## Screen: AI Creative — Step 1 Creative Setup

### Purpose

Establish Account > Campaign > Project context and collect the product, effective assets, and copy required for an AI first draft.

### Entry

Home, or Campaign/Project action with available context preloaded.

### Exit / Next

Step 2 Channel / Format after all required inputs pass validation; context switch may return to the same screen after confirmation.

### Primary Actions

Select Campaign and Project, choose product, select effective assets, enter/confirm copy, continue.

### Secondary Actions

Inspect asset metadata/source, replace a selection, request AI Copywriter suggestions when available, save or discard setup draft.

### Required Data

Workspace, Campaign, Project identity, product, at least one eligible asset where the selected format requires it, confirmed copy, effective asset-pool membership and license state.

### Optional Data

Brief, brand context, product links, asset metadata/version, AI copy suggestions.

### Layout Zones

Four-step progress; context selector; product panel; effective Asset Pool split into inherited and Project-local groups; copy panel; sticky CTA footer.

### Components

Stepper, cascading selectors, product cards, asset grid/list, source badges, copy fields, validation summary, primary/secondary buttons.

### User States

No context, Campaign selected/no Project, context ready, incomplete input, ready, unsaved change, unsupported Project persistence.

### Empty State

No Campaign/Project or no eligible assets: explain the missing prerequisite and link to the contextual management screen; never silently substitute another scope.

### Loading State

Keep context labels visible; skeleton product/assets; disable Continue with loading reason.

### Failure State

Scope/product/asset load errors are isolated by panel. Expired or ineligible assets identify the affected item.

### Retry / Recovery

Retry failed panel; preserve successful fields; confirm before discarding unsaved data on context change; restore safe local draft only against the same context revision.

### Permissions / Scope

Read access to workspace/Campaign/assets; generation permission for Continue. Asset add/upload follows current brand/Campaign policy, not assumed Project policy.

### Backend Contract Dependency

Campaign, product, brand assets, versions, licenses, and product links are supported. A first-class Project, Project-local assets, explicit inheritance/roles, and direct AI Copywriter request contract are not implemented.

### Renderer Contract Dependency

None until generation; selected inputs must eventually resolve to canonical renderer asset/copy references.

### Astryx Mapping

`Stepper`, `Select`, `Card`, `SelectableCard`, `Input`, `Textarea`, `Badge`, `Alert`, `Button`, `Skeleton`, `Tooltip`.

### PLUME Custom Components

`CreativeContextSelector`, `EffectiveAssetPool`, `AssetSourceBadge`, `ProductPicker`, `CopyComposer`, `SetupReadinessSummary`.

### Open Questions

Project storage boundary, Project asset CRUD/inheritance semantics, asset-role taxonomy, and AI Copywriter API require later contract decisions.

## Screen: AI Creative — Step 2 Channel / Format

### Purpose

Choose one or more canonical channel/format targets and expose availability before generation.

### Entry

Step 1 with a valid setup snapshot.

### Exit / Next

Step 3 AI Generate with selected format profile IDs, or back to Step 1 without losing valid selections.

### Primary Actions

Select channel, multi-select available format cards, continue.

### Secondary Actions

Inspect dimensions/ratio/constraints, clear selection, switch channel, return to setup.

### Required Data

Canonical channels, approved format profiles, dimensions/aspect ratio, availability/capability reason, selected IDs/count.

### Optional Data

Format description, placement label, export recipe summary, compatibility notes.

### Layout Zones

Stepper; channel tabs/cards; selection count/action bar; responsive format-card grid; capability/error panel.

### Components

Tab list or segmented control, selectable cards, badges, metadata rows, selection counter, alert, CTA footer.

### User States

Available format, unavailable channel, selected/unselected, mixed compatibility, no selection, ready.

### Empty State

Channel with no approved profiles shows `Catalog not ready` and no fabricated formats. Current active catalog exposes only three Kakao profiles.

### Loading State

Channel labels remain; format-card skeletons; Continue disabled until authoritative availability resolves.

### Failure State

Catalog/capability errors fail closed and distinguish load failure from an intentionally unavailable channel.

### Retry / Recovery

Retry catalog load; retain only selections still present and eligible; disclose removed stale selections.

### Permissions / Scope

Workspace/Campaign read and generation permission; format availability is contract-driven, not role-overridden.

### Backend Contract Dependency

Four channels and multi-format arrays are supported. Only three Kakao profiles are active at baseline; Naver, Meta, and Google profiles are unavailable.

### Renderer Contract Dependency

Every enabled format must be present in the canonical vendor-backed format profile/recipe boundary.

### Astryx Mapping

`TabList`, `SelectableCard`, `Badge`, `Alert`, `Tooltip`, `Button`, `Skeleton`.

### PLUME Custom Components

`ChannelSelector`, `FormatProfileCard`, `FormatSelectionSummary`, `CatalogCapabilityNotice`.

### Open Questions

Future profile activation order and cross-channel batch policy are non-blocking for the current fail-closed screen.

## Screen: AI Creative — Step 3 AI Generate

### Purpose

Review the generation matrix, start generation, monitor durable job/item progress, recover partial failures, and continue with successful creatives.

### Entry

Step 2 with at least one available format selected.

### Exit / Next

Step 4 Editor when at least one creative succeeds; back to prior steps before submission; Campaign/Project context after cancellation.

### Primary Actions

Confirm generation, cancel an eligible job, retry a failed/partial job, continue to Editor.

### Secondary Actions

Expand per-format details, inspect failure reasons, refresh status, return to format selection before generation.

### Required Data

Frozen input summary, product/variant/format matrix, job ID/status/progress, item status/result/failure, successful creative/version IDs.

### Optional Data

Timing, attempt count, provider-safe diagnostic code, estimated count.

### Layout Zones

Stepper; review summary; aggregate progress/status; per-format item list; failure/recovery panel; footer actions.

### Components

Summary cards, progress bar, status badges, item list/table, alerts, disclosure panels, buttons, toast.

### User States

Review, submitting, queued, running, partial success, completed, failed, cancelled, reconnecting.

### Empty State

No generation matrix indicates stale/missing setup and routes back to the earliest invalid step.

### Loading State

Submission is idempotency-protected; status skeleton appears only before a job record exists. Once known, show last confirmed status with reconnecting label.

### Failure State

Submission failure differs from durable job failure. Per-format failures remain beside successful results; do not collapse partial success into total failure.

### Retry / Recovery

Reconnect SSE, reconcile with GET job/items, retry eligible job while preserving completed items, cancel where allowed. Per-item retry must not be offered because no such endpoint exists.

### Permissions / Scope

Generation permission in the bound workspace/Campaign; job operations scoped to the same resource context.

### Backend Contract Dependency

Generation requests, matrix items, durable jobs, SSE, cancel, retry, and partial success are supported. Retry is job-level, not per-item.

### Renderer Contract Dependency

Generation output and subsequent preview must use pinned renderer contract `1.8.0`; UI does not synthesize final pixels.

### Astryx Mapping

`Progress`, `Card`, `List`/`Table`, `Badge`, `Alert`, `Button`, `Skeleton`, `Toast`.

### PLUME Custom Components

`GenerationReview`, `GenerationJobPanel`, `FormatJobRow`, `PartialSuccessSummary`, `JobRecoveryActions`.

### Open Questions

Whether a future item-level retry endpoint is desirable; current UX remains accurate without it.

## Screen: AI Creative — Step 4 Creative Editor

### Purpose

Give humans final control over AI drafts through selection, renderer-backed preview, structured editing, validation, finalization, export, and download.

### Entry

Successful or partial generation, or reopen from Project Creatives with a Creative/version selected.

### Exit / Next

Project Creatives, approval/finalization state, export job/download, or another creative in the same generated set.

### Primary Actions

Select creative, edit properties/layers, save, validate, finalize/submit approval, start export, download eligible files.

### Secondary Actions

Undo supported operation, preview an operation, acknowledge warning, reset to AI draft lineage, switch format/creative, inspect version history.

### Required Data

Creative/set/version identity and status, CreativeDocument, ETag/revision, render/preview, elements/layers, editable properties, validation run/results, approval/export eligibility.

### Optional Data

Generation metadata, version ancestry, render history, warning acknowledgements, export history.

### Layout Zones

Header with lifecycle/actions; left Creative List and Layers; center Canvas/Preview; right Properties and Validation; persistent save/conflict status.

### Components

Three-column shell, list/tree, canvas host, tabs, form controls, status badges, validation list, dialogs, buttons, toast.

### User States

`AI_DRAFT`, `EDITED`, `VALIDATED`, `FINAL`; clean/dirty/saving/saved/conflict; validation pending/PASS/WARNING/FAIL/execution failed; export queued/running/ready/failed.

### Empty State

No successful creative routes back to Generate. No selected element shows document-level properties rather than a blank panel.

### Loading State

Preserve editor chrome; skeleton list/properties; canvas shows last render with updating indicator during a new render.

### Failure State

Autosave conflict, operation rejection, render failure, validation rule failure, validation execution failure, approval ineligibility, and export failure have distinct messages/actions.

### Retry / Recovery

Reload and reconcile ETag conflict; retry render/validation/export through their contracts; preserve local edits until resolved; reset uses recorded ancestry and must not invent a root marker.

### Permissions / Scope

Viewers may inspect; editors mutate drafts; approval/export follows explicit policies, self-approval rules, current-version checks, and license/catalog eligibility.

### Backend Contract Dependency

Document/version autosave, operation preview/apply, render/freeze, validation, acknowledgements, approval, export, files, and URLs are supported. Product lifecycle labels are UI projections; explicit `AI_DRAFT` root identity is partial.

### Renderer Contract Dependency

Renderer is one-way authority for PREVIEW, VALIDATION, and FINAL_EXPORT renders. The UI never recreates renderer output or changes Frozen34.

### Astryx Mapping

`AppShell`/`Layout`, `Tree`, `List`, `Tabs`, `Input`, `Select`, `Slider`, `Badge`, `Alert`, `Dialog`, `Popover`, `Tooltip`, `Toast`, `Button`.

### PLUME Custom Components

`CreativeEditorShell`, `CreativeListPanel`, `LayerTree`, `RendererCanvas`, `PropertiesInspector`, `ValidationPanel`, `VersionConflictDialog`, `FinalizeExportActions`.

### Open Questions

Formal AI-draft root marker and exact reset semantics are deferred contract work; existing ancestry can support a guarded partial behavior.

## Screen: Campaign Overview

### Purpose

Present Campaign identity/context and summaries of assets and Projects, with contextual navigation into management and creation.

### Entry

Campaign selection from shell, breadcrumb, or AI Creative context selector.

### Exit / Next

Campaign Assets, Project Overview, AI Creative with Campaign preloaded, or Campaign settings permitted by policy.

### Primary Actions

Open Projects, open Campaign Assets, start AI Creative, create/select Project when supported.

### Secondary Actions

Inspect/edit Campaign metadata and brief where authorized; archive only through an established contract.

### Required Data

Campaign identity, workspace/brand relation, status/context/brief, asset summary, Project summary or explicit unavailable state.

### Optional Data

Recent activity only when sourced from an authoritative event/audit contract; otherwise omit and label future in specification only.

### Layout Zones

Campaign header; metadata/context panel; asset summary; Project summary/list; contextual actions.

### Components

Page header, cards, description list, badges, list/table, empty state, buttons.

### User States

Active, incomplete context, archived/unavailable, Project capability unavailable.

### Empty State

No Projects: explain the target hierarchy and disable creation until Project persistence exists. No assets links to contextual asset management.

### Loading State

Header identity remains if routed by known context; section-level skeletons.

### Failure State

Campaign-not-found/forbidden is page-level; independent summary failures are section-level.

### Retry / Recovery

Retry failed summary; return to Campaign selector for invalid context; do not infer a Project from a CreativeSet without an explicit mapping decision.

### Permissions / Scope

Workspace/Campaign read; edits/actions follow Campaign policy and role.

### Backend Contract Dependency

Campaign metadata/brief/products/asset references are supported. Project list/creation and durable recent-activity feed are not implemented.

### Renderer Contract Dependency

None; thumbnails, if shown, must reference existing renderer artifacts.

### Astryx Mapping

`Card`, `Badge`, `List`/`Table`, `EmptyState`, `Button`, `Skeleton`, `Alert`.

### PLUME Custom Components

`CampaignHeader`, `CampaignContextSummary`, `AssetPoolSummary`, `ProjectSummary`.

### Open Questions

Project contract and durable activity-source decision.

## Screen: Campaign Assets

### Purpose

Manage and inspect the Campaign Asset Pool, including role, metadata, usage/reference visibility, and downstream inheritance implications.

### Entry

Campaign Overview or contextual asset link from AI Creative/Project screens.

### Exit / Next

Campaign Overview, Project Assets, or AI Creative with Campaign context retained.

### Primary Actions

Filter/select assets, inspect details, add existing eligible references where supported, upload through supported brand asset flow.

### Secondary Actions

View version/license/product links and usage; remove/replace Campaign selection only when the current Campaign asset-pool contract permits it.

### Required Data

Campaign, pool references, resolved asset/version, metadata, license/eligibility, product relation, role if defined, usage references if available.

### Optional Data

Renderer thumbnail, dimensions, file details, creation/update timestamps.

### Layout Zones

Header/actions; filters; asset grid/table; detail drawer; usage/inheritance notice.

### Components

Search/filter controls, card/table, badges, drawer/dialog, empty state, upload/add buttons, alert.

### User States

Eligible, expired/ineligible, referenced, missing resolution, uploading/processing, read-only.

### Empty State

Explain that Campaign assets become inherited inputs for Projects. Offer only contract-backed add/upload actions.

### Loading State

Filter shell plus card/table skeletons; mutation progress stays attached to the affected asset.

### Failure State

Distinguish pool-reference failure, asset metadata failure, upload failure, license failure, and unauthorized mutation.

### Retry / Recovery

Retry reads/uploads as supported; retain successfully loaded rows; reconcile mutation result from server before updating inheritance summaries.

### Permissions / Scope

Campaign read for visibility; asset upload/mutation follows brand/Campaign policies and license constraints.

### Backend Contract Dependency

Brand asset/version/upload/license/product-link contracts and Campaign product-specific asset selection references exist. General Campaign ownership, role taxonomy, and usage graph are partial/not implemented.

### Renderer Contract Dependency

Only artifact thumbnails/previews; no mutation of renderer inputs outside established asset/version references.

### Astryx Mapping

`Input`, `Select`, `Card`, `Table`, `Badge`, `Dialog`, `EmptyState`, `Progress`, `Alert`, `Button`.

### PLUME Custom Components

`CampaignAssetBrowser`, `AssetDetailPanel`, `AssetEligibilityBadge`, `AssetUsageSummary`, `AssetUploadFlow`.

### Open Questions

Canonical Campaign asset ownership, roles, and usage/reference endpoint.

## Screen: Project Overview

### Purpose

Represent a Campaign child work context with Project identity, inherited/local asset summaries, creative summary, and preloaded entry to AI Creative.

### Entry

Campaign Overview Project list or breadcrumb.

### Exit / Next

Project Assets, Project Creatives, parent Campaign, or AI Creative with Campaign/Project preloaded.

### Primary Actions

Start/continue AI Creative, open Project Assets, open Project Creatives.

### Secondary Actions

Edit Project identity/context, archive, or duplicate only after contracts exist.

### Required Data

Project ID/name/status, parent Campaign, context/metadata, inherited asset count, local asset count, creative counts/status.

### Optional Data

Recent update timestamp, owner, description.

### Layout Zones

Project header/breadcrumb; context summary; inherited/local asset cards; creative summary; actions.

### Components

Page header, breadcrumb, cards, badges, description list, empty state, buttons.

### User States

Ready, incomplete, archived/read-only, contract unavailable.

### Empty State

At baseline the first-class Project contract is unavailable; show the product boundary as unavailable rather than aliasing CreativeSet silently.

### Loading State

Known Campaign breadcrumb remains; section skeletons.

### Failure State

Not found/forbidden page state; section errors for assets/creatives.

### Retry / Recovery

Retry reads or return to parent Campaign. Do not create client-only Project IDs as recovery.

### Permissions / Scope

Project scope inherits workspace/Campaign authorization until a dedicated Project policy is defined.

### Backend Contract Dependency

No first-class Project contract exists. CreativeSet is only a partial containment/status candidate and must not be treated as Project without a formal decision.

### Renderer Contract Dependency

None; creative thumbnails must use existing renderer artifacts.

### Astryx Mapping

`Breadcrumb`, `Card`, `Badge`, `EmptyState`, `Alert`, `Button`, `Skeleton`.

### PLUME Custom Components

`ProjectHeader`, `ProjectContextSummary`, `ProjectAssetSummary`, `CreativeSummary`.

### Open Questions

Project entity schema, lifecycle, authorization, CreativeSet relation, and migration strategy.

## Screen: Project Assets

### Purpose

Show inherited Campaign assets and Project-local assets as visibly distinct sources forming one effective Asset Pool.

### Entry

Project Overview or Step 1 asset management link.

### Exit / Next

Project Overview or AI Creative Step 1 with effective selections refreshed.

### Primary Actions

Inspect/filter both sources; add/remove/replace Project-local assets only after supported; choose eligible effective assets in AI Creative.

### Secondary Actions

View metadata, role, eligibility, parent Campaign source, and usage.

### Required Data

Project and parent Campaign, inherited references, local references, source marker, effective deduplication, metadata/license/role/usage.

### Optional Data

Thumbnail, dimensions, product links, timestamps.

### Layout Zones

Header/effective summary; source legend; inherited section; Project-local section; detail panel; action footer.

### Components

Tabs or grouped lists, cards/table, source badges, filters, detail drawer, empty state, alerts, buttons.

### User States

Inherited, local, duplicate-resolved, ineligible, referenced, read-only, capability unavailable.

### Empty State

No local assets still shows inherited assets and explains inheritance. If Project contract is unavailable, local mutation actions are disabled with reason.

### Loading State

Load sources independently; effective count remains pending until both resolve.

### Failure State

Source-specific failure must not mislabel the remaining source as the complete effective pool.

### Retry / Recovery

Retry each source; recompute effective pool after reconciliation; never hide inherited items through an unsupported client-only remove.

### Permissions / Scope

Campaign asset read plus future Project-local mutation permission; inherited records are not mutated from this screen.

### Backend Contract Dependency

Campaign-side references are partial; Project-local assets, inheritance, overrides, roles, and effective-pool resolution are not implemented.

### Renderer Contract Dependency

Resolved effective assets must reference canonical asset versions before generation/render.

### Astryx Mapping

`TabList`, `Card`, `Table`, `Badge`, `EmptyState`, `Alert`, `Dialog`, `Button`, `Skeleton`.

### PLUME Custom Components

`EffectiveAssetPool`, `InheritedAssetGroup`, `ProjectAssetGroup`, `AssetSourceLegend`, `EffectiveAssetResolverStatus`.

### Open Questions

Inheritance snapshot vs live reference, override/removal semantics, deduplication key, local asset ownership, role taxonomy.

## Screen: Project Creatives

### Purpose

Provide Creative history/list by channel, format, lifecycle, validation, and update time, with reopen and export access where eligible.

### Entry

Project Overview or return from Editor.

### Exit / Next

Editor at selected Creative/version, export/download flow, Project Overview, or AI Creative for a new draft.

### Primary Actions

Open/reopen Creative, start new AI Creative, export eligible current version, download completed export.

### Secondary Actions

Filter/sort, inspect versions/validation, retry eligible export, view failure reason.

### Required Data

Creative/set/current version IDs, channel/format, status/lifecycle projection, validation status, created/updated times if available, preview artifact, export eligibility/history.

### Optional Data

Product, variant, creator/updater, version count, approval data.

### Layout Zones

Header/actions; filters; Creative list/grid; status/validation columns; preview/detail panel; export actions.

### Components

Input/select filters, table/cards, thumbnail, badges, pagination if needed, empty state, dialogs, buttons.

### User States

AI draft, edited, validating, PASS/WARNING/FAIL, final, exported, superseded/archived, export running/failed/ready.

### Empty State

No Creatives: start AI Creative with Project context preloaded only when Project binding exists; otherwise explain capability dependency.

### Loading State

Filter/header remains; row skeletons; reopening shows a targeted transition state.

### Failure State

List failure, preview artifact failure, stale current-version status, validation execution failure, and export failure are distinct.

### Retry / Recovery

Retry list/artifact/export as supported; reload authoritative current version before editor/export; preserve filters.

### Permissions / Scope

Read by Project/Campaign scope; edit, approval, and export actions follow current resource policy and strict eligibility checks.

### Backend Contract Dependency

CreativeSet/Creative/Version lists, status, timestamps, validation, approval, render, export, and downloads are broadly supported. Binding them to a first-class Project is not implemented.

### Renderer Contract Dependency

All previews and exported outputs are renderer artifacts; list thumbnails may never be reconstructed by the web client.

### Astryx Mapping

`Input`, `Select`, `Table`, `Card`, `Badge`, `EmptyState`, `Dialog`, `Popover`, `Tooltip`, `Button`, `Skeleton`.

### PLUME Custom Components

`ProjectCreativeTable`, `CreativeStatusProjection`, `ValidationStatusBadge`, `RendererThumbnail`, `CreativeExportActions`.

### Open Questions

Project binding/migration and whether list history includes superseded versions by default.
