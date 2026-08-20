# PI-2A Template Semantic Placement Target Freeze

## Purpose

PI-2A reruns the target-freeze gate after PI-2A0 packaged the missing Frozen
Renderer thumbnail evidence. This gate selects the first semantic-placement
profile and freezes responsibility boundaries; it does not implement semantic
crop generation or activate a Product runtime binding.

The machine-readable source of truth is
[`pi-2a-semantic-placement-target-freeze.json`](./pi-2a-semantic-placement-target-freeze.json).

## Parent PI-2A0 evidence sync

The rerun is based on Plume commit
`88cb3b415c189181d0b970e700bcb5654359f48e` on
`codex/pi-2a0-renderer-vendor-evidence-sync`, PR #25. The vendored source lock
contains 111 files and remains pinned to
`knight337700-max/plume-renderer@7baa272dd852ed21a09cf369c928571b3f75fd31`
with integration contract `1.8.0`.

The three required thumbnail evidence files are verified byte-for-byte by the
freeze verifier using their committed SHA-256 digests. Existing PI-2A0 vendor
evidence is read-only in this gate.

## Why Thumbnail Box Right

The first target is `KAKAO_BIZBOARD_THUMBNAIL_BOX_RIGHT`, rendered by
`KAKAO_MOMENT_BIZBOARD_THUMBNAIL_BOX_RIGHT` into the single `IMAGE_PRIMARY`
slot. The Frozen Renderer reports the profile as `IMPLEMENTED`,
`TEMPLATE_LOCKED`, `RENDERER_COMPOSED`, and `semanticPlacement: REQUIRED`.
It accepts `SEMANTIC_CROP_COVER` and `MANUAL_CROP`, supports agent placement,
and accepts PNG or JPEG without requiring alpha. Its single image slot keeps
the first semantic crop verification independent of multi-image and logo
variables.

The Plume selection-only format ID is
`kakao-moment-bizboard-thumbnail-box-right-1029x258`. PI-2A does not bind this
ID into active runtime format resolution.

## Rejected first candidates

- `KAKAO_BIZBOARD_THUMBNAIL_MULTI_RIGHT` is deferred because it requires both
  `IMAGE_PRIMARY` and `IMAGE_SECONDARY` semantic slots.
- `KAKAO_BIZBOARD_MASK_SEMICIRCLE_RIGHT` is deferred because it adds an
  optional `LOGO_PRIMARY` and a mask.

## Renderer runtime readiness and ownership

The vendored Frozen Renderer contains the thumbnail renderer, integration test,
valid PNG/JPEG fixtures, and golden evidence. Its authoritative canvas is
`1029x258`; `IMAGE_PRIMARY` is `{ x: 666, y: 36, width: 315, height: 186 }`
with radius `12`. Plume, an Agent, or a future UI must not change this slot
geometry, mask, or final pixels.

The ownership boundary is:

```text
Image semantic understanding       -> Plume LAYOUT_PLANNER constrained mode
CropCandidate construction         -> Plume semantic-placement layer
CropCandidate validation/selection -> Plume semantic-placement layer
Accepted ImagePlacementPlan        -> Plume canonical contract
Final slot geometry/mask/pixels    -> Frozen Renderer
Final hard validation              -> Frozen Renderer Validator
```

The Renderer never calls an Agent. Renderer pixel output remains authoritative.

## LAYOUT_PLANNER constrained role

The existing `LAYOUT_PLANNER` Agent is the only named Agent for this boundary.
In `CONSTRAINED_SEMANTIC_PLACEMENT` mode it may report the primary visual
subject, semantic region/bounds, focal point, crop preference, rationale, and
confidence. It may not decide canvas size, slot coordinates or dimensions,
slot radius, text positions, template structure, z-index, or freeform layout.

PI-2A does not use `CreativeLayoutPlan`, change Agent schemas, or implement
`imageInputs` transport. Those are later implementation concerns.

## Candidate and accepted-plan separation

`CropCandidate` is not an `Accepted ImagePlacementPlan`. A future Plume
semantic-placement layer must validate and select a candidate before passing an
accepted plan to the Renderer. The initial candidate cardinality is exactly
one (`minimum: 1`, `maximum: 1`) to keep the first E2E deterministic.

The frozen accepted intent is:

```yaml
schemaVersion: "1.8.0"
imageSlotId: IMAGE_PRIMARY
policy: SEMANTIC_CROP_COVER
source: AGENT
fitMode: COVER
anchor: CENTER
subjectProtection: REQUIRED
cropCandidateId: <selected-candidate-id>
```

`cropRect` and `cropCandidateId` are mutually exclusive. The Agent path uses
the candidate reference. A primary `PRODUCT` subject is required, must be
preserved, and missing subject data or clipping is fail-closed.

The Renderer-supported manual path remains equivalent: `MANUAL_CROP` with
`source: MANUAL` and a crop rectangle. If manual and Agent plans resolve to the
same effective crop geometry, the Renderer invariant requires identical pixels.

## Crop geometry and focal point

Semantic crop construction must use source image pixel dimensions when matching
the `315:186` slot ratio; normalized rectangle ratios alone are insufficient.
Focal points remain normalized values in `[0, 1]` and are evidence, not a
standalone render instruction. The deterministic crop-building and rounding
algorithm is explicitly deferred to PI-2B. No hidden secondary crop is
introduced by this freeze.

## Fail-closed rules

The following Renderer error codes and severities remain unchanged:

```text
KBR-CROP-RECT-REQUIRED
KBR-CROP-CANDIDATE-NOT-FOUND
KBR-CROP-CANDIDATE-MISMATCH
KBR-CROP-RECT-OUT-OF-BOUNDS
KBR-PROTECTED-SUBJECT-DATA-MISSING
KBR-PROTECTED-SUBJECT-CLIPPED
KBR-PLACEMENT-POLICY-NOT-ALLOWED
KBR-ASSET-MIME-NOT-ALLOWED
KBR-TEMPLATE-CONSTRAINT-VIOLATION
```

Semantic-placement failure is `BLOCKED`. There is no center-contain,
full-image, legacy-renderer, or arbitrary default-crop fallback, and invalid
Agent geometry is never auto-clamped.

## What PI-2A does not implement

PI-2A changes only the freeze manifest, human document, ADR, verifier, verifier
tests, and package integrity command. It does not change runtime bindings,
`packages/renderer-vendor/src/public.ts`, Agent schemas, `imageInputs`, vendor
evidence, Frozen Renderer source, Plume pixels/checksums, Product Workflow,
Railway, Staging, or Production. The sample-image ZIP is not committed or run.

## PI-2B entry criteria

PI-2B may begin only after this manifest and verifier remain green from the
PI-2A0 parent. It must define the actual additive image-input path, the
deterministic single-candidate crop builder/validator, rounding rules, and
subject-preservation tests before any active semantic runtime binding is added.

## PI-2C sample-image plan

PI-2C is the later real-image E2E and visual-acceptance gate. It may use the
prepared `PI-2_semantic_placement_sample_images.zip` outside this repository;
PI-2A neither commits it nor makes CI depend on it.
