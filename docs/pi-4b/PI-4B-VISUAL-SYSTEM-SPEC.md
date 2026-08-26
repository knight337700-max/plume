# PI-4B Visual System Specification

Status: `FROZEN_FOR_PI_4C`

Parent: `PI-4A_UX_INFORMATION_ARCHITECTURE_FINAL_PASS`

Authoritative parent SHA: `9a6e6e3fe322e09b32b40b285b4b8fc4f8dcd966`

## 1. Purpose and authority

This document translates the frozen PI-4A information architecture into a coherent visual language. It does not change navigation, hierarchy, contracts, persistence, rendering, or product behavior. The product principle remains **AI First Draft + Human Final Control**.

PI-4C may implement this specification only through the existing `@plume/ui` boundary. Literal values in this document are design targets; verified Astryx semantic variables are the preferred implementation source. When this document and a runtime contract differ, the runtime contract remains authoritative and unsupported controls stay disabled or absent.

## 2. Visual character

PLUME is a calm, precise creative workspace. It should feel professional and premium without luxury ornament, AI spectacle, or generic admin-dashboard card grids.

| Attribute          | Frozen expression                                                                     |
| ------------------ | ------------------------------------------------------------------------------------- |
| Professional       | Clear hierarchy, concise labels, predictable controls, no novelty interaction         |
| Premium            | Careful spacing, high-quality typography, quiet surfaces, precise alignment           |
| Calm               | Neutral background, limited accent, restrained motion and elevation                   |
| Precise            | Dimensions, lifecycle, validation, provenance, and availability are explicit          |
| Content-first      | User assets and creative output receive more contrast and area than chrome            |
| Creative workspace | Management pages are spacious; the Editor is denser and tool-like                     |
| AI-native          | Generation and provenance are visible, never anthropomorphized or decorated with neon |

Avoid excessive gradients, glassmorphism, neon AI clichés, gamer styling, playful mascots in work surfaces, excessive cardification, and an overdecorated Editor. Decorative gradients are not part of the primary system.

## 3. Visual hierarchy

The fixed order is:

1. Creative, Canvas, or user content.
2. Current workflow task.
3. One primary action in the current decision region.
4. Current context and selection.
5. Secondary controls.
6. System status and metadata.

In the Editor, `Canvas > Properties > Navigation chrome`. The canvas-stage is the largest continuous region, the artboard has the sharpest content contrast, and tool chrome uses muted neutral surfaces. Validation may interrupt this order only when it blocks finalization or export.

## 4. Primary appearance

```yaml
appearance:
  PI_4B_primary_theme: LIGHT
  source: "@astryxdesign/theme-neutral@0.1.9"
  dark_mode:
    complete_design_required: false
    future_compatible: true
```

The repository declares `color-scheme: light`, imports Astryx Neutral, and has no frozen multi-theme product requirement. PI-4B therefore completes one light appearance. Semantic aliases must not encode light-only meanings so a separately reviewed future dark theme can replace values without changing components.

## 5. Color system

All application colors must resolve through the semantic token names in `PI-4B-DESIGN-TOKENS.md`. The visual targets below clarify intent and contrast; Astryx aliases remain the implementation source where available.

| Role                |    Target | Use                                                    |
| ------------------- | --------: | ------------------------------------------------------ |
| Brand / accent      | `#3157C8` | PLUME identity, selected navigation mark, focus family |
| App background      | `#F1F1F1` | Shell and management-page body                         |
| Primary surface     | `#FFFFFF` | Main content and panels                                |
| Subtle surface      | `#F6F6F6` | Grouping, rows on hover, inset regions                 |
| Elevated surface    | `#FFFFFF` | Dialog, popover, floating toolbar                      |
| Selected surface    | `#EEF3FF` | Selected creative, format, navigation item             |
| Text primary        | `#171717` | Titles and main content                                |
| Text secondary      | `#525252` | Explanations and secondary values                      |
| Text muted          | `#737373` | Metadata and timestamps                                |
| Text disabled       | `#A3A3A3` | Unavailable controls; never sole signal                |
| Border default      | `#D4D4D4` | Surface separation and control outline                 |
| Border strong       | `#A3A3A3` | Artboard, selected boundaries, dense panel separators  |
| Focus               | `#3157C8` | Two-pixel visible focus ring with three-pixel offset   |
| Primary interactive | `#3157C8` | One primary CTA                                        |
| Primary hover       | `#2747A6` | Hover only                                             |
| Primary active      | `#1F3985` | Pressed only                                           |
| Success / PASS      | `#007A3D` | Completed and validated success                        |
| Warning             | `#8A5B00` | Acknowledgement or review needed                       |
| Error / FAIL        | `#A50C25` | Blocking validation or failed operation                |
| Info / processing   | `#2457C5` | Queued, running, explanatory status                    |

Validation and lifecycle use icon, text, semantic surface, and border together. `PASS`, `WARNING`, and `FAIL` must remain understandable in monochrome. Domain validation execution `FAILED` is labelled “Validation could not run” and is not styled as a rule failure.

## 6. Typography

Primary UI stack:

```css
Figtree, Pretendard, "Noto Sans KR", system-ui, -apple-system, sans-serif
```

Figtree is the current Astryx-oriented Latin face; Pretendard and Noto Sans KR provide Korean-safe fallbacks. PI-4C must not introduce a remote font dependency merely to satisfy the first family. If Figtree or Pretendard is unavailable, the stack must remain stable and readable.

| Style           | Size / line |      Weight | Use                                   |
| --------------- | ----------- | ----------: | ------------------------------------- |
| Page title      | 24 / 32 px  |         600 | Unique page heading                   |
| Section title   | 20 / 28 px  |         600 | Major workspace section               |
| Panel title     | 17 / 24 px  |         600 | Editor panel or card group            |
| Body            | 14 / 20 px  |         400 | Default content                       |
| Label           | 14 / 20 px  |         500 | Form and control labels               |
| Caption         | 12 / 18 px  |         400 | Guidance and secondary description    |
| Metadata        | 12 / 18 px  |         500 | Status, source, timestamps            |
| Button          | 14 / 20 px  |         600 | Button labels                         |
| Form text       | 14 / 20 px  |         400 | Inputs and selects                    |
| Compact control | 12 / 16 px  |         500 | Editor toolbar and dense row controls |
| Dimension       | 13 / 18 px  | 500 tabular | `1029 × 258`, zoom, file size         |

Numeric dimensions, percentages, counts, and timestamps use tabular numerals where available. Uppercase is reserved for contract codes and compact status labels; prose uses sentence case.

## 7. Spacing and density

The base scale is `0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64` px. No screen creates a private spacing scale.

| Surface             | Density rule                                                                  |
| ------------------- | ----------------------------------------------------------------------------- |
| Global shell        | 56 px top region; 256 px navigation; 24–32 px content inset                   |
| Management page     | 24 px section gap; 16 px within groups; 48–56 px row target                   |
| Creative Setup      | 24 px between workflow groups; 12–16 px fields                                |
| Asset grid          | 16 px grid gap; thumbnail-first cards; metadata in 8 px stack                 |
| Format cards        | 16 px gap; 12–16 px inset; aspect-ratio preview preserved                     |
| Generation progress | 12 px item gap; 48 px minimum status row                                      |
| Creative Editor     | 8–12 px panel groups; 32–40 px toolbar controls; no page padding around stage |
| Layers / Properties | 32–36 px rows; 8 px group gap; 12 px panel inset                              |
| Tables / lists      | 44–52 px rows, with 36 px only for Editor dense lists                         |
| Dialogs             | 24 px outer inset; 16 px body groups; 12 px action gap                        |

Density must communicate function. Management surfaces support scanning and explanation. The Editor spends space on the artboard and uses compact chrome, but text remains at least 12 px and primary interactive targets remain at least 40 × 40 px.

## 8. Surface hierarchy

| Surface          | Treatment                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------- |
| App background   | Neutral body; no elevation                                                               |
| Sidebar          | Primary surface with a single divider; selected item uses surface + indicator            |
| Topbar           | Primary surface or merged with page surface; one bottom divider                          |
| Main workspace   | Primary or body surface according to task; no decorative container                       |
| Card             | Border-first grouping, low or no shadow                                                  |
| List row         | Flat; divider or spacing, hover surface only when interactive                            |
| Editor panels    | Primary surface and strong dividers; resize boundaries remain visible                    |
| Canvas stage     | Dark-neutral or mid-neutral work surface distinct from app body                          |
| Artboard         | White/content surface, strong one-pixel boundary, low shadow only to separate from stage |
| Floating toolbar | Elevated surface, medium shadow, compact radius                                          |
| Dialog / popover | Elevated surface and high/medium shadow respectively                                     |
| Toast            | Elevated surface with status icon and concise action                                     |
| Validation block | Semantic muted surface, semantic border, icon, heading, and action guidance              |

Layout separation is preferred to nested cards. A card is used only when the grouped content has its own selection, action, or lifecycle.

## 9. Borders, radii, and elevation

| Primitive                | Frozen value                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------ |
| Default border           | 1 px solid semantic default                                                          |
| Strong / selected border | 1 px semantic strong; selected adds inset selected ring                              |
| Focus ring               | 2 px solid focus, 3 px offset                                                        |
| Control radius           | Astryx `radius.element` target, approximately 12 px                                  |
| Inner radius             | Astryx `radius.inner`, approximately 8 px                                            |
| Card / panel radius      | Astryx `radius.container`, approximately 16 px; attached Editor panels remain square |
| Modal radius             | 16 px; do not use oversized page radius                                              |
| Pill radius              | Full only for badges, segmented indicators, and compact statuses                     |
| Elevation low            | Artboard/card separation                                                             |
| Elevation medium         | Popover and floating toolbar                                                         |
| Elevation high           | Dialog and blocking overlay                                                          |

No component may introduce an additional named radius or shadow without a system-level review.

## 10. Iconography

Astryx `Icon` is the primary source and is re-exported through `@plume/ui`. Use 16 px for dense controls and metadata, 20 px for standard actions, and 24 px for navigation or empty-state emphasis. Icons in icon-only buttons require accessible names and tooltips. Validation pairs a recognizable icon with the literal words `PASS`, `WARNING`, `FAIL`, or “Validation could not run.”

Selected state uses surface, border/indicator, and weight in addition to icon color. Destructive actions use error semantics and explicit verbs. Emoji are not production icons. A second icon package is deferred unless PI-4C proves a named gap after checking installed Astryx `0.1.9`.

## 11. Interaction states

| State            | Frozen treatment                                                                    |
| ---------------- | ----------------------------------------------------------------------------------- |
| Default          | Stable semantic surface, text, and border                                           |
| Hover            | Subtle surface or controlled color shift; no layout movement                        |
| Focus visible    | Two-pixel focus ring and offset, never removed                                      |
| Pressed / active | Stronger interactive tone or inset state                                            |
| Selected         | Selected surface + strong border/left indicator + `aria-selected`/checked semantics |
| Disabled         | Reduced contrast, disabled cursor, and visible reason nearby or in tooltip          |
| Busy / loading   | Label remains, spinner/progress added, duplicate action blocked                     |
| Invalid / error  | Error border, icon, message, and correction guidance                                |
| Read-only        | Normal readable text on subtle surface, lock/read-only label when ambiguity exists  |
| Dragging         | Low elevation and reduced source opacity; keyboard alternative required             |
| Drop target      | Strong border and explicit “Drop to add” text                                       |
| Unavailable      | Disabled or absent action plus reason such as `Catalog not ready`                   |

Disabled and unavailable are distinct: disabled means prerequisites may be satisfied in the current flow; unavailable means the current contract or catalog cannot support the action.

## 12. Action hierarchy

Each decision region has at most one primary action: `Next`, `Generate N Creatives`, `Finalize`, or `Export`. Back, Preview, Reset, and Regenerate are secondary. Metadata, More, and Help are tertiary. Destructive actions are separated spatially and require confirmation when irreversible.

`Finalize` and `Export` are never visually enabled merely because a creative exists. Validation, acknowledgement, approval/current-version, and export eligibility remain contract-driven.

## 13. Motion

Motion is functional and restrained: 100–150 ms for micro state changes, 180–240 ms for panels/dialogs, and indeterminate continuous motion only for active processing. Selection never uses long movement. Toasts do not auto-disappear before their content can be read. Under `prefers-reduced-motion: reduce`, transforms and nonessential transitions are removed and progress remains understandable through text.

## 14. Architecture invariants

- Global navigation remains `AI Creative`, `Campaign / Project`, and `Settings`.
- Hierarchy remains Account → Campaign → Project → Creative.
- AI Creative remains the four-step workflow; there is no separate AI Draft page.
- Campaign and Project Assets remain contextual and distinguish inherited references from local targets.
- Multi-format selection remains enabled only for active canonical profiles.
- The Creative Editor remains Creative List | Canvas / Preview | Layers / Properties.
- Project is target UX, not a first-class current backend contract.
- Renderer is geometry and validation authority. The browser never claims pixel or validation authority.

## 15. PI-4C implementation boundary

PI-4C should apply this system by extending existing tokens, wrappers, composites, and shells in `packages/ui`, then consuming only `@plume/ui` from screens. This Gate does not add CSS, components, routes, APIs, state, or production behavior.
