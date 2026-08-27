# PI-4B Astryx Verified Mapping

Status: `VERIFIED`

Official review date: `2026-08-27`

Repository truth: `@astryxdesign/core@0.1.9`, `@astryxdesign/theme-neutral@0.1.9`, `@astryxdesign/cli@0.1.9`

## 1. Sources and precedence

| Source                       | Location                                              | Finding                                                                                                                                   |
| ---------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Official homepage            | <https://astryx.atmeta.com/>                          | Astryx is a beta React 19+/StyleX design system with accessible, themeable components.                                                    |
| Official component catalog   | <https://astryx.atmeta.com/components>                | Current public catalog groups action, container, content, input, status, layout, navigation, overlay, table/list, and utility components. |
| Official token reference     | <https://astryx.atmeta.com/docs/tokens>               | Semantic CSS variables cover color, focus, radius, typography, shadows, motion, spacing, and sizes.                                       |
| Official layout guidance     | <https://astryx.atmeta.com/docs/layout>               | AppShell/Layout/LayoutPanel and fixed region budgets are recommended for multi-region tools.                                              |
| Repository package manifests | `apps/web/package.json`, `packages/ui/package.json`   | Exact installed family is `0.1.9`; app theme is `neutral`.                                                                                |
| Repository lock              | `pnpm-lock.yaml`, `apps/web/astryx-runtime-lock.yaml` | All three Astryx packages are exactly aligned at `0.1.9`; upgrade requires a separate PR.                                                 |
| Repository adapter           | `packages/ui/src/astryx/index.ts`                     | 49 named core exports are available through the PLUME boundary.                                                                           |
| Repository CSS               | `apps/web/src/styles/astryx.css`                      | Reset, core CSS, and neutral theme are loaded in explicit CSS layers.                                                                     |

The public site has evolved beyond the repository's locked version and advertises components that may not exist in `0.1.9`. Therefore:

1. Official pages establish design-system intent and that a component family exists in the current public catalog.
2. The installed lock and `packages/ui` adapter establish PI-4C implementation truth.
3. A public component not present in the adapter is not treated as available.
4. No prop or behavior is inferred from current public docs for installed `0.1.9` without local type/source verification.

## 2. Verified direct adapter exports

The following 51 aliases are literally exported from `packages/ui/src/astryx/index.ts` and therefore count as `ASTRYX_DIRECT` capabilities. Application screens should still prefer PLUME wrappers from the `@plume/ui` public barrel.

| Family             | Verified aliases                                                                                                                                                                                                     |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Actions            | `AstryxButton`, `AstryxButtonGroup`, `AstryxDropdownMenu`, `AstryxIconButton`, `AstryxMoreMenu`, `AstryxSegmentedControl`, `AstryxToolbar`                                                                           |
| Containers/content | `AstryxCard`, `AstryxCollapsible`, `AstryxEmptyState`, `AstryxHeading`, `AstryxIcon`, `AstryxText`, `AstryxThumbnail`                                                                                                |
| Inputs/selection   | `AstryxCheckboxInput`, `AstryxFileInput`, `AstryxMultiSelector`, `AstryxRadioList`, `AstryxSelectableCard`, `AstryxSelector`, `AstryxSlider`, `AstryxSwitch`, `AstryxTextArea`, `AstryxTextInput`, `AstryxTypeahead` |
| Feedback/status    | `AstryxBadge`, `AstryxBanner`, `AstryxProgressBar`, `AstryxSkeleton`, `AstryxSpinner`, `AstryxStatusDot`                                                                                                             |
| Layout/navigation  | `AstryxAppShell`, `AstryxBreadcrumbs`, `AstryxLayout`, `AstryxLayoutContent`, `AstryxLayoutPanel`, `AstryxPagination`, `AstryxResizeHandle`, `AstryxSideNav`, `AstryxTabList`, `AstryxTopNav`                        |
| Overlay            | `AstryxDialog`, `AstryxOverlay`, `AstryxPopover`, `AstryxToast`, `AstryxTooltip`                                                                                                                                     |
| Data/utility       | `AstryxList`, `AstryxMetadataList`, `AstryxTable`, `AstryxTreeList`, `AstryxVisuallyHidden`                                                                                                                          |
| Provider           | `AstryxProvider` wrapping verified `LayerProvider`                                                                                                                                                                   |

Count: **51** core component aliases plus the separately counted provider boundary. The final Gate count records `direct_components: 51` to avoid mixing infrastructure providers into the component total.

## 3. Existing PLUME wrapper and composition inventory

### Primitive wrappers

The repository already supplies PLUME-owned wrappers for actions, content, status, forms, selection, layout, overlays, data, and feedback. These wrappers normalize defaults, add disabled reasons and accessibility wiring, expose panel width presets, and mark PLUME component boundaries. PI-4C must extend them instead of importing Astryx directly in screens.

### Existing composed patterns

| Pattern                   | Primary Astryx basis               | Ownership       | Current export | State coverage                                        |
| ------------------------- | ---------------------------------- | --------------- | -------------- | ----------------------------------------------------- |
| `WorkflowStepRail`        | progress/status/content primitives | ASTRYX_COMPOSED | Yes            | idle, active, complete, blocked, unavailable          |
| `AsyncJobProgressPanel`   | ProgressBar, status, actions       | ASTRYX_COMPOSED | Yes            | queued, running, partial, complete, failed, cancelled |
| `VersionStatusBar`        | Badge/StatusDot/Text               | ASTRYX_COMPOSED | Yes            | save, render, validation combinations                 |
| `ChannelSelectionCard`    | SelectableCard/Badge               | ASTRYX_COMPOSED | Yes            | selected, available, unavailable                      |
| `FormatProfileCard`       | SelectableCard/Badge/metadata      | ASTRYX_COMPOSED | Yes            | active, pending, unavailable, selected                |
| `ProductMatchCard`        | SelectableCard/Thumbnail           | ASTRYX_COMPOSED | Yes            | match selection and confidence display                |
| `AssetRecommendationCard` | Card/Thumbnail/Badge               | ASTRYX_COMPOSED | Yes            | recommended, available, preferred, excluded           |
| `ValidationIssueCard`     | Banner/Card/status                 | ASTRYX_COMPOSED | Yes            | error, warning, info                                  |
| `ApprovalStatusPanel`     | status/actions                     | ASTRYX_COMPOSED | Yes            | pending, approved, rejected, blocked, not-ready       |
| `ExportPackageSummary`    | list/status/actions                | ASTRYX_COMPOSED | Yes            | eligible, blocked, pending                            |
| `AuthWorkspaceShell`      | AppShell/layout                    | ASTRYX_COMPOSED | Yes            | standard shell slots                                  |
| `GlobalAppShell`          | AppShell/navigation                | ASTRYX_COMPOSED | Yes            | navigation/context slots                              |
| `CampaignWorkShell`       | AppShell/layout/navigation         | ASTRYX_COMPOSED | Yes            | campaign tab/context slots                            |
| `CreativeEditorShell`     | AppShell/LayoutPanel/ResizeHandle  | ASTRYX_COMPOSED | Yes            | fixed three-column regions                            |
| `ReviewShell`             | AppShell/layout                    | ASTRYX_COMPOSED | Yes            | review and decision slots                             |

Count: **15 existing composed patterns**.

## 4. Required target custom patterns

These patterns encode PLUME domain or canvas behavior not represented by a verified single Astryx export. They remain composed from `@plume/ui` where possible.

| Pattern                     | Ownership    | Why custom                                              | PI-4C guard                                      |
| --------------------------- | ------------ | ------------------------------------------------------- | ------------------------------------------------ |
| `EffectiveAssetPool`        | PLUME_CUSTOM | Inheritance/source/provenance grouping                  | Must not imply Project-local persistence         |
| `CreativeCanvasStage`       | PLUME_CUSTOM | Renderer artifact, zoom, fit, stage transforms          | Browser is viewport only, not renderer authority |
| `ArtboardFrame`             | PLUME_CUSTOM | Exact format ratio, preview boundary, selection overlay | Preserve canonical dimensions                    |
| `CanvasSelectionOverlay`    | PLUME_CUSTOM | Element highlight and editable/read-only handles        | Handles follow capability matrix                 |
| `EditorToolbarActionMatrix` | PLUME_CUSTOM | Action visibility derived from contract capability      | Unsupported actions stay disabled/deferred       |
| `LayerRow`                  | PLUME_CUSTOM | Layer type, visibility, lock, validation state          | No unsupported geometry mutation                 |
| `PropertyGroup`             | PLUME_CUSTOM | Mixed editable/read-only fields and reasons             | Contract-driven enablement                       |
| `GenerationItemMatrix`      | PLUME_CUSTOM | Per-format observation under job-level retry            | No per-item network retry control                |
| `CreativeLifecycleCell`     | PLUME_CUSTOM | UX lifecycle projection over domain evidence            | No new persisted enum                            |

Count: **9 target PLUME custom patterns**.

## 5. Native browser responsibilities

| Pattern                           | Ownership      | Reason                                                                 |
| --------------------------------- | -------------- | ---------------------------------------------------------------------- |
| Artboard image/media presentation | NATIVE_BROWSER | Semantic `img`/media behavior, intrinsic dimensions, alt strategy      |
| File drag-and-drop boundary       | NATIVE_BROWSER | Native file input/drop events wrapped by PLUME/Astryx UI               |
| Canvas viewport transform surface | NATIVE_BROWSER | CSS transform/pointer/keyboard mechanics inside a PLUME custom pattern |

Native ownership does not authorize unstyled raw controls when a verified Astryx wrapper exists.

## 6. Pattern-to-component mapping

| PLUME pattern            | Astryx primitive                      | Ownership       | Current export                    | State coverage                    | Notes                                      |
| ------------------------ | ------------------------------------- | --------------- | --------------------------------- | --------------------------------- | ------------------------------------------ |
| Primary/secondary action | Button                                | ASTRYX_DIRECT   | `PlumeButton`                     | default through busy/error reason | One primary per region                     |
| Icon action              | IconButton + Tooltip                  | ASTRYX_COMPOSED | `PlumeIconButton`, `PlumeTooltip` | default through disabled          | Accessible name mandatory                  |
| Shell navigation         | AppShell + SideNav + TopNav           | ASTRYX_COMPOSED | `GlobalAppShell` + direct aliases | selected/unavailable              | Preserve three global destinations         |
| Breadcrumb/context       | Breadcrumbs + Text/Badge              | ASTRYX_COMPOSED | direct aliases                    | current/ancestor                  | Project gap disclosed                      |
| Workflow steps           | Progress/status/content               | ASTRYX_COMPOSED | `WorkflowStepRail`                | five states                       | Four steps only                            |
| Channel/format selection | SelectableCard + Badge                | ASTRYX_COMPOSED | existing cards                    | selected/unavailable              | Only active profiles selectable            |
| Asset tile               | Card + Thumbnail + Badge              | ASTRYX_COMPOSED | recommendation card basis         | loading/error/source/selected     | Source label beyond color                  |
| Data list/table          | Table/List/Pagination                 | ASTRYX_DIRECT   | PLUME wrappers                    | empty/loading/error/sorted        | Responsive list swap allowed               |
| Generation progress      | ProgressBar + status/actions          | ASTRYX_COMPOSED | `AsyncJobProgressPanel`           | queued through failed             | Retry is job-level                         |
| Editor shell             | AppShell + LayoutPanel + ResizeHandle | ASTRYX_COMPOSED | `CreativeEditorShell`             | expanded/standard/compact         | 64 + 232 + stage + 380 budgets             |
| Canvas stage             | Layout + browser transform surface    | PLUME_CUSTOM    | No dedicated export               | loading/ready/selected/error      | Renderer artifact is authoritative         |
| Layer tree               | TreeList + custom row                 | PLUME_CUSTOM    | primitives only                   | selected/locked/hidden/issue      | Reorder only if contract supports          |
| Property editor          | inputs + Collapsible                  | PLUME_CUSTOM    | primitives only                   | editable/read-only/invalid/busy   | Capability reason visible                  |
| Validation issue         | Banner/Card/status                    | ASTRYX_COMPOSED | `ValidationIssueCard`             | error/warning/info                | Domain ERROR projects to FAIL              |
| Lifecycle/version        | Badge/StatusDot/Text                  | ASTRYX_COMPOSED | `VersionStatusBar`                | draft/edit/validate/final         | UX projection, not persisted enum          |
| Modal confirmation       | Dialog + Button                       | ASTRYX_COMPOSED | `PlumeDialog`                     | open/busy/error                   | Focus trap/return expected                 |
| Toast                    | Toast                                 | ASTRYX_DIRECT   | `PlumeToast`                      | info/success/warning/error        | Never sole confirmation for critical state |
| Empty state              | EmptyState                            | ASTRYX_DIRECT   | `PlumeEmptyState`                 | empty/unavailable                 | Explain next available action              |

## 7. Token verification

The repository currently aliases Astryx background, text, icon, border, blue accent, success/warning/error, spacing, size, radius, shadow, duration, and easing variables in `plume-theme.css`. The official token page confirms the same semantic families in the public system. PI-4B does not claim that every current public token literal or helper API exists in installed `0.1.9`.

## 8. Upgrade and discrepancy policy

- Do not upgrade Astryx in PI-4C as a side effect of implementing this design.
- Any upgrade is a separate PR with doctor, visual, accessibility, and adapter verification.
- Public examples for components absent from the adapter are references only.
- If `0.1.9` lacks a required visual state, implement a PLUME wrapper/composition using verified primitives, record the gap, and keep direct Astryx imports inside `packages/ui`.
- Do not fabricate component props. Read installed types or CLI output for `0.1.9` before implementation.

## 9. Gobanos identity and theme mapping supplement

Gobanos is the user-facing product identity; `@plume/ui`, PLUME token aliases, and adapter names remain authorized technical identifiers. The supplied horizontal wordmark is a design-source asset, not an Astryx component. It belongs in the `GlobalAppShell` brand slot or an equivalent composed shell region without changing the AppShell API.

| Gobanos requirement          | Verified Astryx/PLUME basis                                     | Ownership       | PI-4C rule                                                |
| ---------------------------- | --------------------------------------------------------------- | --------------- | --------------------------------------------------------- |
| Light/Dark semantic surfaces | Neutral theme semantic CSS variables and existing PLUME aliases | ASTRYX_COMPOSED | Extend verified aliases; do not hardcode screens          |
| Theme-aware wordmark         | AppShell/layout region + native image/SVG                       | PLUME_CUSTOM    | Black source on Light, white source on Dark               |
| Theme setting control        | SegmentedControl/RadioList/Selector basis                       | ASTRYX_COMPOSED | Options System/Light/Dark; persistence is app behavior    |
| OS preference                | Native `prefers-color-scheme` behavior                          | NATIVE_BROWSER  | PI-4C implementation; no invented Astryx prop             |
| Initial no-flash target      | Document/head startup behavior                                  | PLUME_CUSTOM    | `PI_4C_IMPLEMENTATION_GAP` until runtime design is chosen |
| Dark validation states       | Badge/Banner/StatusDot + semantic status families               | ASTRYX_COMPOSED | Preserve icon/text/border/surface semantics               |
| Dark Editor panels           | AppShell/LayoutPanel/Toolbar/TreeList/input primitives          | ASTRYX_COMPOSED | Canvas priority and Renderer boundary unchanged           |

The repository currently loads one neutral theme and declares Light color scheme. Installed `0.1.9` has not been proven here to expose a particular runtime theme-provider prop, persistence API, or startup script. PI-4C must inspect installed types and CSS behavior. Any missing capability is recorded as `PI_4C_IMPLEMENTATION_GAP`; this specification does not fabricate APIs.

## 10. Theme-invariant component ownership

The counts remain unchanged: 51 verified direct component aliases, 15 existing composed patterns/shells, and 9 target PLUME custom patterns. Light/Dark support is state coverage of the same components, not a second component library. Astryx is not upgraded, package versions and lockfiles remain unchanged, and application screens continue to prefer `@plume/ui`.
