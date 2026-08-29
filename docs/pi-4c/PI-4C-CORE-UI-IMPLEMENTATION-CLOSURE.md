# PI-4C Core UI Implementation Closure

## Status and authority

```yaml
gate: PI-4C_CORE_UI_IMPLEMENTATION_RESUME
status: PASS_CANDIDATE
final_authority: Architecture Owner
backend_base: 310bc3aac5aebc524c37dfd6113d15c6c4d5f5e3
resume_checkpoint: c18789ea079a8c800ebc3bb94893225172fb7830
branch: codex/pi-4c-core-ui-resume
```

This closure records the resumed UI implementation and validation. It does not claim final Gate
PASS, authorize GitHub integration, or begin PI-4D.

## Resume history

The UI work was transplanted into a clean dedicated worktree at the checkpoint above after the
PI-4C0.4 durable renderer read path was integrated into authoritative `main`. The original dirty
recovery worktree was not modified. The resumed work retained the existing UI bodies, completed
the durable artifact read seam, strengthened browser and visual evidence, and kept the backend,
worker, migrations, Frozen34, Renderer Source Lock, Railway, and Production unchanged.

## Product hierarchy and route map

The shell preserves Account/Workspace → Campaign → Project → Creative and exposes these routes:

| Surface                       | Route                                                                 |
| ----------------------------- | --------------------------------------------------------------------- |
| Global shell / Campaign index | `/w/:workspaceId/campaigns`                                           |
| AI Creative step 1            | `/w/:workspaceId/ai-creative/setup`                                   |
| AI Creative step 2            | `/w/:workspaceId/ai-creative/format`                                  |
| AI Creative step 3            | `/w/:workspaceId/ai-creative/generate`                                |
| Creative Editor core          | `/w/:workspaceId/ai-creative/editor`                                  |
| Campaign overview             | `/w/:workspaceId/campaigns/:campaignId`                               |
| Campaign assets               | `/w/:workspaceId/campaigns/:campaignId/assets`                        |
| Campaign projects             | `/w/:workspaceId/campaigns/:campaignId/projects`                      |
| Project overview              | `/w/:workspaceId/campaigns/:campaignId/projects/:projectId`           |
| Project assets                | `/w/:workspaceId/campaigns/:campaignId/projects/:projectId/assets`    |
| Project creatives             | `/w/:workspaceId/campaigns/:campaignId/projects/:projectId/creatives` |
| Settings                      | `/w/:workspaceId/settings`                                            |

All twelve surfaces have loading, empty, failure, and resolved behavior appropriate to their
queries. Campaign and Project context remains in the URL, so reload, deep-link, back, and forward
navigation recover from server truth.

## Real API and Project UI

Production components use the existing API client and context-scoped TanStack Query keys. The
Project surfaces use the durable Project APIs to create/read Projects, list and mutate Project
Asset References, resolve the effective Campaign + Project asset pool, list Project CreativeSets,
list each set's Creatives, resolve each Creative's `currentVersionId`, list its durable renders, and
request a render-scoped download URL.

Project Assets visibly separates Campaign inheritance from Project-local references. The real
browser hard pass creates a durable Project, adds a local `REFERENCE`, observes both inherited and
local effective assets, and confirms both entries are frozen in the server-side generation
snapshot. The browser never submits `assetPoolSnapshot`.

Project Creatives no longer paints synthetic card artwork. Each card reads the durable
Creative/CreativeVersion/CreativeRender graph and displays the Renderer artifact when a completed
primary render exists. Query failures remain local to the affected surface.

## AI Creative workflow and durable recovery

The implemented workflow remains four steps:

1. Creative Setup selects real Campaign, Project, Product, and effective assets.
2. Channel / Format exposes only active catalog choices and persists exact Campaign Format
   Selection identities.
3. AI Generate sends Project/product/format identities into the existing durable
   `creative.generate` pipeline. Progress and job-level retry/cancel recover from the job ID in the
   URL and server state; there is no fabricated item retry or localStorage domain authority.
4. Creative Editor opens the generated durable Creative and its current version.

The hard pass reloads the generation route, waits for worker completion, opens the generated
Creative, reloads the Editor route, and recovers the same durable artifact.

## Creative Editor render path

The read path is:

```text
Project → CreativeSet → Creative.currentVersionId → CreativeVersion
        → GET /creative-versions/:versionId/renders
        → deterministic completed PREVIEW, else completed FINAL_EXPORT
        → GET /creative-versions/:versionId/renders/:renderId/download-url
        → browser-decoded Renderer bytes
```

Selection prefers the newest completed `PREVIEW`, then the newest completed `FINAL_EXPORT`, with
timestamp and ID tie-breaking. Unsupported purposes and failed outcomes do not silently become the
primary preview. Version loading, render-list loading, no-render, renderer failure, download
authorization, artifact-byte loading, loaded, and decode failure are distinct states. Renderer
failure is not presented as validation failure.

The browser hard pass correlates CreativeVersion, CreativeRender, FileObject checksum/byte count,
the scoped endpoint, HTTP success, and the image's natural dimensions. Cross-workspace, wrong
version/render, and unknown-render attempts fail closed. No UI code consumes a raw FileObject ID or
constructs a storage object key.

Fit and zoom affect only preview presentation. Renderer pixels are displayed without browser
recomposition, crop, filter, geometry mutation, or theme mutation. Layers and properties are
read-only projections of the canonical document.

## PI-4C / PI-4D boundary

PI-4C provides navigation, durable data binding, preview, selection, read-only inspection, theme,
responsive behavior, and accessible controls. Advanced element mutation, save/autosave semantics,
validation execution/projection, finalize, approval, and export remain deferred to PI-4D or later
authorized Gates. The validation pane explicitly reports that no durable validation projection is
available instead of inferring PASS from a successful render.

## Theme, responsive behavior, and accessibility

System, Light, and Dark preferences are semantic-token driven and persist across reload. System
tracks the OS media query. Theme changes do not alter the Renderer artifact URL contract or image
bytes.

Visual validation covers 1600, 1440, 1280, 1024, and below-1024 width classes. Desktop preserves
the three-column Editor; small screens enter limited review mode while keeping Creative selection,
preview, Fit/Zoom, inspector context, and status available. Management pages reflow without page
horizontal overflow at 200% zoom.

Keyboard coverage includes skip-link flow, workflow navigation, dialog Escape handling, a trapped
mobile navigation drawer, and focus return to the menu trigger. Axe reports no serious or critical
violations across all twelve surfaces. Reduced-motion rules collapse transitions and animations to
non-meaningful durations.

## Visual review

The committed visual matrix contains ten primary 1440px Light captures, ten matching Dark
captures, separate Campaign Projects and Settings route captures, and responsive samples for the
Global Shell, AI Step 1, Project Assets, and Creative Editor. Representative and full matrix images
were inspected for overlap, clipping, unexpected page scrollbars, logo failures, missing previews,
context drift, dark-mode treatment, and layout collapse.

## Browser hard pass and validation

The hard pass uses the real web app, real API, local PostgreSQL, local Redis/BullMQ, local MinIO,
the durable worker pipeline, an allowed mock provider, and the unchanged Renderer. It covers Project
creation, inherited/local assets, active catalog format binding, durable generation and refresh,
Project Creative creation, current-version resolution, render listing, scoped download, exact-byte
checksum, Editor recovery, security failures, and Project Creative card preview.

Final candidate validation requires and records PASS for contracts drift, typecheck, lint,
unit/integration tests, browser E2E, visual regression, accessibility, integrity, production web
build, and cumulative changed-file Prettier. Full-suite failures, if any, are compared with the
authoritative backend base; head-only regressions must remain zero.

## Frozen and scope proof

The cumulative diff from `310bc3aac5aebc524c37dfd6113d15c6c4d5f5e3` contains no backend
contract path, worker path, database migration, Frozen34, or Renderer Source Lock changes. The only
non-UI runtime-adjacent change is the testkit browser harness composition seam that injects the
already-existing durable Creative repository and render artifact download service for real local
browser testing. It does not modify production composition or behavior.

## Open and deferred items

- Advanced canvas and layer/property editing remains PI-4D.
- Durable validation runs/results, finalize, approval, and export UI remain deferred.
- Any broader permission-aware command enablement must follow the existing server contract rather
  than optimistic client-only state.
- PI-4D is proposed only after Architecture Owner review and is not authorized by this document.
