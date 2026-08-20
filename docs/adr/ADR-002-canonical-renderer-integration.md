# ADR-002: Kakao canonical renderer integration freeze

- Status: Accepted
- Date: 2026-08-20
- Scope: PI-1C Kakao Bizboard Object Right canonical product rendering

## Decision

Freeze the Kakao canonical integration at the Plume-to-Frozen-Renderer boundary.
Plume resolves the explicit `kakao-moment-bizboard-1029x258` binding and invokes
the pinned renderer adapter. The renderer remains the sole authority for pixels,
validation, and placement evidence.

The frozen renderer is `knight337700-max/plume-renderer` at
`7baa272dd852ed21a09cf369c928571b3f75fd31`, with integration contract `1.8.0`.
The binding is `KAKAO_BIZBOARD_OBJECT_RIGHT` and
`KAKAO_MOMENT_BIZBOARD_OBJECT_RIGHT_1029X258_V1`, with `TEMPLATE_LOCKED`
layout and `ALPHA_TRIM_CONTAIN` placement.

## Dependency direction

The dependency direction is one-way:

```text
Plume Product Workflow -> Plume canonical adapter -> Frozen Renderer
```

The renderer does not depend on Plume, agents, or OpenAI. Canonical rendering
has no runtime network dependency. Agent orchestration and `imageInputs` remain
outside this integration boundary.

## Asset resolution boundary

The Product Workflow must resolve an uploaded, selected, `VALID` PNG asset with
alpha before the canonical renderer is called. It must also provide the exact
confirmed brief version and explicit format binding. Missing or ambiguous
inputs fail closed; canonical mode never falls back to the legacy renderer.

## Evidence and acceptance

The accepted PI-1B review evidence is recorded in
`docs/release/pi-1c-kakao-canonical-freeze.json`. It binds the review pack,
input, canonical PNG, export package, evidence JSON, request/pixel/render
fingerprints, placement evidence, and the single accepted warning
`KBR-LAYOUT-009`. Renderer errors are zero and visual acceptance is `PASS`.

The canonical E2E and renderer adapter tests retain the accepted checksum and
pixel fingerprint. The machine verifier fails non-zero on renderer, contract,
binding, mode, artifact, fingerprint, placement, or visual-acceptance drift.

## Legacy distinction

`MOCK_AI` remains a deliberately isolated legacy regression path for existing
tests. It is not evidence of canonical product rendering and must not be used
as a fallback when `CANONICAL_RENDERER` is requested.

## Consequences

- Kakao canonical output is reproducible and reviewable from committed evidence.
- Renderer/vendor pins and the format binding are machine-verified in integrity
  and CI.
- Runtime behavior and renderer pixels remain unchanged by this documentation and
  freeze layer.
- A renderer SHA, contract, binding, accepted artifact, or warning change needs
  a new review and an explicit freeze update.

## Deferred scope

Semantic/freeform placement, `FREEFORM`, `LAYOUT_PLANNER`, agent image inputs,
Naver/Meta/Google formats, and Linux/Railway/Staging/Production deployment work
are separate gates and are not implied by this freeze.
