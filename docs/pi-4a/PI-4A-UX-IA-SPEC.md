# PI-4A UX / Information Architecture Specification

Status: `FREEZE_CANDIDATE`

Gate: `PI-4A_UX_INFORMATION_ARCHITECTURE`

Baseline: `knight337700-max/plume@18cfac0cbf9ba54306ddd66415a7f00baafb70b4`

Renderer: `knight337700-max/plume-renderer@7baa272dd852ed21a09cf369c928571b3f75fd31`, integration contract `1.8.0`

## 1. Scope and decision rule

This document freezes product structure, navigation, workflow, information placement, state semantics, and recovery behavior. It does not freeze final color, typography, spacing, icons, motion, or production UI implementation.

Every capability is presented in one of two layers:

1. **Target UX** — the product behavior PI-4A freezes.
2. **Current contract status** — what the authoritative repository can support now.

`NOT_IMPLEMENTED` and `PARTIAL` capabilities must not be presented as working controls in PI-4C. They require an implementation or contract decision first.

## 2. Product principle

The product principle is **AI First Draft + Human Final Control**.

```text
Campaign Context
+ inherited Campaign Assets
+ Project-local Assets
+ confirmed Copy
+ Channel / Format selection
        ↓
AI First Draft
        ↓
Frozen Renderer
        ↓
Human edit and review
        ↓
Renderer-backed Validation
        ↓
Finalize / approval
        ↓
Export
```

The UI exposes outcomes, decisions, evidence, and recovery. It does not expose internal agent orchestration as the primary mental model and does not allow a UI decision to override renderer validation.

## 3. Source-derived baseline

The repository currently provides:

- React 19, Vite, React Router, and TanStack Query in `apps/web`.
- An API client with normalized Problem Details and revision-aware endpoints.
- workspace roles `OWNER`, `ADMIN`, `EDITOR`, `REVIEWER`, and `VIEWER`.
- campaign, brief, product matching, campaign asset pool, channel/format selection, generation request, creative/version, validation, approval, job, and export contracts.
- a catalog with four canonical channels but only three approved Kakao Moment profiles.
- generated-item and generic-job status, SSE workspace events, cancellation, and retry.
- a Creative Document, draft autosave, operation preview/apply, versioning, render purposes, validation, approval, and export eligibility.
- Astryx `@astryxdesign/core@0.1.9` behind a `packages/ui` adapter and PLUME composites/shells.
- only the home and two E2E routes in the production router; the broader screen component catalog is not wired into application routing.

Primary inspected sources are listed in `PI-4A-CONTRACT-MAPPING.md`.

## 4. Global information architecture

```text
PLUME
├─ AI Creative                     HOME
├─ Campaign / Project
│  ├─ Campaign
│  │  ├─ Overview
│  │  ├─ Assets
│  │  └─ Projects
│  └─ Project
│     ├─ Overview
│     ├─ Assets
│     └─ Creatives
└─ Settings
```

Assets are contextual content, not a global navigation item. Approvals, jobs, validation, and exports are contextual statuses/actions surfaced from AI Creative, Project Creatives, and Settings/notification affordances; they are not PI-4A global navigation peers.

### 4.1 Route model

The route model is a PI-4C target, not a routing implementation in this Gate.

| Surface           | Target route shape                                                    | Context behavior                                                                                                  |
| ----------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| AI Creative       | `/w/:workspaceId/ai-creative/:step`                                   | Home entry; selected Campaign and Project persist in route/search state and server-backed context when supported. |
| Campaign Overview | `/w/:workspaceId/campaigns/:campaignId`                               | Campaign context root.                                                                                            |
| Campaign Assets   | `/w/:workspaceId/campaigns/:campaignId/assets`                        | Campaign-owned asset pool.                                                                                        |
| Campaign Projects | `/w/:workspaceId/campaigns/:campaignId/projects`                      | Project list; current backend gap.                                                                                |
| Project Overview  | `/w/:workspaceId/campaigns/:campaignId/projects/:projectId`           | Campaign parent remains visible.                                                                                  |
| Project Assets    | `/w/:workspaceId/campaigns/:campaignId/projects/:projectId/assets`    | Inherited and local assets.                                                                                       |
| Project Creatives | `/w/:workspaceId/campaigns/:campaignId/projects/:projectId/creatives` | Creative history and reopen/export entry.                                                                         |
| Settings          | `/w/:workspaceId/settings`                                            | Workspace/account scope.                                                                                          |

Invalid or inaccessible identifiers produce an in-place `Not found` or `No access` state without silently changing context. Browser history restores the selected step and context. Deep links must never infer a Project from the newest generation job.

## 5. Content hierarchy and contract mapping

```text
Account (UI)  → WorkspaceRecord (domain)
Campaign      → CampaignRecord
Project       → target product entity; CreativeSet is a partial containment mapping
Creative      → CreativeRecord + current CreativeVersionRecord
```

### 5.1 Project boundary

The target product hierarchy keeps Campaign and Project separate. The current backend has no `Project` entity, API, or persistence table. `CreativeSetRecord` has a name, Campaign parent, status, and contained Creatives, so it can support a **partial** Project read/containment mapping. It does not provide Project metadata, Project-local context, or Project-local asset ownership.

PI-4C may use `CreativeSet` as a temporary adapter only when the UI explicitly limits itself to name/status/creative containment. It must not label campaign asset-pool selections or Creative asset usages as Project-local Assets. Project CRUD and Project-local Assets remain a `BACKEND_CONTRACT_GAP`.

## 6. Context model

The persistent Context Bar shows:

```text
Workspace / Campaign / Project
```

- Workspace is required and comes from the authenticated membership.
- Campaign is required before Step 1 can be completed.
- Project is required before generation so generated Creatives have a stable production-work container.
- Changing Campaign clears Project, Product, Asset, Copy, Channel, and Format selections after confirmation.
- Changing Project retains Campaign but reloads the effective asset pool and invalidates Project-dependent draft input.
- Context can be selected from recent items or a searchable selector; it is never inferred from an asset.
- Incomplete local input triggers `Discard and switch` / `Stay here`. No silent discard.
- A deep-linked job or Creative resolves and displays its authoritative context; the user cannot overwrite it by changing a selector.

Current support: Workspace and Campaign are supported. Project selection is partial through CreativeSet containment and must be gated until a Project contract decision is implemented.

## 7. Asset inheritance UX

### 7.1 Effective Asset Pool

```text
Campaign Assets (reference-inherited, read-only in Project scope)
+ Project Assets (owned by Project)
= Effective Asset Pool
```

### 7.2 Visual distinction

Every Asset Card includes:

- preview, name, role, version, license status, and analysis state;
- an origin badge: `Campaign · inherited` or `Project · local`;
- usage scope and product association when available;
- a reference indicator for inherited assets;
- selection state independent of ownership.

Inherited assets remain editable only from Campaign Assets. From Project Assets, the user can select/use them and, when a future exclusion contract exists, exclude the reference for that Project. Project-local remove/archive never archives a Campaign asset.

Role vocabulary is `LOGO`, `MODEL`, `PRODUCT`, `KEY_VISUAL`, `BACKGROUND`, `BADGE`, `GRAPHIC`, `REFERENCE`. The current asset contract does not persist this taxonomy, so role editing is `NOT_IMPLEMENTED`; PI-4C must show only roles backed by data or a clearly marked inferred label.

### 7.3 Current contract boundary

- Brand-scoped assets, versions, uploads, product links, and Campaign asset-pool selections are supported.
- Campaign asset-pool selections are product-specific references, not ownership records.
- Campaign-vs-Project origin and Project-local ownership are not represented.
- The target UX is frozen, but mutating Project-local assets is disabled until the backend gap is resolved.

## 8. AI Creative — four-step workflow

The workflow has exactly four primary steps. Completed steps remain revisitable unless revisiting would invalidate an active job; in that case the user must first cancel the job if cancellation is allowed.

### Step 1 — Creative Setup

Order within the main workspace:

1. Context Bar: Workspace → Campaign → Project.
2. Product selection: confirmed Campaign products, with product detail preview.
3. Effective Asset Pool: selected Product filters/recommends assets but does not hide asset origin.
4. Copy: manual confirmed copy first; `AI Copywriter` is a secondary action that returns a proposal for human acceptance.
5. Setup summary and `Continue to Channel / Format`.

Required target inputs: Workspace, Campaign, Project, at least one Product, at least one usable Asset, and confirmed primary copy. Optional inputs: additional assets, secondary copy, notes, and role hints.

The repository has a Copy Generator worker handler but no direct interactive Copywriter API and the generation route does not persist a pre-generation manual copy payload. Therefore AI Copywriter and pre-generation copy persistence are `PARTIAL`/`BACKEND_CONTRACT_GAP`; PI-4C must not expose a live action until an endpoint exists.

### Step 2 — Channel / Format

- Channels are selected first: Kakao, Naver, Meta, Google.
- Selecting a channel reveals Format cards with name, dimensions, ratio miniature, availability, and blocker reason.
- Multi-select is supported. Selection count drives the action label: `Generate N Creatives`, where `N = products × formats × variants`.
- Cross-channel selection is allowed by the selection and generation data models, but only profiles returned as selectable by the catalog may be chosen.
- At the baseline, only three Kakao Moment formats are `ACTIVE`; Naver, Meta, and Google remain visible as `Catalog not ready` with no selectable invented formats.
- Unknown formats fail closed. `PENDING_VERIFY`, `LEGACY_ONLY`, disabled, feature-dependent, or missing profiles display a reason and cannot be selected for generation.
- Changing channel selection clears stale format selections as the current API does. Navigating back restores persisted Campaign selections.

### Step 3 — AI Generate

The top of the workspace shows an Input Review: Campaign/Project, Products, Asset count, Copy summary, Channels/Formats, and expected Creative count. Starting generation creates one durable job and item rows for the product × variant × format matrix.

Per-item UI states:

| UI state              | Domain source                            | Treatment                                    |
| --------------------- | ---------------------------------------- | -------------------------------------------- |
| Pending               | `QUEUED`                                 | hollow status marker, waiting label          |
| Generating            | `RUNNING`                                | active marker and available progress detail  |
| Completed             | `COMPLETED`                              | success marker and preview-ready affordance  |
| Retryable failure     | item `FAILED` plus job retry eligibility | error detail; job-level `Retry failed items` |
| Non-retryable failure | item/job failure classification          | error detail; return to relevant prior step  |
| Cancelled             | `CANCELLED`                              | neutral terminal state                       |

Job states include `QUEUED`, `RUNNING`, `PARTIAL_SUCCESS`, `COMPLETED`, `FAILED`, and `CANCELLED`. Generic job cancellation is available only while queued/running. Retry is available only for failed/partial jobs and preserves completed items. There is no item-specific retry API; the UI must not present a per-item network action even if the visual row identifies failed items.

The page stays within the AI Creative workspace. SSE updates are preferred; `GET job` and `GET job items` recover after refresh or stream loss. Navigation away is allowed after the job ID is durable, and returning via the job link restores progress.

`Continue to Creative Editor` is enabled after at least one item completes. Partial success is not converted to full success; failed items remain visible in the Editor list and progress summary.

### Step 4 — Creative Editor

```text
LEFT                     CENTER                     RIGHT
Creative List            Canvas / Preview           Layers / Properties
format + state           fit / zoom / guides        Validation / AI edit
selected Creative        renderer preview           Context details
```

- Left: all Creatives in the current Project/CreativeSet, grouped or filtered by format; status and validation badges persist.
- Center: selected CreativeVersion render/preview; selection and element bounds are derived from the Creative Document. Renderer-owned geometry is not directly rewritten by UI convenience controls.
- Right: tabs for Layers, Properties, Validation, and optional AI Edit. Controls appear only for editable document fields and unlocked elements.
- Toolbar: context breadcrumb, version status, undo/version history entry, Fit/Zoom, Validate, Finalize, Export entry.
- AI edits use preview → explicit confirmation → apply. The user remains the final controller.
- Autosave uses ETag/revision control. A `412` conflict freezes local mutation, preserves the local draft, and offers reload/compare—not overwrite.

No advanced editor mechanics are implemented or frozen by PI-4A.

## 9. Creative state and transition model

The UI state is a projection, not a replacement for domain statuses.

| UI state    | Domain mapping                                                                             | Entry                                              | Allowed primary actions                                    |
| ----------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------- |
| `AI_DRAFT`  | generated Creative with a generated/root CreativeVersion and no accepted user edit lineage | generation completes                               | Edit, Validate, Compare                                    |
| `EDITED`    | current `DRAFT` CreativeVersion created/autosaved/applied from the generated ancestor      | a human-confirmed edit changes the current version | Save, Preview, Validate                                    |
| `VALIDATED` | latest run for current version is `PASS` or acknowledged `WARNING`; no later edit          | validation completes                               | Finalize, view details, edit                               |
| `FINAL`     | current version has an `APPROVED` ApprovalRequest tied to the same validation run          | authorized reviewer approves                       | Export, download history; edit creates a new draft/version |

### 9.1 Transition rules

- Editing an `AI_DRAFT` produces or updates a draft and enters `EDITED`.
- Editing a validated or final Creative creates a new draft version; prior validation/approval remains historical and the new current version is `EDITED` with `revalidationRequired=true`.
- `Validate` targets an immutable version snapshot. Results for another version are labeled stale and never gate the current version.
- `Finalize` means freeze the draft, obtain a current PASS/WARNING validation, acknowledge warnings where required, and complete approval under workspace policy. It is not a client-only flag.
- `Reset to AI Draft` means create a new draft derived from the preserved generated ancestor. The current contracts retain parent lineage but do not explicitly mark the AI root; show this action only when generation provenance proves the source version. Otherwise it is unavailable with a reason.
- Final content is not directly edited. `Edit final` starts a new draft version and supersedes pending approvals for the old current version.

## 10. Validation

- Persistent compact status appears in Creative List, editor toolbar, and Project Creatives.
- Right-panel summary shows `PASS`, `WARNING`, or user-facing `FAIL` (mapped from domain `ERROR`; system execution `FAILED` remains `Validation failed to run`).
- Detail view lists rule, message, affected element IDs, source type, confidence where available, and suggested fix.
- Selecting a result highlights supported target elements on the Canvas. Missing target IDs fall back to a non-spatial issue row.
- Open errors block Finalize and Export.
- Open warnings require acknowledgement before approval/export where policy requires it.
- Any edit to the current version makes previous validation stale and requires revalidation.
- The UI explains results but cannot change rule outcome or renderer authority.

## 11. Finalize and export

```text
Validate current version
→ acknowledge warnings / fix errors
→ Finalize (freeze + approval)
→ Export current approved version(s)
→ Download completed files
```

Single- and multi-Creative export are supported through `creativeVersionIds[]`. Eligibility requires the current version, matching approved ApprovalRequest and validation run, no open errors, acknowledged warnings, valid asset licenses, an exportable active format, an export recipe, and no revalidation requirement.

Export states are `QUEUED`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, and `EXPIRED`. Failed exports may retry; active exports may cancel; downloads are shown only for completed files with a signed URL. Partial package results stay visibly incomplete and do not masquerade as a complete package.

## 12. Cross-cutting empty, loading, failure, and recovery behavior

- **Loading:** preserve shell, Context Bar, step position, and last-known non-sensitive summary; skeleton the changing region.
- **Empty:** explain why content is absent and give one context-valid next action. Never use a generic blank canvas.
- **Failure:** retain successful sibling data, show normalized problem code/detail, and scope retry to the failed region.
- **Partial failure:** keep completed generation/export items usable and failed items explicit.
- **Offline/stream loss:** show data age, reconnect SSE, and offer manual refresh.
- **Revision conflict:** preserve local draft, explain the newer server revision, and offer compare/reload.
- **No access:** keep hierarchy visible but hide sensitive records and mutation controls.
- **Navigation recovery:** durable job/version IDs restore work after refresh; unsaved pre-generation input remains only where a persistence contract exists.

## 13. Permissions and ownership

| Capability                     | OWNER / ADMIN | EDITOR                           | REVIEWER                      | VIEWER           |
| ------------------------------ | ------------- | -------------------------------- | ----------------------------- | ---------------- |
| Read Campaign/Project/Creative | yes           | yes                              | yes                           | yes              |
| Configure/generate/edit        | yes           | yes                              | no                            | no               |
| Validate                       | yes           | yes                              | yes                           | read result only |
| Approve/finalize decision      | yes           | no                               | yes                           | no               |
| Create export                  | yes           | current API also allows REVIEWER | yes where route/policy allows | no               |
| Manage Settings/members        | yes           | no                               | no                            | no               |

The UI follows API route roles and workspace policy. Hidden controls are not an authorization boundary; API authorization remains authoritative.

## 14. Responsive information priority

Desktop is the full authoring target. At narrower widths, navigation becomes a menu and side panels become tabs/drawers while preserving information order. The existing editor shell already declares mobile `preview-review-only`; PI-4A keeps full canvas editing out of mobile scope. Mobile may review status, preview, validation, and approval where contracts and roles allow.

## 15. Frozen decisions

- Global navigation is AI Creative, Campaign / Project, Settings.
- Account → Campaign → Project → Creative remains the content hierarchy.
- Assets live inside Campaign/Project context.
- AI Creative has exactly four steps and no separate draft-results page.
- Channel precedes Format; multi-format generation is first-class.
- Editor remains a three-column information structure.
- Renderer owns pixels and validation authority.
- Human approval/final control gates export.
- Project contract gaps are visible and deferred; they do not justify collapsing Campaign and Project.

## 16. Explicit non-decisions

PI-4A does not decide visual tokens, final component variants, animation, exact responsive breakpoints, Project persistence schema, asset-role storage, an AI Copywriter endpoint, or production deployment. These are classified in `PI-4A-OPEN-QUESTIONS.md`.
