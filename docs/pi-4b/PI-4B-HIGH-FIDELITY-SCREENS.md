# PI-4B High-Fidelity Screen Specifications

Status: `10_OF_10_COMPLETE`

Target appearance: Light, desktop-first

Global principle: AI First Draft + Human Final Control

## Reading this specification

Each screen freezes layout, visual hierarchy, component composition, representative state, responsive change, and contract disclosure. Pixel-perfect implementation is PI-4C work; product meaning and state truth are frozen here.

Common frame unless explicitly replaced by the Editor:

- 256 px `GlobalAppShell` navigation.
- 56 px header/context region.
- Flexible main workspace with 24–32 px gutter.
- One page `h1`, one primary action region, neutral body background.
- At widths below 1024 px, secondary panels swap to drawers and navigation collapses.

## Screen 1 — Global Shell

### Layout and hierarchy

`Sidebar 256 | Main workspace flexible`. Sidebar order: Gobanos identity, primary navigation, contextual account/workspace switcher, utility/profile area. Main order: breadcrumb/context, page title and primary action, content.

The supplied GobanOS wordmark occupies no more visual weight than a 24 px page title. Use the black source asset on Light and white source asset on Dark. Navigation labels are `AI Creative`, `Campaign / Project`, and `Settings`. The selected item has selected surface, 3 px leading indicator, icon, semibold label, and current-page semantics.

### Components and tokens

`GlobalAppShell`, Astryx-composed SideNav/TopNav/Breadcrumbs, `PlumeHeading`, `PlumeButton`, `PlumeBadge`, Popover/Dialog for context selection. Surfaces: app body, primary navigation, one divider. Page gutter `space.6` expanded and `space.4` compact.

### States

- Workspace loading retains shell geometry and skeletons only the context label.
- Permission denied replaces main content, never leaks campaign/project names.
- Global reconnecting status appears as an info banner below the header, not an unlabelled dot.
- Notifications/activity are not added unless their durable source exists.

### Responsive

At compact widths, navigation swaps to an explicit menu/drawer. At small widths the header stacks title/actions, maintaining one visible primary action. No icon-only unknown destinations.

No compact Gobanos mark exists. When the wordmark cannot fit at its minimum width, hide the artwork without cropping it, preserve the accessible product name in the menu control/navigation landmark, and record `FUTURE_BRAND_ASSET_REQUIRED: COMPACT_MARK`.

## Screen 2 — AI Creative / Step 1 Creative Setup

### Layout and hierarchy

Main column is capped for readable setup; an optional right summary remains subordinate. Order:

1. Four-step `WorkflowStepRail`, Step 1 active.
2. Account → Campaign → Project context block.
3. Product selection.
4. Effective Asset Pool.
5. Copy input and AI Copy secondary action.
6. Readiness summary and `Next` primary CTA.

### Effective Asset Pool

Campaign assets appear in an `Inherited from Campaign` section with link/source icon and textual badge. A separate `Project-local assets` target section is visible only as an unavailable target with `Project contract required`; it does not show upload/add as live. Inherited assets are references and appear once.

### Copy and readiness

Manual copy input is visually specified but labelled `TARGET_UX` when persistence cannot be proven. `Generate copy with AI` is secondary and unavailable with an explanation until a supported route exists. The readiness block lists selected product, eligible assets, copy state, and context; each missing prerequisite has a link/action where supported.

### Components and states

Use `WorkflowStepRail`, `ProductMatchCard`, `AssetRecommendationCard`/`EffectiveAssetPool`, PLUME form wrappers, Badge/Banner, and one `Next` button. Incomplete state keeps `Next` disabled and lists reasons. Loading skeletons preserve product/card geometry. Asset failure is scoped to the pool and does not clear confirmed product/copy inputs.

### Contract note

`Project_backend_contract: NOT_IMPLEMENTED`. A preloaded target context may be displayed as target UX, but Project create/edit/select and Project-local persistence are unavailable. CreativeSet is not labelled Project.

### Responsive

The optional summary moves inline below inputs under 1024 px. Asset cards reduce columns, then become a vertical list. The workflow rail becomes a compact horizontal step summary without changing the four steps.

## Screen 3 — AI Creative / Step 2 Channel / Format

### Layout and hierarchy

Stepper with Step 2 active, then channel selector, format region, persistent selection summary, and footer actions. Channel cards occupy one row on standard desktop. Kakao Moment is selected/available; Naver GFA, Meta, and Google Ads show `Catalog not ready` and are not interactive format selectors.

### Active format cards

| Card                                      | Ratio preview                      |    Dimension | State      |
| ----------------------------------------- | ---------------------------------- | -----------: | ---------- |
| Kakao Moment Bizboard                     | wide strip                         | `1029 × 258` | selectable |
| Kakao Moment Bizboard Thumbnail Box Right | wide strip with thumbnail-side cue | `1029 × 258` | selectable |
| Kakao Moment Display Native 2:1           | 2:1 rectangle                      | `1200 × 600` | selectable |

Each card has checkbox semantics, full-card focus, name, dimensions, and capability/status. Multi-selection is supported. Selected cards use check, selected surface, and strong border—not color alone.

### Action region

Sticky within the content region when useful: `3 formats selected` and primary `Generate 3 Creatives`. The count follows actual selection. Back is secondary. Zero selection disables Generate and states `Select at least one active format`.

### States and contract note

Catalog loading skeletons cards. Unknown or non-active profiles fail closed. No speculative Naver, Meta, or Google format names/cards. Cross-channel arrays remain architecturally supported, but baseline practical output is Kakao-only.

### Responsive

Channel cards become a two-column then vertical list. Format cards preserve preview ratios and become one column under compact width. Selection summary stays visible after the cards, not as an overlay hiding content.

## Screen 4 — AI Creative / Step 3 AI Generate

### Layout and hierarchy

Stepper with Step 3 active. A compact Input Review summarizes Campaign/target Project context, product, assets, copy, and selected profiles. The main region is `AsyncJobProgressPanel`; final actions appear after the result summary.

### State presentations

- `QUEUED`: info icon, queued label, indeterminate progress, submitted time.
- `RUNNING`: determinate count where available, current activity text, per-format observation rows.
- `SUCCEEDED`: success summary, completed thumbnails/rows, primary `Continue to Editor`.
- `PARTIAL_SUCCESS`: warning summary, completed and failed groups, primary `Continue with completed`, secondary `Retry job`.
- `FAILED`: attributed error, preserved Input Review, job-level `Retry job` only when retryable.
- `CANCELLED`: neutral state with Back/reconfigure.

Per-format rows communicate observation only. They never expose an enabled per-item network retry. Completed work remains visible during partial success.

### Components and tokens

`WorkflowStepRail`, `AsyncJobProgressPanel`, ProgressBar, StatusDot/Badge, Thumbnail/Card/List, Banner, and PLUME buttons. Status surfaces use icon + literal status + semantic border.

### Responsive

Input Review collapses to an accessible disclosure after submission. Item rows stack status beneath profile information. Progress and primary action remain visible without horizontal scrolling.

## Screen 5 — AI Creative / Step 4 Creative Editor

### Layout and hierarchy

This screen replaces the management shell with `CreativeEditorShell`:

```text
64 icon rail | 232 Creative List | resize | Canvas (min 640) | resize | 380 Inspector
```

Toolbar and version status frame the work area. Canvas receives all residual space and strongest contrast. The artboard ratio derives from the selected canonical profile.

### Left — Creative List

Dense items show thumbnail, format/channel, UX lifecycle, validation marker, and updated time. The selected item uses a strong leading indicator, selected surface, and accessible selected state. Filters are limited to contract-backed status/format data.

### Center — Canvas / Preview

Stage uses `color.surface.canvas`; artboard uses primary surface, strong border, low shadow. Fit and zoom are viewport controls. Renderer artifacts are not redrawn or silently corrected in the browser. Selection outlines and validation markers sit outside/over the artifact and identify the selected layer without changing pixels.

### Right — Layers / Properties / Validation

Layers and Properties are visible as a segmented/tabbed inspector when space requires; the selected layer synchronizes with canvas. Editable fields use normal controls. Renderer-owned geometry uses readable locked rows with `Renderer-controlled`. Validation summary leads to issue details and affected layers when evidence exists.

### Toolbar and finalization

Viewport controls are enabled. Unsupported history/assistance functions are absent or disabled according to `PI-4B-EDITOR-VISUAL-SPEC.md`. `Validate` is enabled only for a current mutable version with supported validation. `Finalize` and `Export` follow validation, approval/current-version, and eligibility truth.

`AI Draft` and `Current` are status/provenance concepts in the same page. `Reset to AI Draft` appears only when a proven generated ancestor exists and confirmation describes that a new/current version may be created. There is no separate AI Draft page.

### States

Artifact loading preserves stage and artboard ratio. Preview/render failure shows an attributed overlay around the artboard with Retry if supported; it is not a validation FAIL. Unsaved/saving/save-error is persistent in `VersionStatusBar`. Final state displays lock and preserves Export entry if eligible.

### Responsive

- Expanded: all regions visible.
- Standard: all regions visible; list/inspector use fixed budgets.
- Compact 1024–1279: left and right panels become mutually exclusive drawers/tabs; canvas remains at least 640 px.
- Below 1024: limited preview/review mode; full geometry editing is not promised.

## Screen 6 — Campaign Overview

### Layout and hierarchy

Context header shows Account → Campaign and campaign identity/status. Tabs are `Overview`, `Assets`, `Projects`. Overview uses two strong content sections rather than a grid of decorative cards:

1. Asset summary with eligible/reference counts and `View Assets`.
2. Project target summary/list with availability disclosure and `Project contract required` where actions would mutate Project.

Campaign metadata appears as a compact `MetadataList`. Primary action is a supported campaign action only; unsupported `Create Project` remains unavailable or absent. Recent activity is omitted unless a durable source exists.

### States and responsive

Empty Assets guides to current supported asset/reference management. Project area can show a target empty structure but no live create/edit claim. On compact width, summary columns stack and tabs remain horizontally scrollable with visible labels.

## Screen 7 — Campaign Assets

### Layout and hierarchy

Campaign header/tabs, then search/filter/sort controls, eligibility summary, and asset grid/list toggle if already supported. Asset cards prioritize thumbnail, then name/type, source/reference, eligibility, optional role, and metadata. Upload/add is visible only when the current Campaign asset contract supports that exact action; otherwise the surface explains current reference behavior.

### States

- Loading uses ratio-preserving thumbnail skeletons.
- Empty explains whether no assets or no filter matches exist.
- Per-item unavailable/license state uses badge + text and removes it from selection.
- Page failure retains filters and shows Retry.
- Missing role taxonomy omits the role instead of displaying `Unknown` as a false category.

### Responsive

Grid moves from four/three columns to two/one based on available content width. Filters move into a labelled drawer at compact width. Metadata never overlays the thumbnail.

## Screen 8 — Project Overview

### Target visual design

The target shell is Campaign context → Project identity, with tabs `Overview`, `Assets`, `Creatives`. Overview contains project brief/context, Effective Asset Pool summary, and creative summary. The entire target is marked in specification as `TARGET_UX`.

### Current contract disclosure

```yaml
Project_backend_contract: NOT_IMPLEMENTED
```

Until the contract exists, the production screen must resolve to an unavailable/read-only state that explains `Project contract required`. It must not expose enabled create, edit, archive, asset mutation, or generation binding. A CreativeSet may not be renamed or visually presented as Project.

### Responsive

The unavailable/read-only explanation remains first after the heading. Target summary sections stack at compact width; this does not change the contract guard.

## Screen 9 — Project Assets

### Target visual design

Two explicit sections produce the Effective Asset Pool:

1. `Inherited from Campaign` — chain/link icon, source badge, Campaign name/reference metadata, and no duplicate upload indicator.
2. `Project-local assets` — folder/project icon, local badge, and target add/upload action only after contract support.

Section headings, source labels, icons, and metadata distinguish origin beyond color. A compact explanatory formula can state `Effective pool = inherited references + project-local assets − contract-backed exclusions`; it is target semantics, not current computation proof.

### Current behavior

Project-local area is unavailable and labelled `FUTURE_CONTRACT_REQUIRED`. Inheritance mode, deduplication, override/hide, parent-removal behavior, roles, and usage counts are not invented. Campaign references are not copied into local visual cards.

### Responsive

Sections remain separate and stack naturally. Source badges remain visible before secondary metadata. Selection and bulk actions are absent when contract support is absent.

## Screen 10 — Project Creatives

### Target visual design

Project header/tabs, filter/sort controls, then a list or grid. Each creative shows renderer preview, channel, canonical format and dimensions, UX lifecycle projection, validation state/count, updated time, and export eligibility. `Open in Editor` is the row/card primary action; Export is secondary and conditional.

### Contract guard

Project binding uses first-class Project evidence only. Temporary CreativeSet grouping may support a clearly labelled partial read-only mapping, but cannot be presented as equivalent. Superseded/archived history defaults remain unresolved and filters must not claim a policy before OQ-15 is decided.

### States and responsive

Empty explains whether no current mapping exists or filters exclude results. Loading preserves preview ratios. Failed preview is distinct from validation FAIL. Compact mode changes grid to list and moves secondary metadata into a disclosure; lifecycle, validation, and export eligibility stay visible.

## Coverage matrix

|   # | Screen            | High-fidelity hierarchy | Component mapping | States   | Responsive | Contract guard          |
| --: | ----------------- | ----------------------- | ----------------- | -------- | ---------- | ----------------------- |
|   1 | Global Shell      | Complete                | Complete          | Complete | Complete   | Complete                |
|   2 | Creative Setup    | Complete                | Complete          | Complete | Complete   | Project/asset/copy gaps |
|   3 | Channel / Format  | Complete                | Complete          | Complete | Complete   | 3 active Kakao only     |
|   4 | AI Generate       | Complete                | Complete          | Complete | Complete   | Job-level retry         |
|   5 | Creative Editor   | Complete                | Complete          | Complete | Complete   | Renderer authority      |
|   6 | Campaign Overview | Complete                | Complete          | Complete | Complete   | Project gap/activity    |
|   7 | Campaign Assets   | Complete                | Complete          | Complete | Complete   | Reference/role truth    |
|   8 | Project Overview  | Complete                | Complete          | Complete | Complete   | Not implemented         |
|   9 | Project Assets    | Complete                | Complete          | Complete | Complete   | Inheritance/local gap   |
|  10 | Project Creatives | Complete                | Complete          | Complete | Complete   | CreativeSet partial     |

Total: **10 / 10 complete**.

## Light/Dark treatment matrix

Theme never changes route behavior, contract availability, workflow step, responsive breakpoint, or action enablement.

|   # | Screen            | Light behavior                                        | Dark behavior                                                 | Gobanos presence                  | Behavior difference                       |
| --: | ----------------- | ----------------------------------------------------- | ------------------------------------------------------------- | --------------------------------- | ----------------------------------------- |
|   1 | Global Shell      | Light app body, white nav, black wordmark             | `#121418` body, dark nav, white wordmark                      | Persistent when width permits     | None                                      |
|   2 | Creative Setup    | Light form/summaries and asset cards                  | Tonal dark groups with readable form borders                  | Shell only                        | None; Project/copy gaps unchanged         |
|   3 | Channel / Format  | Light selectable cards and muted unavailable channels | Dark cards use tonal borders; disabled never resembles active | Shell only                        | None; Kakao 3 only                        |
|   4 | AI Generate       | Light progress/status surfaces                        | Dark semantic progress/status surfaces                        | Shell only                        | None; retry remains job-level             |
|   5 | Creative Editor   | Mid-neutral stage, light panels, renderer artboard    | Near-black stage, dark panels, renderer artboard unchanged    | Subordinate shell/header presence | None; three-column/capabilities unchanged |
|   6 | Campaign Overview | Light content sections/table/list                     | Dark tonal sections with border-first separation              | Shell only                        | None; Project gap unchanged               |
|   7 | Campaign Assets   | Light asset grid and source badges                    | Dark asset grid with identical source/icon labels             | Shell only                        | None                                      |
|   8 | Project Overview  | Light unavailable/target disclosure                   | Dark unavailable/target disclosure at readable contrast       | Shell only                        | None; contract remains absent             |
|   9 | Project Assets    | Light inherited/local sections                        | Dark inherited/local sections with same labels/icons          | Shell only                        | None; local target unavailable            |
|  10 | Project Creatives | Light previews, lifecycle, validation                 | Dark chrome around unchanged previews                         | Shell only                        | None; Project binding remains guarded     |

## High-risk theme detail

### Global Shell

Light uses the exact black SVG wordmark; Dark uses the exact white SVG. The wordmark has no accent recolor, filter, symbol, or animation. Selected navigation and focus use theme accent tokens. On compact layouts the brand region collapses before the wordmark is distorted.

### Channel / Format

Light and Dark preserve the same full-card focus, checkbox state, name, dimensions, and availability reason. Dark selected cards use light accent border/check plus `color.surface.selected`; unavailable channels use lower emphasis, an unavailable badge, and `Catalog not ready`. Only Kakao Moment Bizboard, Bizboard Thumbnail Box Right, and Display Native 2:1 can be selected.

### Creative Editor

Dark changes application chrome, panel surfaces, toolbar, stage, selection/focus outlines, and semantic validation surfaces. It never filters or recolors Renderer pixels. The artboard edge uses a strong dark-theme border and low neutral separation; Canvas remains larger and more visually dominant than panels.

### Campaign / Project Assets

Light and Dark both separate `Inherited from Campaign` and `Project-local assets` through section, source text, badge, icon, and metadata. Dark mode does not replace those cues with color. Project-local upload remains unavailable until the contract exists.

### Validation surfaces

PASS, WARNING, FAIL, and execution failure each use literal text, icon, theme semantic color, muted surface, and border. Layer/canvas indicators retain accessible contrast in both themes. Execution failure remains “Validation could not run,” not domain rule FAIL.

## Responsive/theme invariant

Expanded (≥1600), Standard (1280–1599), Compact (1024–1279), and Limited (<1024) behaviors are identical in Light and Dark. Window resizing must recompose sidebar/panels to drawer/tab/overlay states while preserving Canvas priority. PI-4C requires an actual browser-resize E2E check for both themes.
