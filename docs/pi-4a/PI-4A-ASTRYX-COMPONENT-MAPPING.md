# PI-4A Astryx and PLUME Component Mapping

Status: `FREEZE_CANDIDATE`

Sources checked: `packages/ui/src/astryx/index.ts`, `packages/ui/src/components/**`, `packages/ui/src/composites/**`, `packages/ui/src/shells/**`, and the Astryx public component catalog.

Rule: application screens consume `@plume/ui` wrappers/composites. Direct `@astryxdesign/core` imports remain inside the UI package boundary.

This mapping freezes component responsibility, not component props or visual tokens. Names under **Existing PLUME** are exports verified at the baseline. Names under **Required PLUME composition** are design targets and must not be mistaken for implemented exports.

## 1. Foundation mapping

| UX need              | Astryx primitive available through adapter                                                            | Existing PLUME                                                                                                                        | Mapping rule                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Application frame    | `AstryxAppShell`, `AstryxSideNav`, `AstryxTopNav`, `AstryxLayout`                                     | `PlumeAppShell`, `GlobalAppShell`, `CampaignWorkShell`                                                                                | Keep account/navigation behavior in shell composition; screens supply route content.                                    |
| Editor frame         | `AstryxLayout`, `AstryxLayoutPanel`, `AstryxResizeHandle`                                             | `CreativeEditorShell`, `PlumeLayoutPanel`, `PlumeResizeHandle`                                                                        | Enforce left list/layers, center canvas, right properties/validation.                                                   |
| Navigation/context   | `AstryxBreadcrumbs`, `AstryxSideNav`, `AstryxTabList`, `AstryxSegmentedControl`                       | No dedicated PLUME breadcrumb/tab wrapper at baseline                                                                                 | Compose in UI package before app use; breadcrumbs express Account > Campaign > Project > Creative.                      |
| Actions              | `AstryxButton`, `AstryxIconButton`, `AstryxButtonGroup`, `AstryxToolbar`                              | `PlumeButton`, `PlumeIconButton`                                                                                                      | One primary CTA per decision region; destructive/cancel actions require explicit state and confirmation as appropriate. |
| Selection            | `AstryxSelector`, `AstryxMultiSelector`, `AstryxSelectableCard`, `AstryxTypeahead`, `AstryxRadioList` | `PlumeSelector`, `PlumeMultiSelector`, `PlumeSelectableCard`, `PlumeTypeahead`, `PlumeRadioList`                                      | Use cards for channel/format/product visual choice; selectors for context/filtering.                                    |
| Text/copy entry      | `AstryxTextInput`, `AstryxTextArea`, `AstryxCheckboxInput`, `AstryxFileInput`                         | `PlumeTextInput`, `PlumeTextArea`, `PlumeCheckbox`, `PlumeFileInput`                                                                  | Preserve labels, required/error/help text; AI copy remains editable before Continue.                                    |
| Status               | `AstryxBadge`, `AstryxStatusDot`, `AstryxBanner`                                                      | `PlumeBadge`, `PlumeStatusDot`, `PlumeBanner`, `VersionStatusBar`                                                                     | Never encode lifecycle, validation, or source by color alone.                                                           |
| Structured data      | `AstryxList`, `AstryxTable`, `AstryxTreeList`, `AstryxMetadataList`, `AstryxThumbnail`                | `PlumeList`, `PlumeTable`, `PlumeTreeList`, `PlumeMetadataList`                                                                       | Tree is for layers; tables/lists for jobs/assets/creatives; thumbnails reference renderer artifacts.                    |
| Progress/loading     | `AstryxProgressBar`, `AstryxSkeleton`, `AstryxSpinner`                                                | `PlumeProgress`, `PlumeSkeleton`, `AsyncJobProgressPanel`                                                                             | Keep last confirmed durable job state visible during reconnection.                                                      |
| Empty/error feedback | `AstryxEmptyState`, `AstryxBanner`, `AstryxToast`                                                     | `PlumeEmptyState`, `PlumeBanner`, `PlumeToast`                                                                                        | Empty, unavailable, forbidden, load failure, and execution failure are distinct states.                                 |
| Overlays/help        | `AstryxDialog`, `AstryxPopover`, `AstryxTooltip`, `AstryxDropdownMenu`, `AstryxMoreMenu`              | `PlumeDialog`, `PlumePopover`, `PlumeTooltip`                                                                                         | Dialog for consequential choices/conflicts; tooltip never carries required information alone.                           |
| Workflow             | Foundation/layout/progress primitives                                                                 | `WorkflowStepRail`, `AsyncJobProgressPanel`, `VersionStatusBar`, `ValidationIssueCard`, `ApprovalStatusPanel`, `ExportPackageSummary` | Reuse domain composites before creating new screen-local state renderers.                                               |

## 2. Screen mapping

| Screen                | Existing PLUME foundation/composites                                                        | Required PLUME composition                                                                                                                     | Astryx gaps requiring a PLUME wrapper/composition                                                    |
| --------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Global Shell          | `GlobalAppShell`, `PlumeAppShell`, badges, popover, toast, skeleton                         | `WorkspaceSwitcher`, `ContextBreadcrumbs`, `GlobalJobIndicator`                                                                                | Side nav/top nav/breadcrumb adapter usage is exported but not wrapped as dedicated PLUME components. |
| Step 1 Setup          | `WorkflowStepRail`, selectors, `ProductMatchCard`, `AssetRecommendationCard`, inputs        | `CreativeContextSelector`, `EffectiveAssetPool`, `AssetSourceBadge`, `ProductPicker`, `CopyComposer`, `SetupReadinessSummary`                  | Cards, selectors, fields, alerts are available; domain grouping and source semantics are custom.     |
| Step 2 Channel/Format | `WorkflowStepRail`, `ChannelSelectionCard`, `FormatProfileCard`, multi-selector             | `ChannelSelector`, `FormatSelectionSummary`, `CatalogCapabilityNotice`                                                                         | Tab/segmented channel presentation may need a UI-package composition.                                |
| Step 3 Generate       | `WorkflowStepRail`, `AsyncJobProgressPanel`, progress, list/table, banner                   | `GenerationReview`, `GenerationJobPanel`, `FormatJobRow`, `PartialSuccessSummary`, `JobRecoveryActions`                                        | Durable job reconciliation and job-level retry semantics are PLUME domain logic.                     |
| Step 4 Editor         | `CreativeEditorShell`, `VersionStatusBar`, tree/list, validation/approval/export composites | `CreativeListPanel`, `LayerTree`, `RendererCanvas`, `PropertiesInspector`, `ValidationPanel`, `VersionConflictDialog`, `FinalizeExportActions` | Canvas/render host is product-specific; Astryx supplies surrounding controls, not renderer output.   |
| Campaign Overview     | `CampaignWorkShell`, metadata/list/card/status/empty primitives                             | `CampaignHeader`, `CampaignContextSummary`, `AssetPoolSummary`, `ProjectSummary`                                                               | Project unavailable state requires product-specific capability copy.                                 |
| Campaign Assets       | cards/table/file input/progress/status/dialog                                               | `CampaignAssetBrowser`, `AssetDetailPanel`, `AssetEligibilityBadge`, `AssetUsageSummary`, `AssetUploadFlow`                                    | Asset license/usage/source semantics are custom.                                                     |
| Project Overview      | shell/card/metadata/status/empty primitives                                                 | `ProjectHeader`, `ProjectContextSummary`, `ProjectAssetSummary`, `CreativeSummary`                                                             | Entire Project domain binding waits on contract; visual primitives already exist.                    |
| Project Assets        | card/table/status/empty/dialog primitives                                                   | `InheritedAssetGroup`, `ProjectAssetGroup`, `AssetSourceLegend`, `EffectiveAssetResolverStatus`                                                | Effective-pool resolution and immutable inherited-source behavior are custom.                        |
| Project Creatives     | table/card/status/thumbnail/dialog, validation/export composites                            | `ProjectCreativeTable`, `CreativeStatusProjection`, `ValidationStatusBadge`, `RendererThumbnail`, `CreativeExportActions`                      | Project binding is absent; creative state projections are domain-specific.                           |

## 3. Required interaction states

Every mapped interactive component must support these state categories where applicable:

| Category        | Required states                                                                              |
| --------------- | -------------------------------------------------------------------------------------------- |
| Control         | default, hover, focus-visible, disabled with reason, busy, invalid                           |
| Selectable item | unselected, selected, unavailable, incompatible, loading                                     |
| Async section   | initial loading, refreshing with prior data, success, empty, failure, reconnecting           |
| Asset           | inherited/local source, eligible/ineligible, referenced, unresolved, mutation pending/failed |
| Creative        | AI draft, edited, validating, validated, final, archived/superseded                          |
| Validation      | pending, PASS, WARNING, FAIL (domain `ERROR`), execution failed                              |
| Job/export      | queued, running, partial success, completed, failed, cancelled, retrying                     |

## 4. Accessibility and responsive constraints

- Use semantic labels, descriptions, error relationships, and focus-visible behavior supplied or enabled by the Astryx foundation; custom composites must preserve them.
- Source, validation, lifecycle, job, and eligibility meaning must include text/iconography and not depend on color.
- Multi-select format cards must expose selected state and a live selection count.
- Dialog focus is trapped and restored to the invoking control; toasts do not replace persistent error/recovery content.
- The editor canvas remains primary at narrower widths; left/right panels become named, keyboard-accessible drawers or tabs.
- Skeletons approximate content geometry and must not erase a known context or last confirmed job state.

## 5. Implementation boundary

1. Prefer existing `@plume/ui` exports.
2. Add missing generic wrappers inside `packages/ui`, not directly in application screens.
3. Add PLUME domain compositions only after their backend capability is established.
4. Never reproduce renderer pixels with Astryx or web CSS; `RendererCanvas` hosts authoritative renderer artifacts.
5. Do not infer Astryx props from this document. PI-4C must inspect the installed `0.1.9` types and the PLUME adapter at implementation time.

## 6. Confidence

- **Verified:** every Astryx symbol named in the foundation table is exported by `packages/ui/src/astryx/index.ts` at the baseline.
- **Verified:** every component named under Existing PLUME is exported by the checked component/composite/shell indexes.
- **Target only:** every name under Required PLUME composition.
- **Not evaluated here:** pixel styling, theme tokens, final spacing, and compatibility of undocumented Astryx props.
