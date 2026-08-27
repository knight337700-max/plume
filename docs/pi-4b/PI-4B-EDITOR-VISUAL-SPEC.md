# PI-4B Creative Editor Visual Specification

Status: `DEEP_SPEC_COMPLETE`

Priority: Highest PI-4B screen

Structure: `Creative List | Canvas / Preview | Layers / Properties`

## 1. Editor frame

The Editor is a full-height workspace, not a card inside a management page. The frozen region budget is based on the existing `CreativeEditorShell`:

| Region            |                          Expanded / standard | Compact behavior                                 |
| ----------------- | -------------------------------------------: | ------------------------------------------------ |
| Icon rail         |                                        64 px | 48–56 px or merged into toolbar                  |
| Creative list     | 232 px default, resizable within safe bounds | Drawer/tab                                       |
| Canvas workspace  |            flex; 640 px minimum usable stage | Preserved as primary region                      |
| Context inspector | 380 px default, resizable within safe bounds | Drawer/tab                                       |
| Toolbar           |                                     40–48 px | Wrap forbidden; groups collapse to menus         |
| Footer/status     |                                     32–40 px | Remains visible for save/render/validation state |

At expanded widths all three columns are visible. Resize handles must be keyboard operable and cannot reduce the stage below 640 px. Under 1024 px, the Editor enters limited preview/review mode rather than compressing all regions into unusable columns.

## 2. Left panel — Creative List

### Anatomy

1. Panel heading and total count.
2. Optional contract-backed filter.
3. Scrollable list.
4. Creative item: thumbnail, name/id, channel + format, lifecycle, validation marker, updated metadata.

Item height is 64–76 px with 8 px internal gaps. Thumbnail ratio follows the format but is placed in a consistent bounding box. Long profile names truncate visually with accessible full text. Selection uses selected surface, 3 px leading accent, strong text, and selected semantics. Keyboard arrows move within the list; Enter selects/opens according to implementation convention.

Lifecycle and validation remain distinct. For example, `EDITED · WARNING` is valid. A render/artifact failure uses a separate preview icon and cannot masquerade as validation FAIL.

## 3. Center — Canvas / Preview

### Stage and artboard

- Stage: Light uses quiet mid-neutral `#333741`; Dark uses near-black `#0B0D10`; no decorative grid by default.
- Artboard: canonical aspect ratio, white/content surface, one-pixel strong border, low shadow.
- Renderer preview: contain-fit without browser-side crop or layout correction.
- Empty/loading: artboard ratio remains reserved; skeleton does not pulse under reduced motion.
- Transparency: checkerboard appears only when alpha is semantically relevant and uses two low-contrast neutral tiles; never behind opaque profiles as decoration.

### Viewport controls

Fit centers the complete artboard with safe stage padding. Zoom supports explicit percentage, step controls, and keyboard shortcuts only after conflict review. Zoom changes viewport scale, not document geometry. Pan, if supported, is bounded and has a non-drag reset (`Fit`).

### Selection and validation overlays

Selected element receives a two-pixel accent outline outside its computed bounds, a small accessible label, and handles only for editable dimensions. Renderer-controlled or locked selection receives an outline plus lock indicator without active handles. Validation issue indicators sit at the layer/bounds edge and link to the issue list; they do not recolor the creative itself.

Guides/grid/snap visuals are not enabled in the frozen baseline because supported persistence and behavior are not established. Their absence does not prevent renderer-provided boundaries or safe-area indicators from being displayed read-only when contract evidence exists.

## 4. Right panel — Inspector

### Structure

The inspector has three logical views: `Layers`, `Properties`, and `Validation`. Expanded desktop may show Layers above Properties with collapsible groups; standard/compact may use a TabList/SegmentedControl. The selected layer is synchronized across list, canvas, and Properties.

### Layers

Layer row: hierarchy affordance, type icon, label, validation marker, visibility, and lock/read-only status. Reorder is absent unless the document operation contract explicitly supports it. Locked and hidden states use icon + label/tooltip; color is supplemental.

### Properties

Property groups are ordered: Content, Asset, Typography/Appearance, Geometry, Metadata. Only groups relevant to the selected element appear. Input edits show unsaved/saving/error in the persistent version bar. Invalid fields keep user input and present correction text.

Renderer-owned geometry displays values such as `x`, `y`, `width`, `height`, or slot constraints as readable rows with `Renderer-controlled`. No disabled input styling is used for values that users primarily need to read; read-only text has normal contrast.

### Validation

Header gives literal `PASS`, `WARNING`, `FAIL`, or `Validation could not run`, issue counts, run/version identity, and action. Issue cards link to affected layers/elements only when IDs exist. A new edit invalidates the current validated projection visually and returns lifecycle to Edited/current draft evidence.

## 5. Toolbar action classification

| Group        | Action     | Classification   | Enablement / reason                                                                         |
| ------------ | ---------- | ---------------- | ------------------------------------------------------------------------------------------- |
| History      | Undo       | DEFERRED         | No frozen client/server undo contract                                                       |
| History      | Redo       | DEFERRED         | No frozen redo contract                                                                     |
| Viewport     | Zoom       | VISIBLE_ENABLED  | Local viewport only; does not mutate document                                               |
| Viewport     | Fit        | VISIBLE_ENABLED  | Local viewport reset                                                                        |
| Editing      | Asset      | VISIBLE_ENABLED  | Only for supported asset-bearing fields and mutable version; otherwise disabled with reason |
| Editing      | Copy       | VISIBLE_ENABLED  | Only for contract-supported text fields and mutable version                                 |
| Editing      | Layout     | VISIBLE_DISABLED | Enabled only for proven FREEFORM geometry operation; baseline must fail closed              |
| Assistance   | Guide      | DEFERRED         | No frozen guide behavior/persistence                                                        |
| Assistance   | Grid       | DEFERRED         | No frozen grid behavior/persistence                                                         |
| Assistance   | Snap       | DEFERRED         | No frozen snap behavior/persistence                                                         |
| AI           | Regenerate | VISIBLE_DISABLED | Requires supported regeneration command/context; never implies per-item retry               |
| Finalization | Validation | VISIBLE_ENABLED  | Current version and validation endpoint required                                            |
| Finalization | Finalize   | VISIBLE_DISABLED | Enabled after current validation/acknowledgement and approval readiness                     |
| Finalization | Export     | VISIBLE_DISABLED | Enabled only after `checkExportEligibility` and current final/approval evidence             |

`VISIBLE_DISABLED` defines placement and visual treatment but not unconditional runtime enablement. `DEFERRED` means omitted from PI-4C production UI unless a separate contract decision activates it.

## 6. Format capability matrix

| Capability                | FREEFORM                          | TEMPLATE_LOCKED                          | Unsupported / unknown     |
| ------------------------- | --------------------------------- | ---------------------------------------- | ------------------------- |
| Preview renderer artifact | Visible                           | Visible                                  | Failure/unavailable state |
| Select layer/element      | If document evidence exists       | If document evidence exists              | Hidden                    |
| Edit copy/content         | If mutable field operation exists | If mutable slot/content operation exists | Read-only/hidden          |
| Replace asset             | If mutable asset operation exists | If mutable slot replacement exists       | Read-only/hidden          |
| Edit x/y                  | Only when contract-supported      | Read-only renderer-controlled            | Hidden/read-only          |
| Edit width/height         | Only when contract-supported      | Read-only renderer-controlled            | Hidden/read-only          |
| Reorder layers            | Only when operation exists        | Read-only                                | Hidden                    |
| Guides/grid/snap          | Deferred                          | Deferred                                 | Hidden                    |
| Validate                  | Current-version endpoint          | Current-version endpoint                 | Disabled with reason      |
| Export                    | Eligibility contract              | Eligibility contract                     | Disabled with blocker     |

`FREEFORM` is not blanket permission to edit all geometry. It enables only fields and operations proven by the current contract. `TEMPLATE_LOCKED` keeps renderer-owned geometry read-only even if values are visible.

## 7. AI Draft, Current, and version states

There is no separate AI Draft page. The Editor status region shows:

- `AI Draft`: proven generated ancestor/current generated draft.
- `Current`: current version/revision and save state.
- lifecycle projection: AI_DRAFT, EDITED, VALIDATED, or FINAL.

`Reset to AI Draft` appears only when provenance proves the generated ancestor. It is secondary/destructive-to-current-work, opens a confirmation dialog, identifies the target version, and does not promise in-place mutation. If provenance is ambiguous, the action is absent.

Save state mapping:

| State             | Visual treatment                                                  |
| ----------------- | ----------------------------------------------------------------- |
| Clean/saved       | Check + `Saved` + timestamp where useful                          |
| Unsaved           | Neutral/accent dot + `Unsaved changes`                            |
| Saving            | Spinner + `Saving…`, polite live region                           |
| Save failed       | Error icon + `Could not save` + supported Retry                   |
| Revision mismatch | Warning/error banner; preserve local input; reload/resolve action |
| Frozen/final      | Lock + `Final`; editing creates a new version if supported        |

## 8. Validation visual model

| UX result        | Summary                                       | Canvas                                   | Inspector/detail                    | Next action                         |
| ---------------- | --------------------------------------------- | ---------------------------------------- | ----------------------------------- | ----------------------------------- |
| PASS             | Success icon, PASS, zero blocking issues      | optional success marker outside artboard | collapsed success summary           | Finalize/request approval           |
| WARNING          | Warning icon, count, acknowledgement status   | issue pins if locations exist            | warning cards grouped by layer/rule | Review and acknowledge if supported |
| FAIL             | Error icon, blocking count                    | issue pins + selected issue outline      | fail cards first, exact blockers    | Fix and revalidate                  |
| Execution FAILED | System error icon, “Validation could not run” | no fail coloring of creative             | attributed error details            | Retry run if supported              |

Color, icon, literal label, border, and placement all participate. Renderer remains validation authority; the Editor projects returned results.

## 9. Finalize and export sequence

1. User edits current version.
2. User validates current version.
3. PASS or acknowledged WARNING establishes validation readiness.
4. Finalize/request approval follows current contract.
5. Current approved evidence yields UX FINAL.
6. Export checks eligibility and displays exact blockers or package summary.

No step is visually skipped. Export may remain disabled after FINAL when eligibility has independent blockers such as assets, recipe, or revalidation.

## 10. Keyboard and accessibility behavior

- A skip/link mechanism reaches the canvas workspace and inspector.
- Tab order follows toolbar → creative list → canvas controls → inspector → status/finalization, with region shortcuts permitted only when documented.
- Canvas selection has a list/tree equivalent; drag is never the only operation.
- ResizeHandle has a name and keyboard adjustment.
- Icon buttons have accessible names and tooltips.
- Focus remains visible on the stage and within panels.
- Live updates use polite announcements; errors requiring action use an appropriate alert.
- Zoom does not scale surrounding text or focus indicators.
- Minimum standard target is 40 px; compact 32 px controls require spacing and tooltip/name support.

## 11. Limited-width policy

| Width class  | Editor behavior                                                                                                  |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| ≥ 1600 px    | Expanded: all regions; stage absorbs surplus                                                                     |
| 1280–1599 px | Standard: fixed 64/232/380 regions + usable stage                                                                |
| 1024–1279 px | Compact: stage primary; creative list and inspector become drawers/tabs                                          |
| < 1024 px    | Limited preview/review: select creative, inspect status/validation, Fit/Zoom; full geometry editing not promised |

The application must disclose limited mode. It must not render three unusably narrow columns or silently hide finalization state.

## 12. Dark Editor specification

Dark mode is a semantic treatment of Editor chrome, never an alteration of creative content.

| Editor region/state     | Light                                   | Dark                                               | Invariant                                |
| ----------------------- | --------------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| Editor background       | `#E7E9EE`                               | `#0F1115`                                          | Full-height tool frame                   |
| Creative List panel     | White/primary surface                   | `#1B1E24`                                          | 232 px default and same item anatomy     |
| Canvas stage            | `#333741`                               | `#0B0D10`                                          | Largest continuous region                |
| Artboard edge           | Strong gray border + low shadow         | `#586170` edge + restrained neutral separation     | Renderer artifact ratio/pixels unchanged |
| Inspector               | White/primary surface                   | `#1B1E24` with `#343A45` dividers                  | 380 px default and same groups           |
| Toolbar/status          | Primary/elevated surfaces               | `#22262D`/`#2B3038`                                | Same actions and classifications         |
| Selected creative/layer | Light blue selected surface + indicator | `#26365F` + light accent indicator                 | Selected semantics and synchronization   |
| Read-only field         | Light subtle row + lock text            | `#272B33` row + readable lock text                 | `Renderer-controlled` reason             |
| Focus visible           | `#3157C8` ring                          | `#9DB2FF` ring                                     | 2 px ring + 3 px offset                  |
| Transparency            | Low-contrast checkerboard when relevant | Dark-theme checkerboard with distinguishable tiles | Never applied to opaque output           |

The Dark artboard may remain visually light because it presents theme-independent Renderer output. Contrast is created at the edge/stage boundary rather than by filtering, dimming, or recoloring the artifact.

### 12.1 Canvas and Renderer theme boundary

```yaml
renderer_theme_boundary:
  renderer_pixels_change_with_app_theme: false
  app_chrome_change_with_theme: true
  canvas_stage_change_with_theme: true
  artboard_content_authority: RENDERER
```

No CSS `filter`, blend mode, opacity adjustment, forced darkening, or export recoloring may be applied to preview/output pixels. Selection boxes and validation pins are separate UI overlays and use theme-aware tokens.

### 12.2 Dark Layers and Properties

Layer rows use tonal surfaces, default dark borders, primary/secondary text, and visible lock/visibility/validation icons. Selected layers use a check/indicator or synchronized canvas outline beyond color. Property groups are separated by spacing and dividers, not stacked heavy shadows. Inputs use readable borders and focus rings; read-only values retain primary readability rather than disabled-gray contrast.

### 12.3 Dark validation and lifecycle

- PASS uses bright success foreground, check icon, literal `PASS`, muted success surface, and border.
- WARNING uses bright warning foreground, warning icon, literal `WARNING`, muted warning surface, and border.
- FAIL uses bright error foreground, error icon, literal `FAIL`, muted error surface, and border.
- Execution failure retains the system-error treatment and “Validation could not run.”
- AI_DRAFT, EDITED, VALIDATED, and FINAL badges retain text and icon/lock cues in addition to theme color.

### 12.4 Gobanos presence

The Gobanos wordmark may appear in the Editor shell/header only when there is sufficient width and must remain subordinate to Canvas content. Dark uses the exact white asset. The logo is never placed on the artboard or user creative unless the user explicitly supplies it as creative content.

## 13. Theme/responsive parity

Light and Dark use the same ≥1600 Expanded, 1280–1599 Standard, 1024–1279 Compact, and <1024 Limited mode rules. Theme selection cannot change panel budgets or unlock advanced geometry editing. PI-4C E2E must resize the actual browser in both themes and verify list/inspector drawer/tab transitions, Canvas priority, focus visibility, and limited-mode disclosure.
