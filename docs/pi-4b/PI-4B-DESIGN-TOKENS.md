# PI-4B Design Tokens

Status: `FROZEN_FOR_PI_4C`

Base: `@astryxdesign/core@0.1.9` + `@astryxdesign/theme-neutral@0.1.9`

## 1. Token strategy

PI-4B freezes semantic intent, not a replacement theme engine. Gobanos is the public product identity while PLUME aliases and `@plume/ui` remain the internal technical boundary. PLUME aliases Astryx variables through `packages/ui/src/tokens/plume-theme.css`; application screens consume semantic names through `@plume/ui`. PI-4C may add missing Light/Dark aliases but must not bypass the adapter, hardcode screen-local literals, or guess an undocumented Astryx theme API.

The mapping states are:

- `DIRECT`: verified repository alias to an Astryx variable.
- `DERIVED`: semantic PLUME alias expected to resolve from verified Astryx tokens.
- `TARGET`: design value requiring PI-4C implementation verification; it is not claimed as an existing API.

## 2. Color tokens

| PLUME token                  | Target / meaning             | Astryx mapping                                         | State   |
| ---------------------------- | ---------------------------- | ------------------------------------------------------ | ------- |
| `color.brand.primary`        | Gobanos application identity | text/accent semantic family                            | DERIVED |
| `color.brand.hover`          | stronger brand action        | `--color-data-blue-5` via `--plume-color-accent-hover` | DIRECT  |
| `color.surface.app`          | app body                     | `--color-background-body`                              | DIRECT  |
| `color.surface.primary`      | panels/content               | `--color-background-surface`                           | DIRECT  |
| `color.surface.card`         | selectable/grouped card      | `--color-background-card`                              | DIRECT  |
| `color.surface.popover`      | layered surface              | `--color-background-popover`                           | DIRECT  |
| `color.surface.subtle`       | low-emphasis group           | `--color-background-muted`                             | DIRECT  |
| `color.surface.elevated`     | dialog/popover/toolbar       | popover/card + shadow                                  | DERIVED |
| `color.surface.selected`     | selected row/card            | `--color-background-blue`                              | DIRECT  |
| `color.surface.hover`        | interactive hover            | neutral overlay/background                             | DERIVED |
| `color.surface.overlay`      | modal scrim                  | `--color-overlay`                                      | DIRECT  |
| `color.surface.canvas`       | Editor stage                 | neutral inverted/mid-dark target                       | TARGET  |
| `color.surface.artboard`     | rendered content plane       | surface/card                                           | DERIVED |
| `color.text.primary`         | primary text                 | `--color-text-primary`                                 | DIRECT  |
| `color.text.secondary`       | secondary text               | `--color-text-secondary`                               | DIRECT  |
| `color.text.muted`           | metadata                     | secondary at normal contrast; no opacity-only text     | DERIVED |
| `color.text.disabled`        | disabled text                | `--color-text-disabled`                                | DIRECT  |
| `color.text.inverse`         | on strong/dark surfaces      | `--color-on-dark`                                      | DIRECT  |
| `color.icon.primary`         | default icons                | `--color-icon-primary`                                 | DIRECT  |
| `color.icon.secondary`       | supporting icons             | `--color-icon-secondary`                               | DIRECT  |
| `color.border.default`       | standard divider/outline     | `--color-border`                                       | DIRECT  |
| `color.border.strong`        | artboard/selected boundary   | `--color-border-emphasized`                            | DIRECT  |
| `color.border.focus`         | keyboard focus               | PLUME accent / Astryx focus family                     | DERIVED |
| `color.interactive.primary`  | primary CTA                  | PLUME accent                                           | DIRECT  |
| `color.interactive.hover`    | primary hover                | PLUME accent hover                                     | DIRECT  |
| `color.interactive.active`   | primary pressed              | one stronger brand step                                | TARGET  |
| `color.interactive.disabled` | disabled action surface      | Astryx disabled control semantics                      | DERIVED |
| `color.status.success`       | completed/success            | `--color-success`                                      | DIRECT  |
| `color.status.warning`       | warning/review               | `--color-warning`                                      | DIRECT  |
| `color.status.error`         | operation failure            | `--color-error`                                        | DIRECT  |
| `color.status.info`          | queued/running/info          | blue background/border/text aliases                    | DIRECT  |
| `color.validation.pass`      | rule success                 | success + success-muted                                | DERIVED |
| `color.validation.warning`   | acknowledged/reviewable      | warning + warning-muted                                | DERIVED |
| `color.validation.fail`      | blocking rule error          | error + error-muted                                    | DERIVED |

Literal target colors are review anchors, not permission to replace the Astryx neutral theme wholesale. Contrast must be measured against the actual resolved theme in PI-4C.

### 2.1 Required Light/Dark semantic pairs

The names below are the canonical PI-4C target aliases. Existing names such as `color.surface.app` and `color.surface.canvas` may remain compatibility aliases to `color.background.app` and `color.surface.canvas-stage`.

| Semantic token               |     Light |      Dark | Verified basis / implementation note                   |
| ---------------------------- | --------: | --------: | ------------------------------------------------------ |
| `color.brand.wordmark`       | `#000000` | `#FFFFFF` | Actual supplied black/white artwork; never recolor     |
| `color.brand.primary`        | `#171717` | `#F5F7FA` | Theme text/identity family, not a new Astryx API       |
| `color.accent.primary`       | `#3157C8` | `#8EA8FF` | PLUME accent mapped from verified blue semantic family |
| `color.accent.hover`         | `#2747A6` | `#AFC0FF` | Derived theme step                                     |
| `color.accent.active`        | `#1F3985` | `#708FE8` | Derived theme step                                     |
| `color.background.app`       | `#F1F1F1` | `#121418` | Astryx body background family                          |
| `color.background.editor`    | `#E7E9EE` | `#0F1115` | Gobanos Editor chrome target                           |
| `color.surface.primary`      | `#FFFFFF` | `#1B1E24` | Astryx surface family                                  |
| `color.surface.secondary`    | `#F6F6F6` | `#22262D` | Derived grouped surface                                |
| `color.surface.subtle`       | `#F1F1F1` | `#272B33` | Astryx muted background family                         |
| `color.surface.elevated`     | `#FFFFFF` | `#2B3038` | Astryx card/popover family + restrained elevation      |
| `color.surface.selected`     | `#EEF3FF` | `#26365F` | Blue selected background family                        |
| `color.surface.hover`        | `#F5F7FC` | `#252A34` | Overlay/background family                              |
| `color.surface.canvas-stage` | `#333741` | `#0B0D10` | Gobanos stage target; never applied to creative pixels |
| `color.surface.artboard`     | `#FFFFFF` | `#FFFFFF` | Renderer artifact plane remains theme-independent      |
| `color.text.primary`         | `#171717` | `#F5F7FA` | Astryx text primary family                             |
| `color.text.secondary`       | `#525252` | `#C8CDD6` | Astryx text secondary family                           |
| `color.text.muted`           | `#737373` | `#9DA5B3` | Metadata with measured AA contrast where required      |
| `color.text.disabled`        | `#A3A3A3` | `#68707E` | Disabled family; reason remains readable separately    |
| `color.text.inverse`         | `#FFFFFF` | `#111318` | Text on strong opposite-tone/accent surfaces           |
| `color.border.default`       | `#D4D4D4` | `#343A45` | Astryx border family                                   |
| `color.border.strong`        | `#A3A3A3` | `#586170` | Emphasized boundary family                             |
| `color.border.focus`         | `#3157C8` | `#9DB2FF` | Accent/focus family; 2 px ring + 3 px offset           |
| `color.interactive.primary`  | `#3157C8` | `#8EA8FF` | Accent family; Dark uses inverse-dark label            |
| `color.interactive.hover`    | `#2747A6` | `#AFC0FF` | Derived theme step                                     |
| `color.interactive.active`   | `#1F3985` | `#708FE8` | Derived theme step                                     |
| `color.interactive.disabled` | `#B9C3E5` | `#3F485C` | Disabled control surface                               |
| `color.status.success`       | `#007A3D` | `#66D19E` | Astryx success semantic family                         |
| `color.status.warning`       | `#8A5B00` | `#F4C56A` | Astryx warning semantic family                         |
| `color.status.error`         | `#A50C25` | `#FF8B9A` | Astryx error semantic family                           |
| `color.status.info`          | `#2457C5` | `#87B4FF` | Astryx blue/info family                                |
| `color.validation.pass`      | `#007A3D` | `#66D19E` | Success family + icon/text/border                      |
| `color.validation.warning`   | `#8A5B00` | `#F4C56A` | Warning family + icon/text/border                      |
| `color.validation.fail`      | `#A50C25` | `#FF8B9A` | Error family + icon/text/border                        |

Each status/validation foreground is paired with a theme-appropriate muted surface and border derived from the same verified Astryx semantic family. PI-4C must measure the resolved combinations; low-contrast alpha-only substitutions are forbidden.

### 2.2 Theme and Renderer boundary

`color.background.editor`, panels, toolbar, stage, selection, focus, and validation surfaces switch by theme. `color.surface.artboard` represents the surrounding artifact plane only; Renderer output pixels, exported creative pixels, and user assets never receive theme filters or recoloring.

## 3. Text tokens

| Token                    | Size / line / weight                            | Mapping                        |
| ------------------------ | ----------------------------------------------- | ------------------------------ |
| `text.family.ui`         | Figtree, Pretendard, Noto Sans KR, system stack | existing `--plume-font-body`   |
| `text.page.title`        | 24 / 32 px / 600                                | Astryx H1 target               |
| `text.section.title`     | 20 / 28 px / 600                                | Astryx H2 target               |
| `text.panel.title`       | 17 / 24 px / 600                                | Astryx H3 target               |
| `text.body`              | 14 / 20 px / 400                                | Astryx Body                    |
| `text.label`             | 14 / 20 px / 500                                | Astryx Label                   |
| `text.caption`           | 12 / 18 px / 400                                | Astryx Supporting              |
| `text.metadata`          | 12 / 18 px / 500                                | Supporting-derived             |
| `text.button`            | 14 / 20 px / 600                                | Label-derived                  |
| `text.form`              | 14 / 20 px / 400                                | Body-derived                   |
| `text.control.compact`   | 12 / 16 px / 500                                | Supporting-derived             |
| `text.numeric.dimension` | 13 / 18 px / 500, tabular                       | Body-derived + numeric feature |

Heading semantics must match document hierarchy; typography size alone cannot replace an `h1`–`h3` structure.

## 4. Space tokens

| Token               |    Value | Typical use                        |
| ------------------- | -------: | ---------------------------------- |
| `space.0`           |        0 | attached regions                   |
| `space.0_5`         |     2 px | hairline optical adjustment        |
| `space.1`           |     4 px | icon-label micro gap               |
| `space.2`           |     8 px | compact control and metadata stack |
| `space.3`           |    12 px | Editor group and row inset         |
| `space.4`           |    16 px | default component gap/inset        |
| `space.5`           |    20 px | dense section inset                |
| `space.6`           |    24 px | page section gap/dialog inset      |
| `space.8`           |    32 px | management page inset              |
| `space.10`          |    40 px | major separation                   |
| `space.12`          |    48 px | empty-state or page rhythm         |
| `space.16`          |    64 px | rare major page boundary           |
| `space.panel.gap`   |    12 px | properties/layers groups           |
| `space.page.gutter` | 24–32 px | responsive management gutter       |

The existing Astryx aliases `--spacing-0` through `--spacing-12` are DIRECT for their corresponding scale entries. Values above the installed alias range are TARGET composites, not invented Astryx token names.

## 5. Size tokens

| Token                         |                      Value | Meaning                                               |
| ----------------------------- | -------------------------: | ----------------------------------------------------- |
| `size.control.sm`             | Astryx `--size-element-sm` | compact non-primary controls                          |
| `size.control.md`             | Astryx `--size-element-md` | default control                                       |
| `size.control.lg`             | Astryx `--size-element-lg` | primary setup CTA                                     |
| `size.target.minimum`         |                      40 px | default pointer target                                |
| `size.target.compact.minimum` |                      32 px | dense Editor exception with adjacent spacing/tooltips |
| `size.shell.top`              |                      56 px | global header budget                                  |
| `size.shell.nav`              |                     256 px | standard navigation panel; matches repository preset  |
| `size.editor.icon_rail`       |                      64 px | Editor mode rail                                      |
| `size.editor.creative_list`   |                     232 px | repository compact panel preset                       |
| `size.editor.inspector`       |                     380 px | repository inspector preset                           |
| `size.editor.canvas_min`      |                     640 px | usable stage minimum before panel swap                |
| `size.content.max`            |                    1440 px | management content cap where reading width benefits   |

Structural pixel budgets are intentional; content spacing must use the scale.

## 6. Radius, border, and shadow tokens

| Token                  | Mapping / target                                           |
| ---------------------- | ---------------------------------------------------------- |
| `radius.none`          | `--radius-none`                                            |
| `radius.inner`         | `--radius-inner`                                           |
| `radius.control`       | `--radius-element`                                         |
| `radius.card`          | `--radius-container`                                       |
| `radius.panel`         | `--radius-container`; zero for edge-attached Editor panels |
| `radius.modal`         | `--radius-container` target                                |
| `radius.full`          | `--radius-full`                                            |
| `border.width.default` | 1 px                                                       |
| `border.width.focus`   | 2 px                                                       |
| `border.style.default` | solid                                                      |
| `shadow.low`           | `--shadow-low`                                             |
| `shadow.medium`        | `--shadow-med`                                             |
| `shadow.high`          | `--shadow-high`                                            |
| `shadow.selected`      | `--shadow-inset-selected`                                  |
| `shadow.warning`       | `--shadow-inset-warning`                                   |
| `shadow.error`         | `--shadow-inset-error`                                     |

## 7. Motion tokens

| Token                        | Mapping / target                       | Use                      |
| ---------------------------- | -------------------------------------- | ------------------------ |
| `motion.duration.micro`      | `--duration-fast`, target 100–150 ms   | hover/selection/status   |
| `motion.duration.panel`      | `--duration-medium`, target 180–240 ms | drawer/dialog/panel      |
| `motion.duration.continuous` | `--duration-slow`                      | spinner/progress only    |
| `motion.easing.standard`     | `--ease-standard`                      | non-continuous UI motion |
| `motion.reduced`             | 0–1 ms, no transform                   | reduced-motion override  |

## 8. Z-index tokens

These are PLUME semantic layers; PI-4C must map them to Astryx LayerProvider behavior instead of relying on arbitrary global integers.

| Token               | Relative order |
| ------------------- | -------------: |
| `z.base`            |              0 |
| `z.sticky`          |             10 |
| `z.editor.floating` |             20 |
| `z.popover`         |             30 |
| `z.toast`           |             40 |
| `z.dialog.backdrop` |             50 |
| `z.dialog`          |             60 |
| `z.critical`        |             70 |

## 9. State token recipes

| Recipe             | Surface       | Border        | Content           | Additional cue                              |
| ------------------ | ------------- | ------------- | ----------------- | ------------------------------------------- |
| Selected           | selected      | strong/accent | primary           | check/indicator + semantic selected state   |
| Disabled           | subtle        | default       | disabled          | disabled attribute + reason                 |
| Read-only          | subtle        | default       | primary/secondary | lock/read-only label where needed           |
| Busy               | primary       | default       | primary           | spinner/progress + persistent verb          |
| Validation PASS    | success-muted | success       | success           | check icon + PASS                           |
| Validation WARNING | warning-muted | warning       | warning           | warning icon + count/action                 |
| Validation FAIL    | error-muted   | error         | error             | error icon + blocker/action                 |
| Execution failed   | error-muted   | error         | error             | system icon + “could not run” + Retry       |
| Unavailable        | subtle        | default       | disabled          | unavailable badge + contract/catalog reason |

The recipes are semantic in both themes. Dark mode uses the Dark token column and lighter status foregrounds; it does not invert icons or remove borders. Inherited Campaign assets and Project-local targets retain source headings, badges, icons, and metadata in addition to any theme color.

## 10. Usage guardrails

- Never encode component state by opacity alone.
- Never introduce raw status colors in a screen.
- Never use `z-index` outside the semantic layer policy.
- Never use the page radius for controls or the full radius for ordinary cards.
- Never shrink Editor text below 12 px.
- Never assume current official Astryx token names that are absent from installed `0.1.9`; use verified repository aliases or document a PI-4C gap.
- Never use CSS filters to switch Gobanos wordmark color or Renderer output appearance.
- Never allow theme choice to change responsive capability or contract availability.
