# ADR-003: Template semantic-placement boundary

- Status: Accepted
- Date: 2026-08-20
- Scope: PI-2A first Kakao Bizboard template semantic-placement target

## Context

PI-2A0 synchronized the missing thumbnail-box-right evidence from the pinned
Frozen Renderer. The next decision is which implemented `TEMPLATE_LOCKED`
profile should be the first Plume semantic-placement target, and where Agent,
Plume, and Renderer responsibilities stop.

## Decision

The first Plume semantic-placement integration target is
`KAKAO_BIZBOARD_THUMBNAIL_BOX_RIGHT`, rendered by
`KAKAO_MOMENT_BIZBOARD_THUMBNAIL_BOX_RIGHT` with the single `IMAGE_PRIMARY`
slot. The profile is `IMPLEMENTED`, `TEMPLATE_LOCKED`,
`RENDERER_COMPOSED`, and requires `SEMANTIC_CROP_COVER` semantic placement.

For `TEMPLATE_LOCKED` semantic profiles, `LAYOUT_PLANNER` may make
image-semantic decisions—subject, semantic region, focal point, crop preference,
rationale, and confidence—but may not control renderer-owned template
geometry, text layout, masks, or pixels.

`CropCandidate` and `Accepted ImagePlacementPlan` remain separate. Plume owns
candidate construction, validation, and selection; only the accepted plan is
sent to the Frozen Renderer. The first implementation is constrained to one
normalized candidate. A primary product subject is required and may not be
clipped.

The accepted Agent intent uses `SEMANTIC_CROP_COVER`, `source: AGENT`,
`fitMode: COVER`, `anchor: CENTER`, `subjectProtection: REQUIRED`, and a
`cropCandidateId` reference. The manual `MANUAL_CROP` path remains supported
and equivalent when effective crop geometry is equal.

## Consequences

- Renderer geometry, mask, validation, and final pixels remain authoritative.
- Semantic-placement failures remain fail-closed; there is no fallback or
  auto-clamping.
- No active thumbnail runtime binding or public Renderer API expansion is
  implied by this decision.
- The decision is a target freeze, not PI-2B crop implementation or PI-3
  `FREEFORM` layout.

## Deferred scope

Agent `imageInputs`, semantic crop generation, candidate ranking, real-image
E2E, active runtime binding, Naver/Meta/Google, and deployment work are later
gates. The multi-image thumbnail and mask/optional-logo profiles are subsequent
semantic-placement expansion targets.
