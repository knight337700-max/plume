# PI-4B Component Specification

Status: `FROZEN_FOR_PI_4C`

## 1. Component rules

1. Screens import application UI from `@plume/ui`.
2. Direct `@astryxdesign/core` imports are confined to the adapter boundary.
3. Existing wrappers/composites/shells are extended before a new pattern is created.
4. Every interactive component supports default, hover, focus-visible, pressed, disabled, and busy states where meaningful.
5. Domain and availability reasons are content, not implementation details; disabled/unavailable controls expose them.
6. Screen-local CSS may arrange a screen but may not create private colors, typography, radius, elevation, or state semantics.

## 2. Foundational components

| Component          | Anatomy                                          | Variants                                  | Required states                                        | Accessibility contract                                       |
| ------------------ | ------------------------------------------------ | ----------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| Button             | label, optional leading/trailing icon, progress  | primary, secondary, tertiary, destructive | default, hover, focus, active, disabled, busy          | native button, name retained while busy, disabled reason     |
| IconButton         | icon, tooltip, optional status dot               | neutral, selected, destructive            | default through busy                                   | accessible name; tooltip supplemental only                   |
| TextInput/TextArea | label, control, help/error, count                | default, compact                          | empty, filled, focus, invalid, disabled, read-only     | label association; error relation; no placeholder-only label |
| SelectableCard     | check/radio affordance, title, metadata, preview | single, multi                             | default, hover, focus, selected, disabled, unavailable | checked/selected semantics; full-card target                 |
| Badge/StatusDot    | icon/dot, label                                  | neutral, info, success, warning, error    | current state only                                     | visible text for consequential states                        |
| Banner             | icon, title, body, action                        | info, success, warning, error             | static/busy                                            | role selected by urgency; dismiss keyboard-accessible        |
| Progress           | label, numeric/status text, bar                  | determinate, indeterminate, stepped       | queued, running, complete, failed                      | value text includes human status                             |
| Dialog             | heading, body, actions, close                    | standard, destructive                     | opening, open, busy, error                             | modal semantics, initial focus, trap, Escape, focus return   |
| Table/List         | header, row, cells/actions                       | comfortable, compact                      | loading, empty, error, selected, sorted                | semantic table/list; row actions keyboard reachable          |
| Tooltip/Popover    | trigger, layer, optional action                  | info, menu-like                           | open/closed                                            | tooltip is not sole carrier of required information          |

## 3. Navigation and shell

### GlobalAppShell

- Standard width budget: side navigation 256 px, main content flexible.
- Gobanos identity appears once at the top of navigation and remains quieter than the page title. Use the supplied black wordmark on Light and white wordmark on Dark when width permits; never squeeze or crop it into a compact symbol.
- Destinations are `AI Creative`, `Campaign / Project`, and `Settings` only.
- Selected destination uses a filled selected surface, leading indicator or strong border, icon, and semibold label.
- Account/workspace context appears in the lower navigation region or top context region, never as a competing primary nav group.
- Compact mode collapses navigation to an explicit menu/drawer; it does not truncate destination labels into ambiguity.

### Context header

Anatomy: breadcrumb, page title, optional state badge, one primary action, secondary actions in a group/more menu. Campaign/Project target context may be shown, but Project-mutating actions remain unavailable until the first-class contract exists.

### WorkflowStepRail

Four immutable labels: `Creative Setup`, `Channel / Format`, `AI Generate`, `Creative Editor`. Complete uses check + label; current uses accent surface/indicator and `aria-current="step"`; blocked/unavailable includes reason. Clicking a prior step may navigate only when current state can be retained safely.

## 4. Selection systems

### ChannelSelectionCard

Anatomy: channel name, readiness badge, profile count, optional concise reason. Kakao Moment is available because three active profiles exist. Naver GFA, Meta, and Google Ads remain visible and unavailable with `Catalog not ready`; no ghost cards or future format names appear.

Canonical channel codes remain exactly `NAVER_GFA`, `KAKAO_MOMENT`, `META`, and `GOOGLE_ADS`; UI labels do not rename those backend values.

### FormatProfileCard

Anatomy: ratio preview, official profile name, dimensions using `×`, capability/status label, selection control. Multi-selection uses checkbox semantics and persistent selection count. The three active cards are:

1. Kakao Moment Bizboard — `1029 × 258`.
2. Kakao Moment Bizboard Thumbnail Box Right — `1029 × 258`.
3. Kakao Moment Display Native 2:1 — `1200 × 600`.

Only `ACTIVE` catalog profiles returned as selectable can enter generation. Pending, legacy, disabled, feature-dependent, missing, or unknown profiles are unavailable with a reason.

### ProductMatchCard

Thumbnail and product identity dominate. Confidence is supporting metadata, not a quality promise. Selected state includes check, border, and surface. Failure or missing product data supplies a recovery action if supported.

### AssetRecommendationCard / EffectiveAssetPool

Every asset displays thumbnail, name/type, source, eligibility, and optional role only when contract-backed. Source uses icon + text badge: `Campaign — inherited`, `Project — local`, or an honest current-reference label. Inherited items are references, not visual duplicates. The target Effective Asset Pool is sectioned by source and includes an explanation that Project-local persistence is future-contract-required.

## 5. Generation systems

### AsyncJobProgressPanel

The header shows overall status, completed/total count, and one progress representation. Item rows may show per-format observation states, but retry is a single job-level action. On `PARTIAL_SUCCESS`, completed items remain available and failed rows remain visible; the CTA may continue with completed creatives and separately offer `Retry job` when permitted.

| Job state       | Treatment                                      | Available action                |
| --------------- | ---------------------------------------------- | ------------------------------- |
| QUEUED          | Info icon, queued text, indeterminate wait     | Cancel only if contract permits |
| RUNNING         | Progress, current count, polite updates        | Cancel only if permitted        |
| SUCCEEDED       | Success summary and completed rows             | Continue to Editor              |
| PARTIAL_SUCCESS | Warning summary, success + failed row grouping | Continue + job-level Retry      |
| FAILED          | Error summary and attributed guidance          | Job-level Retry if retryable    |
| CANCELLED       | Neutral stopped state                          | Back/reconfigure                |

No per-row retry button is rendered as enabled.

## 6. Validation and lifecycle

### ValidationIssueCard

Anatomy: severity icon, literal state, rule title, affected creative/layer when provided, concise explanation, and next action. `ERROR` displays as UX `FAIL`. Validation execution `FAILED` uses a separate system-failure treatment.

### ApprovalStatusPanel and export summary

Approval, acknowledgement, current-version, and export eligibility are shown as separate facts. A PASS validation does not itself imply approval or export eligibility. Blocking reasons remain visible next to the disabled action.

### CreativeLifecycleCell

| UX state  | Domain evidence                                                                         | Treatment                                     | Actions                                       |
| --------- | --------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| AI_DRAFT  | generated current version with generation provenance and no accepted human edit lineage | neutral/info `AI draft` badge                 | Edit, validate if allowed, inspect provenance |
| EDITED    | current DRAFT revision with accepted human edit lineage                                 | accent `Edited` badge + unsaved/save substate | Continue editing, validate                    |
| VALIDATED | current-version PASS or acknowledged WARNING                                            | success `Validated` badge + validation result | Finalize/request approval                     |
| FINAL     | current version has current APPROVED evidence                                           | strong success `Final` + lock indicator       | Export if eligible; edit creates new version  |

This is a UI projection, not a new backend enum.

## 7. Editor components

### Creative list item

Anatomy: 64 × 40-ish ratio thumbnail area, creative identifier/name, channel/format, UX lifecycle, validation icon/count, updated metadata. Selected uses selected surface, strong left indicator, and `aria-current`/selected semantics. Target row height is 64–76 px; list controls remain compact.

### CreativeCanvasStage

The stage fills all residual width and height. It provides pan/zoom/fit viewport behavior around an artboard whose ratio follows the canonical profile. Renderer preview artifacts are placed without client-side reinterpretation. Loading, artifact failure, selection, validation marker, and read-only states are overlays around—not modifications to—the creative pixels.

### LayerRow

Anatomy: expand affordance if nested, type icon, name, optional validation marker, visibility, lock/read-only state. Selection is persistent and synchronized with the canvas. Reorder, hide, lock, or rename controls are present only when the document contract supports them.

### PropertyGroup

Anatomy: group title, optional capability explanation, fields, inline validation, and group action. Editable controls use normal inputs; renderer-owned values use readable read-only rows with a lock icon and `Renderer-controlled` explanation. Geometry controls never appear editable for `TEMPLATE_LOCKED`.

### EditorToolbarActionMatrix

The toolbar groups History, Viewport, Editing, Assistance, AI, and Finalization. Visibility is frozen in the Editor visual spec. A disabled control always provides a reason; a deferred control is absent from production, not a fake disabled promise.

## 8. Cross-screen state matrix

| State              | Surface treatment                                       | Content                            | Action                                      |
| ------------------ | ------------------------------------------------------- | ---------------------------------- | ------------------------------------------- |
| Empty              | EmptyState in natural content region                    | What is empty and why              | One supported next action                   |
| Loading            | Skeleton matching eventual geometry                     | concise loading label              | no duplicate action                         |
| Refreshing         | Existing content retained, subtle progress              | last known data remains            | optional cancel if supported                |
| Error              | Error banner/inline block                               | attributed failure and safe detail | Retry only if valid                         |
| Retry              | Same failed context retained                            | what will be retried               | job/request-level scope explicit            |
| Disabled           | Control remains visible when prerequisite is actionable | prerequisite                       | route to prerequisite if safe               |
| Unavailable        | Muted block/badge                                       | contract/catalog reason            | no false CTA                                |
| Permission denied  | Locked surface                                          | access reason without leaking data | back/request access if supported            |
| Partial success    | Warning summary + success/failure groups                | preserved completed work           | Continue + scoped retry                     |
| Validation warning | Warning icon/surface/border                             | count and acknowledgement need     | Review/acknowledge                          |
| Validation failure | Fail icon/surface/border                                | blocker and location               | Fix/revalidate                              |
| Unsaved edit       | Persistent status bar text                              | saving/unsaved/error               | retry save or navigate warning              |
| Read-only          | Normal legible values + lock label                      | why read-only                      | supported alternate action                  |
| Frozen/final       | Strong lifecycle badge + lock                           | current version/final evidence     | export or create new version                |
| Reconnecting       | Retain content, info banner                             | connection state                   | automatic recovery + manual retry if needed |

## 9. Content guidelines

- Use direct verbs: `Generate 3 creatives`, `Validate`, `Finalize`, `Export`.
- Use exact unavailable reasons: `Catalog not ready`, `Project contract required`, `Renderer-controlled`.
- Do not say “AI decided” when the system generated a draft.
- Do not use success language for queued work.
- Counts and dimensions are always explicit.
- Avoid exposing raw backend enum names except in diagnostic/admin contexts.

## 10. Light/Dark component parity

Theme changes presentation, never component anatomy, capability, contract state, responsive behavior, or action hierarchy.

| Pattern/state               | Light treatment                               | Dark treatment                                           | Invariant cue                                         |
| --------------------------- | --------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------------- |
| Global shell                | White nav over light app body; black wordmark | `#1B1E24` nav over `#121418`; white wordmark             | Selected indicator + label; accessible name `Gobanos` |
| Card/list default           | White/neutral surface, default border         | Tonal surface `#1B1E24`/`#22262D`, `#343A45` border      | Same hierarchy and row geometry                       |
| Hover                       | Light subtle overlay                          | Dark lighter tonal overlay                               | No layout movement                                    |
| Selected                    | `#EEF3FF`, accent border/check                | `#26365F`, light accent border/check                     | Check/indicator + selected semantics                  |
| Disabled                    | Muted surface/text                            | Dark muted surface/text with reason at readable contrast | Disabled attribute + reason                           |
| Unavailable                 | Subtle surface and availability badge         | Dark subtle surface and availability badge               | Literal contract/catalog reason                       |
| Focus visible               | `#3157C8` 2 px ring                           | `#9DB2FF` 2 px ring                                      | 3 px offset and keyboard visibility                   |
| Dialog/popover/toast        | Elevated white, restrained shadow             | Elevated tonal surface, border-first separation          | Layer semantics and focus behavior                    |
| Validation PASS             | Green muted surface/border/icon/text          | Dark green-muted surface + bright green icon/text        | `PASS` label and check icon                           |
| Validation WARNING          | Amber muted surface/border/icon/text          | Dark amber-muted surface + bright amber icon/text        | `WARNING` label and warning icon                      |
| Validation FAIL             | Red muted surface/border/icon/text            | Dark red-muted surface + bright red icon/text            | `FAIL` label and error icon                           |
| Validation execution failed | Error system surface                          | Dark error system surface                                | “Validation could not run”; never rule FAIL           |

### 10.1 Asset state parity

| Asset state              | Light treatment                      | Dark treatment                                   | Invariant cue                                                      |
| ------------------------ | ------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------ |
| Campaign Asset           | Light card/row + thumbnail           | Dark primary/secondary row + thumbnail           | Current reference/source text + eligibility                        |
| Inherited Campaign Asset | Light source section/badge           | Dark tonal source section/badge                  | Link/source icon + `Inherited from Campaign` + Campaign metadata   |
| Project Asset target     | Light unavailable target section     | Dark unavailable target section                  | Folder/project icon + `FUTURE_CONTRACT_REQUIRED`; no active upload |
| Selected                 | Light selected surface/accent border | `#26365F` + light accent border                  | Check + selected semantics                                         |
| Unavailable              | Muted light surface/content          | Muted dark surface/content                       | Exact disabled/unavailable reason                                  |
| Invalid                  | Light error-muted surface/border     | Dark error-muted surface + bright error border   | Error icon + textual blocker + retained metadata                   |
| Uploading                | Light progress surface               | Dark info/progress surface                       | Progress + filename/state; only with supported upload contract     |
| Processing               | Light info status                    | Dark info-muted surface + bright info foreground | Progress/spinner + persistent source metadata                      |

Inherited versus local never relies on color and inherited assets are not visually duplicated.

### 10.2 Channel and format parity

| Format state      | Light treatment                         | Dark treatment                               | Contract cue                                |
| ----------------- | --------------------------------------- | -------------------------------------------- | ------------------------------------------- |
| Default           | White card + default border             | `#1B1E24` card + `#343A45` border            | Name, dimension, capability/status          |
| Hover             | Light hover surface                     | `#252A34` tonal hover                        | No selection implied                        |
| Selected          | `#EEF3FF` + accent border/check         | `#26365F` + light accent border/check        | Multi-select semantics and count            |
| Disabled          | Muted light content                     | Muted dark content with controlled contrast  | Prerequisite reason                         |
| Catalog Not Ready | Subtle card/channel + unavailable badge | Dark subtle card/channel + unavailable badge | Literal `Catalog not ready`; not selectable |
| Unavailable       | Disabled surface + reason               | Dark disabled surface + reason               | No enabled action                           |

Only the three active Kakao profiles are selectable; Naver, Meta, and Google remain at zero active profiles.

Dark mode must not increase contrast on disabled cards until they resemble active cards.

### 10.3 Theme setting control target

PI-4C may compose verified Selector, RadioList, or SegmentedControl primitives for `System`, `Light`, and `Dark`. The control requires selected semantics, accessible naming, persistence, OS preference handling, and a no-flash startup strategy. This section does not claim an installed Astryx theme prop.
