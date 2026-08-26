# PI-4B Open Questions

Status: `NON_BLOCKING_FOR_PI_4B`

Policy: target visuals may be specified, but unsupported backend/runtime behavior remains unavailable.

## 1. Decision table

| ID    | Area                 | Question / decision needed before enablement                                                    | Frozen PI-4B treatment                                                                             | Owner / trigger                             |
| ----- | -------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| VQ-01 | Project              | Freeze first-class Project identity, lifecycle, CRUD, Campaign containment, and route contract. | Project screens are `TARGET_UX`; production mutation unavailable with `Project contract required`. | Product + Core/API before Project UI        |
| VQ-02 | Project mapping      | Decide CreativeSet relationship to Project.                                                     | Never relabel CreativeSet as Project; partial read-only mapping must be explicit.                  | Product + Core/API before Project Creatives |
| VQ-03 | Authorization        | Define Project read/edit/archive/asset/generation permissions.                                  | Only proven Campaign/workspace capability shown; Project controls unavailable.                     | Security/IAM + Core/API                     |
| VQ-04 | Campaign assets      | Clarify ownership versus current product/reference selection.                                   | Use narrow `Campaign reference` language; do not imply general ownership.                          | Product + Asset/Campaign API                |
| VQ-05 | Project-local assets | Define storage, CRUD, upload/reference, version and license linkage.                            | Separate target section shown as `FUTURE_CONTRACT_REQUIRED`; no enabled upload.                    | Product + Asset API                         |
| VQ-06 | Inheritance          | Decide live/snapshot inheritance, dedupe, override/hide, and parent removal behavior.           | Show source distinction and target Effective Pool formula only; no computed guarantee.             | Product + Core/API before Effective Pool    |
| VQ-07 | Asset roles          | Freeze role taxonomy and attachment scope.                                                      | Display only stored/proven roles; omit unknown role filters/badges.                                | Product + Design + Asset API                |
| VQ-08 | Asset usage          | Define usage/reference query and retention.                                                     | Usage count/details omitted unless authoritative.                                                  | Core/API + Data                             |
| VQ-09 | Copy                 | Define manual copy persistence and AI Copywriter endpoint/command UX.                           | Manual copy marked TARGET where needed; AI Copy action unavailable with reason.                    | Product + Generation API                    |
| VQ-10 | Retry                | Decide whether per-item retry is needed.                                                        | Per-format observation rows allowed; enabled network retry remains job-level.                      | Product + Operations API                    |
| VQ-11 | AI Draft lineage     | Freeze root generated ancestor marker and reset semantics.                                      | `Reset to AI Draft` shown only when provenance proves ancestor; otherwise absent.                  | Creative/version API                        |
| VQ-12 | Formats              | Approve profiles/export recipes for Naver GFA, Meta, Google Ads.                                | Channels visible as `Catalog not ready`; only three active Kakao profiles selectable.              | Media Catalog + Renderer governance         |
| VQ-13 | Activity             | Define durable Campaign/Project activity projection and retention.                              | No recent-activity module is specified as live.                                                    | Product + Platform/API                      |
| VQ-14 | Editor operations    | Confirm undo/redo, guide/grid/snap, layer reorder, and geometry operation contracts.            | Undo/Redo/Guide/Grid/Snap deferred; Layout disabled unless capability proven.                      | Creative document + Renderer boundary       |
| VQ-15 | Creative history     | Define superseded/archived defaults, filtering, pagination, and ordering.                       | Project Creatives target does not claim a default; current/final states remain explicit.           | Product + Creative API                      |
| VQ-16 | Theme                | Decide whether a dark appearance is a product requirement.                                      | Light complete; semantic aliases future-compatible; no partial dark theme.                         | Product/Design before dark-theme Gate       |
| VQ-17 | Fonts                | Decide whether Figtree/Pretendard are packaged or system fallback only.                         | No remote font dependency; Korean-safe fallback stack is required.                                 | Design + Web performance                    |
| VQ-18 | Browser support      | Freeze product browser tiers against Astryx platform requirements.                              | PI-4C validates actual support; no unsupported polyfill/change in PI-4B.                           | Web platform before release                 |

## 2. PI-4C implementation blockers versus non-blockers

The following are blockers only for the named feature, not for starting core UI implementation:

- VQ-01–03 block enabled Project routes and mutations.
- VQ-05–08 block authoritative Project asset inheritance/local mutation details.
- VQ-09 blocks claiming AI Copy/manual copy persistence beyond current contract.
- VQ-10 blocks per-item network retry only.
- VQ-11 blocks unconditional Reset to AI Draft.
- VQ-12 blocks selecting non-Kakao formats.
- VQ-14 blocks active history/assistance/unsupported geometry controls.
- VQ-15 blocks claiming a Project Creative history default.

PI-4C can still implement shells, tokens, supported Campaign views, the four-step flow, the three active Kakao selection cards, job-level generation status, and contract-driven Editor preview/validation surfaces.

## 3. Status labels

Use these labels consistently in implementation/review artifacts:

- `CURRENTLY_SUPPORTED`: backed by current source/contract.
- `TARGET_UX`: visual/interaction target awaiting implementation or contract.
- `FUTURE_CONTRACT_REQUIRED`: cannot be enabled without a contract decision.
- `CATALOG_NOT_READY`: canonical channel has no active selectable format.
- `RENDERER_CONTROLLED`: visible value whose geometry/validation authority is external to browser UI.

These labels are documentation/review semantics. They are not new persisted backend enums.

## 4. Reopen conditions

Any decision that changes the Account → Campaign → Project → Creative hierarchy, four-step AI Creative workflow, multi-format principle, lack of a separate AI Draft page, or three-column Editor requires reopening PI-4A rather than being resolved as a PI-4C implementation detail.

An Astryx upgrade, dark theme, per-item retry, or new format activation requires separate verification and must not be smuggled into the core implementation.
