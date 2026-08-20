# PI-1C Kakao canonical integration freeze

## Purpose

PI-1C records the reviewable, fail-closed Kakao canonical integration after
PI-1B. It freezes the accepted Plume-to-renderer contract and evidence without
changing renderer code, vendor files, runtime pixels, or the Product Workflow.

## Frozen baseline

- Plume parent: `codex/pi-1b-real-kakao-product-e2e`
  (`cf886bb8c0eb9cf83d0c207f9ee2376f323bdbe7`), PR #23.
- Renderer: `knight337700-max/plume-renderer` at
  `7baa272dd852ed21a09cf369c928571b3f75fd31`.
- Renderer integration contract: `1.8.0`.
- Machine source of truth: [`pi-1c-kakao-canonical-freeze.json`](./pi-1c-kakao-canonical-freeze.json).

## Binding and placement

Plume format `kakao-moment-bizboard-1029x258` is bound to renderer profile
`KAKAO_BIZBOARD_OBJECT_RIGHT` and template
`KAKAO_MOMENT_BIZBOARD_OBJECT_RIGHT_1029X258_V1`. Layout is `TEMPLATE_LOCKED`.
The frozen placement policy is `ALPHA_TRIM_CONTAIN`, using deterministic source,
`CONTAIN` fit, `CENTER` anchor, and no subject protection.

The renderer remains authoritative for pixels, validation, and applied placement
geometry. Plume records the renderer evidence; it does not infer geometry from
the output image or reimplement renderer calculations.

## Product Workflow boundary

Canonical mode requires the Product Workflow to resolve an uploaded selected
PNG product asset with `VALID` licensing and alpha, an exact confirmed brief,
and the explicit Kakao format binding. Canonical mode is explicit and fail-closed.
No canonical request falls back to `renderCreativeDocument` or invokes an agent
provider/OpenAI call. The legacy `MOCK_AI` path remains isolated for regression
coverage only.

The dependency direction is strictly:

```text
Plume Product Workflow -> Plume canonical adapter -> Frozen Renderer
```

There is no Renderer-to-Plume, Renderer-to-Agent, or Renderer-to-OpenAI
dependency, and no runtime network dependency for this path.

## Accepted evidence

The user-provided PI-1B Review Pack is recorded by filename and SHA-256 in the
machine manifest. Its accepted render is
`20dc9d62b8650a72115a8d584846399d9cd6dd2c8a0996b4889edb596feb68b1`; the
accepted pixel and render fingerprint is
`f6690a069d861caeb90770d3f8e9304c7bba749177eda83c4222668e6f066836`.
Renderer validation has zero errors. The only accepted warning is
`KBR-LAYOUT-009` (`layout.object_near_slot_edge`); this is evidence, not a
global warning waiver.

Visual acceptance is `PASS` for gate `PI_1B_REAL_KAKAO_PRODUCT_E2E`, based on
the user-provided review pack dated `2026-08-20`. The review evidence contains
no PII and runtime IDs are not canonical identity.

## Verification and fail-closed behavior

Run:

```text
pnpm verify:renderer-vendor
pnpm verify:kakao-canonical-freeze
pnpm integrity
```

The freeze verifier exits non-zero and prints a JSON `FAIL` result on any pin,
contract, binding, canonical-mode, evidence, fingerprint, checksum, or visual
acceptance drift. It never rewrites the manifest. CI runs it through
`pnpm integrity`.

## Change control

Changes to the renderer SHA, contract, format binding, accepted artifact,
warning set, or canonical placement contract require a new review and an
explicit freeze update. Renderer source, vendored upstream source, golden
fixtures, and accepted pixels are immutable under PI-1C.

## Deferred scope and next phase

This freeze does not start PI-2. Semantic/freeform placement, `FREEFORM`,
`LAYOUT_PLANNER`, agent `imageInputs`, Naver/Meta/Google, and
Linux/Railway/Staging/Production work remain deferred.

Next gate: `PI_2_TEMPLATE_SEMANTIC_PLACEMENT` (not started).
