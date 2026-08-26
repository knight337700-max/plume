# PI-4A Structural Wireframes

Status: `FREEZE_CANDIDATE`

Fidelity: low/mid; structure, hierarchy, states, and action placement only.

Legend: `[Primary]`, `[Secondary]`, `(disabled: reason)`, `!` warning/error, `…` loading.

## 1. Global Shell

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ PLUME        Account: Acme ▼        Jobs 1 running   Notifications   User ▼ │
├──────────────────┬───────────────────────────────────────────────────────────┤
│ AI Creative HOME│ Account / Campaign / Project breadcrumb                  │
│ Campaigns       ├───────────────────────────────────────────────────────────┤
│   Campaign A    │                                                           │
│     Overview    │                    ROUTE CONTENT                          │
│     Assets      │                                                           │
│     Projects    │                                                           │
│ Settings        │                                                           │
│                 │                                                           │
├──────────────────┴───────────────────────────────────────────────────────────┤
│ Reconnecting to job updates…                              [Retry connection] │
└──────────────────────────────────────────────────────────────────────────────┘
```

Route rules: AI Creative is the home route. Assets exist only beneath Campaign or Project context. A forbidden/invalid child route renders recovery in the content region while preserving shell navigation.

## 2. AI Creative — Step 1 Creative Setup

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ AI Creative                                                                 │
│ [1 Setup ●] ─ [2 Channel/Format] ─ [3 Generate] ─ [4 Editor]               │
├──────────────────────────────────────────────────────────────────────────────┤
│ CONTEXT                                                                      │
│ Account [Acme ▼]   Campaign [Summer ▼]   Project [Launch ▼]                 │
│ ! Project persistence unavailable at current baseline                       │
├───────────────────────────────┬──────────────────────────────────────────────┤
│ PRODUCT                       │ EFFECTIVE ASSET POOL                         │
│ [Product card selected]       │ Inherited from Campaign [3]                 │
│                               │ [img C] [img C] [img C]                     │
│                               │ Project-local [0] (Add disabled: contract)  │
│                               │ [Manage contextual assets]                  │
├───────────────────────────────┴──────────────────────────────────────────────┤
│ COPY                                                                         │
│ Headline [____________________________________________]                       │
│ Body     [____________________________________________]  [AI Copywriter*]    │
│ * disabled until direct suggestion contract exists                          │
├──────────────────────────────────────────────────────────────────────────────┤
│ Missing: confirmed Project, copy                         [Continue disabled] │
└──────────────────────────────────────────────────────────────────────────────┘
```

Recovery variant: a failed asset panel keeps Product and Copy intact and replaces only the pool with `! Assets failed [Retry]`.

## 3. AI Creative — Step 2 Channel / Format

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ AI Creative                                                                 │
│ [1 Setup ✓] ─ [2 Channel/Format ●] ─ [3 Generate] ─ [4 Editor]             │
├──────────────────────────────────────────────────────────────────────────────┤
│ CHANNELS                                                                     │
│ [Naver GFA] [Kakao Moment ●] [Meta] [Google Ads]                             │
│ Naver/Meta/Google: Catalog not ready                                         │
├──────────────────────────────────────────────────────────────────────────────┤
│ FORMATS                                                    Selected: 2       │
│ ┌────────────────────┐ ┌────────────────────┐ ┌────────────────────┐         │
│ │ ☑ Bizboard         │ │ ☑ Thumbnail Right │ │ ☐ Display Native   │         │
│ │ 1029 × 258         │ │ 1029 × 258        │ │ 1200 × 600 · 2:1  │         │
│ │ Available          │ │ Available          │ │ Available          │         │
│ └────────────────────┘ └────────────────────┘ └────────────────────┘         │
├──────────────────────────────────────────────────────────────────────────────┤
│ [Back]                                            [Continue with 2 formats] │
└──────────────────────────────────────────────────────────────────────────────┘
```

Capability failure variant: replace cards with `! Catalog load failed [Retry]`; do not reuse stale enabled states without disclosure.

## 4. AI Creative — Step 3 AI Generate

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ AI Creative                                                                 │
│ [1 Setup ✓] ─ [2 Channel/Format ✓] ─ [3 Generate ●] ─ [4 Editor]          │
├──────────────────────────────────────────────────────────────────────────────┤
│ REVIEW: Summer / Launch · Product A · 3 assets · 2 formats                  │
│ [Change setup] [Change formats]                              [Generate]      │
├──────────────────────────────────────────────────────────────────────────────┤
│ GENERATION JOB #J42    PARTIAL_SUCCESS    ███████░░  3 / 4                  │
│ ✓ Kakao Bizboard · Variant A                  Creative #C1                  │
│ ✓ Kakao Bizboard · Variant B                  Creative #C2                  │
│ ✓ Thumbnail Right · Variant A                 Creative #C3                  │
│ ! Thumbnail Right · Variant B                 FAILED · safe reason          │
│                                                                              │
│ Completed results will be preserved.  [Retry failed job items] [Cancel*]    │
├──────────────────────────────────────────────────────────────────────────────┤
│ Status updates disconnected; showing last confirmed state. [Reconnect]      │
│                                                    [Continue with 3 results]│
└──────────────────────────────────────────────────────────────────────────────┘
```

`Retry failed job items` invokes the job-level retry contract; the UI must not imply an item-level endpoint. `Cancel` appears only in cancellable states.

## 5. AI Creative — Step 4 Creative Editor

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Summer / Launch / C1     EDITED · Saved     [Validate] [Finalize] [Export] │
├──────────────────┬────────────────────────────────────┬──────────────────────┤
│ CREATIVES        │ CANVAS / RENDERER PREVIEW          │ PROPERTIES           │
│ [C1 Bizboard ●]  │ ┌────────────────────────────────┐ │ Element: Headline    │
│ [C2 Bizboard]    │ │                                │ │ Text [___________]  │
│ [C3 Thumbnail]   │ │       authoritative render     │ │ X/Y  [__] [__]      │
│                  │ │                                │ │ [Preview change]    │
│ LAYERS           │ └────────────────────────────────┘ │ [Apply]              │
│ ▾ Document       │ 100%  Updating preview…            ├──────────────────────┤
│   Image          │                                    │ VALIDATION           │
│   Headline ●     │                                    │ WARNING · 1          │
│   Body           │                                    │ ! Contrast advisory  │
│                  │                                    │ [Acknowledge]        │
├──────────────────┴────────────────────────────────────┴──────────────────────┤
│ AI Draft → Edited → Validated → Final   [Version history] [Reset to AI Draft]│
└──────────────────────────────────────────────────────────────────────────────┘
```

Conflict overlay: `This draft changed elsewhere. [Reload server] [Review local changes]`. Validation execution failure is distinct from a rule `FAIL`; export is disabled until current-version eligibility passes.

## 6. Campaign Overview

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Campaigns / Summer 2026                  ACTIVE            [Start AI Creative]│
├──────────────────────────────────────────┬───────────────────────────────────┤
│ CAMPAIGN CONTEXT                         │ ASSET POOL                        │
│ Brand: Acme                              │ 12 references · 10 eligible       │
│ Brief: Summer launch…                    │ 2 require attention               │
│ Products: 3                              │                  [Open Assets]    │
├──────────────────────────────────────────┴───────────────────────────────────┤
│ PROJECTS                                                        [Create*]    │
│ ! Project contract unavailable. Product hierarchy is reserved here.         │
│ [Project creation disabled: persistence decision required]                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Recent activity omitted until an authoritative activity source exists.      │
└──────────────────────────────────────────────────────────────────────────────┘
```

Each summary can fail independently and display `[Retry section]`; a missing/forbidden Campaign replaces the page body with route recovery.

## 7. Campaign Assets

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Summer 2026 / Assets                          [Add existing] [Upload asset]  │
│ These assets are inherited by Projects.                                      │
├────────────────────────────────────────────────────────┬─────────────────────┤
│ Search [____________] Role [All ▼] Eligibility [All ▼] │ ASSET DETAILS       │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐                 │ hero-v3.png         │
│ │ image    │ │ image    │ │ image    │                 │ Version: 3          │
│ │ HERO     │ │ PRODUCT  │ │ LOGO     │                 │ Eligible ✓          │
│ │ used 2   │ │ used 0   │ │ expired! │                 │ Products: A, B      │
│ └──────────┘ └──────────┘ └──────────┘                 │ Usage: partial*     │
│                                                        │ [View metadata]     │
├────────────────────────────────────────────────────────┴─────────────────────┤
│ * General role/usage graph is not fully contracted; unavailable facts omitted│
└──────────────────────────────────────────────────────────────────────────────┘
```

Upload/add controls render only when the resolved backend policy supports that exact operation. Mutation failure stays attached to the affected row/card.

## 8. Project Overview

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Summer 2026 / Project: Launch                         [Open AI Creative]      │
│ Parent Campaign: Summer 2026                                                │
├────────────────────────────────┬─────────────────────────────────────────────┤
│ ASSETS                         │ CREATIVES                                   │
│ Inherited from Campaign: 12    │ AI Draft 4 · Edited 2 · Final 1            │
│ Project-local: unavailable     │ Validation: 5 pass · 1 warning · 1 fail    │
│ Effective: pending             │                                             │
│ [Open Project Assets]          │ [Open Project Creatives]                    │
├────────────────────────────────┴─────────────────────────────────────────────┤
│ ! Baseline has no first-class Project contract.                              │
│ [Actions disabled until Project identity/persistence is established]         │
└──────────────────────────────────────────────────────────────────────────────┘
```

This is the frozen target layout. PI-4C must show the unavailable state, not client-generated Project content, until the gap is resolved.

## 9. Project Assets

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Summer 2026 / Launch / Assets                    Effective Asset Pool: 12*  │
│ Legend: [C] inherited Campaign  [P] Project-local                            │
├────────────────────────────────────┬─────────────────────────────────────────┤
│ INHERITED FROM CAMPAIGN [12]       │ PROJECT-LOCAL [unavailable]             │
│ [C hero] [C product] [C logo]      │ No Project asset contract.              │
│ Read-only in Project scope         │ [Add disabled] [Replace disabled]       │
│ [Open Campaign source]             │                                         │
├────────────────────────────────────┴─────────────────────────────────────────┤
│ * Effective count is complete only after both sources resolve.               │
│ [Back to Project]                                      [Use in AI Creative] │
└──────────────────────────────────────────────────────────────────────────────┘
```

If either source fails, its pane displays `! Source unavailable [Retry]` and the effective pool is marked incomplete rather than recalculated from one side.

## 10. Project Creatives

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ Summer 2026 / Launch / Creatives                         [New AI Creative]  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Search [________] Channel [All ▼] Format [All ▼] State [All ▼]              │
├────────────┬──────────────┬────────────┬────────────┬─────────────┬───────────┤
│ Preview    │ Channel      │ Format     │ Lifecycle  │ Validation  │ Updated   │
├────────────┼──────────────┼────────────┼────────────┼─────────────┼───────────┤
│ [render]   │ Kakao       │ Bizboard   │ EDITED     │ WARNING     │ 10:42     │
│ [render]   │ Kakao       │ Native 2:1 │ FINAL      │ PASS        │ Yesterday │
├────────────┴──────────────┴────────────┴────────────┴─────────────┴───────────┤
│ Selected: Creative C1   [Open Editor] [Validate] [Export disabled: warning]│
│ ! Project binding is unavailable at baseline; do not fabricate this list.   │
└──────────────────────────────────────────────────────────────────────────────┘
```

List, preview, validation, and export errors are independent. Reopen always resolves the authoritative current version before entering Editor.

## Responsive behavior

- Below desktop width, the shell sidebar collapses to a drawer while context remains in the top bar.
- Setup and management split panes stack summary before details; source badges remain visible.
- Editor preserves the canvas as the primary region. Creative/Layers and Properties/Validation become explicit drawers or tabs; they never disappear silently.
- Tables may become cards, but lifecycle, validation, source, format, and recovery actions remain visible text—not color-only signals.
