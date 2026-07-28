# ADR-001: Renderer technology for the MVP

- Status: Accepted
- Date: 2026-07-28
- Scope: Creative preview, validation, and final-export renderer adapter

## Decision

Select `native-deterministic-raster` for the MVP. The adapter uses Node built-ins available in the locked worker runtime and produces deterministic PNG output from a validated Creative Document. The selected implementation does not depend on optional native modules.

## Spike evidence

The PLM-0113 probe checks whether the two requested candidates are actually resolvable in the worker runtime:

| Candidate                   | Runtime result                                  | Decision note                                                       |
| --------------------------- | ----------------------------------------------- | ------------------------------------------------------------------- |
| SVG + Sharp                 | Not declared/resolvable in the current lockfile | Keep as a follow-up adapter; no smoke test was claimed              |
| Canvas                      | Not declared/resolvable in the current lockfile | Keep as a follow-up adapter; native build portability is unverified |
| Native deterministic raster | Available with Node built-ins                   | Selected for a deployable MVP path                                  |

The probe is deterministic and records a checksum. It deliberately reports unavailable optional candidates instead of treating dependency resolution as a successful render benchmark.

## Consequences

- Preview and export can share one deterministic pixel path.
- No package download or native build is required for the Gate D worker image.
- Text uses the renderer's approved deterministic fallback until a pinned font package is integrated.
- A future SVG+Sharp or Canvas adapter must add the dependency to the lockfile, run a real image smoke test, and update this ADR before selection.
