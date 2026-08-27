# PI-4B Responsive and Accessibility Specification

Status: `FROZEN_FOR_PI_4C`

Strategy: desktop-first, capability-preserving, accessible by design

## 1. Width classes

Breakpoints describe functional region capacity, not device brands.

| Class                              | Viewport/content width | Management behavior                                       | Editor behavior                                                    |
| ---------------------------------- | ---------------------: | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Desktop Expanded                   |              ≥ 1600 px | 256 px nav, generous 32 px gutter, multi-column summaries | all three columns; canvas absorbs surplus                          |
| Desktop Standard                   |           1280–1599 px | 256 px nav, 24 px gutter, normal grids/tables             | 64 + 232 + min-640 stage + 380 inspector                           |
| Compact Desktop / Tablet Landscape |           1024–1279 px | nav may collapse; side panels/filters use drawer          | canvas primary; list/inspector mutually exclusive drawers/tabs     |
| Small Screen Limited Mode          |              < 1024 px | one-column management layouts; actions stack              | preview/review and status only; full geometry editing not promised |

Breakpoints may be implemented with repository/Astryx mechanisms after type verification. The behavior—not a particular unpublished prop—is frozen.

## 2. Region response contract

| Region            | Expanded               | Standard                 | Compact                       | Small limited            |
| ----------------- | ---------------------- | ------------------------ | ----------------------------- | ------------------------ |
| Global nav        | 256 px persistent      | persistent               | collapsed rail/menu or drawer | drawer/menu              |
| Context header    | one row                | one row                  | title/actions may wrap        | stacked                  |
| Page side summary | side-by-side           | side-by-side if ≥ 320 px | inline below task             | inline                   |
| Filter rail       | visible when justified | visible/compact          | drawer                        | drawer                   |
| Data table        | full columns           | priority columns         | list/column reduction         | card/list                |
| Asset grid        | 4–3 columns            | 3–2                      | 2                             | 1                        |
| Editor list       | visible                | visible                  | drawer/tab                    | selection drawer         |
| Editor inspector  | visible                | visible                  | drawer/tab                    | read-only details drawer |
| Editor canvas     | dominant               | dominant                 | dominant                      | Fit/Zoom preview         |

Regions are revealed, swapped, or dropped; they are not all uniformly squeezed.

## 3. Content reflow rules

- Maintain canonical preview aspect ratio; never crop a format card merely to fit a grid.
- Keep primary action adjacent to its decision summary. Sticky use must not cover content or focused controls.
- Tables prioritize identity, state, validation, and primary action. Secondary metadata moves to disclosure on compact widths.
- Forms become one column before labels or inputs become too narrow.
- Workflow steps retain all four labels on desktop; compact mode may show current label plus `Step N of 4`, with the full sequence accessible.
- Long Korean/English labels wrap at natural word boundaries. Codes and dimensions may remain unbroken when short.
- No horizontal page scroll. The Editor stage may pan its own content, but tool regions remain independently usable.

## 4. Editor minimum-width policy

Full editing requires a 640 px minimum canvas stage plus accessible tool access. At 1024–1279 px, side regions no longer consume simultaneous fixed widths. Below 1024 px, the UI announces `Limited editor mode` and supports creative selection, preview Fit/Zoom, lifecycle/validation inspection, and safe finalization only when the controls fit and remain contract-valid. Geometry, drag, and complex property editing are not promised.

Limited mode is a capability disclosure, not a generic disabled screen. Users can navigate to a wider viewport without losing current context.

## 5. Contrast and non-color semantics

PI-4C must verify resolved token combinations against WCAG 2.2 AA targets:

- Normal text: at least 4.5:1.
- Large text: at least 3:1.
- Essential UI boundaries, icons, and focus indicators: at least 3:1 against adjacent colors.
- Disabled content remains identifiable, though nonessential disabled contrast is not used to hide its reason.

Selected, validation, availability, source inheritance, lifecycle, and destructive state always use at least two non-color cues:

| Meaning              | Required cues beyond color                            |
| -------------------- | ----------------------------------------------------- |
| Selected             | check/indicator + border/weight + semantic state      |
| PASS/WARNING/FAIL    | icon + literal label + summary/detail placement       |
| Unavailable          | badge/text reason + disabled/absent action            |
| Inherited asset      | source heading + link/source icon + Campaign metadata |
| Project-local target | source heading + project/folder icon + contract label |
| Final/frozen         | lock icon + `Final` text + restricted actions         |

## 6. Focus and keyboard

- All keyboard focus uses a two-pixel visible ring with three-pixel offset where geometry permits.
- Focus is never removed because a pointer was used previously; `:focus-visible` differentiates modality.
- Focus order follows visual/task order. DOM order must not be visually reversed with CSS.
- A skip link reaches main content. The Editor additionally exposes region landmarks/names for toolbar, Creative List, canvas workspace, inspector, and status.
- Tabs, segmented controls, radio lists, tree/list navigation, dialogs, and menus follow the installed component's verified keyboard semantics.
- Full-card selection remains operable from keyboard without nested conflicting click targets.
- Drag/reorder/resize has a keyboard alternative or remains unavailable.
- Keyboard shortcuts are supplemental and cannot replace visible actions. They must avoid browser/assistive-technology conflicts.

## 7. Target sizes and pointer behavior

Standard interactive targets are at least 40 × 40 px. Dense Editor controls may be 32 × 32 px only when separated from adjacent targets, labelled by accessible name/tooltip, and not the sole route for a critical action. Touch use in compact mode promotes primary controls to the standard target.

Hover information is also available on focus. Precision dragging must provide visible handles and a non-drag input/control alternative when contract-supported.

## 8. Forms and errors

- Every control has a persistent label; placeholders are examples only.
- Required/optional state is textual and consistent.
- Help and error text is programmatically related to the field.
- Errors preserve entered data and focus the first invalid field only after a user-triggered submit.
- Error summaries link to fields for long forms.
- Read-only values use readable text/value rows, not disabled inputs when users need to copy/read the value.
- Disabled actions expose prerequisites without relying solely on tooltip, especially on touch widths.

## 9. Loading, live status, and reconnection

Skeletons approximate eventual structure and do not replace known content during refresh. Progress has a human-readable label and value text. Generation/save/reconnect updates use polite live regions; blocking operation errors use an alert appropriate to urgency. Status announcements are deduplicated so per-item generation does not flood assistive technology.

Refreshing retains last known content with a subtle progress signal. Reconnecting does not erase edits; any save uncertainty is explicit.

## 10. Dialogs, drawers, and layers

- Modal layers have an accessible name, initial focus, focus containment, Escape behavior where safe, and focus return.
- Destructive confirmations place safe/cancel first in focus order according to platform convention and use explicit object/action text.
- Drawers used for responsive panels follow dialog semantics when modal.
- Popovers are not used for long required workflows.
- Toasts supplement, not replace, persistent confirmation for save, validation, finalization, or export.
- Layer order must flow through `AstryxProvider`/LayerProvider and semantic z tokens.

## 11. Images, thumbnails, and canvas

Decorative previews use empty alt only when adjacent text provides the same identity. Creative thumbnails and assets use meaningful names or format descriptions. The central artboard has a labelled region and an accessible non-canvas representation of selected layer and validation issues. Pixel coordinates alone are never the only description.

Transparency checkerboards are decorative. Failed previews expose text and recovery. Zoom cannot shrink surrounding UI text. Fit is always available when preview exists.

## 12. Motion and reduced motion

Motion is short and functional. With reduced-motion preference:

- panel/dialog movement becomes an instant or short fade,
- skeleton shimmer is removed,
- selection does not animate position,
- indeterminate progress retains text/spinner with minimal motion,
- no content relies on animation to communicate completion or error.

## 13. Language and localization

The font stack supports Korean and English. Layouts must tolerate at least 30% label expansion and mixed strings such as `Kakao Moment Bizboard Thumbnail Box Right 1029 × 258`. Text is not embedded in images. Truncation has an accessible full value, and critical errors/actions wrap rather than truncate.

## 14. PI-4C verification checklist

- Automated axe checks on all ten routes/states implemented.
- Keyboard-only walkthrough of four-step flow and Editor regions.
- Contrast measurement on resolved Light and Dark semantic token pairs.
- 1600, 1440, 1280, 1024, and below-1024 limited-mode visual checks.
- 200% zoom/reflow check for management screens.
- Reduced-motion check.
- Screen-reader spot check for workflow step, selection cards, generation live status, validation, dialog, and Editor region names.
- No state communicated by color alone.
- No focus loss after drawer/dialog close or async refresh.

These tests belong to PI-4C; this document freezes their visual/accessibility target.

## 15. Light/Dark responsive parity

Theme selection does not create a second responsive system. Both themes use the same functional width classes, DOM/task order, panel budgets, drawer/tab transitions, target sizes, keyboard model, and limited-mode capability.

| Width class        | Light                                                   | Dark                                     | Required invariant            |
| ------------------ | ------------------------------------------------------- | ---------------------------------------- | ----------------------------- |
| Expanded ≥1600     | Full shell and three-column Editor                      | Same regions with dark semantic surfaces | Canvas absorbs surplus        |
| Standard 1280–1599 | Persistent navigation/list/inspector                    | Same region budgets                      | No behavior change            |
| Compact 1024–1279  | Collapsed navigation; list/inspector drawers/tabs       | Same recomposition with dark layers      | Canvas remains primary        |
| Limited <1024      | One-column management; Editor preview/review/validation | Same capability and disclosure           | Advanced geometry unavailable |

Actual window resize must trigger responsive recomposition independent of the selected theme. PI-4C E2E must exercise transitions across 1600, 1280, 1024, and below 1024 in Light and Dark, verify focus return after drawers, and confirm that theme switching neither resets context nor changes contract-driven enablement.

## 16. Dark contrast and focus requirements

- Dark primary, secondary, muted, disabled, inverse, link/action, border, and focus pairs come from the frozen semantic token table.
- Normal text and consequential metadata target WCAG 2.2 AA against their resolved dark surfaces.
- `#9DB2FF` is the Dark focus target; focus remains 2 px with 3 px offset and at least 3:1 non-text contrast.
- Disabled text may be lower emphasis, but the explanatory reason uses readable secondary text.
- Selected, inherited/local, validation, lifecycle, and availability states retain non-color cues.
- Heavy shadow is not a substitute for Dark surface boundaries; borders and tonal steps provide separation.

## 17. Runtime theme accessibility target

The PI-4C setting offers `System`, `Light`, and `Dark` as an accessible single-choice control. It persists the user selection, respects `prefers-color-scheme` when System is selected, targets no theme flash on initial load, and announces no unnecessary live-region message for a purely visual theme change. Forced-colors and reduced-motion behavior must remain usable. This is a target contract, not runtime implementation in PI-4B.

## 18. Brand responsiveness and accessibility

The wordmark image has accessible name `Gobanos` when it conveys product identity. Decorative duplicate occurrences use empty alternative text. Its original aspect ratio is preserved and it is never compressed to fit a narrow rail. Below the minimum readable width, the artwork is hidden and the shell/menu retains a textual or programmatic `Gobanos` name; no unapproved `G` crop or compact symbol is created.
