# PI-4A Open Questions and Deferred Decisions

Status: `FREEZE_CANDIDATE`

PI-4A blocking questions: **0**

Non-blocking deferred decisions: **15**

The target IA, screen hierarchy, four-step workflow, editor layout, and state/recovery semantics are coherent without answering the questions below. A question may still block a later implementation slice. `Required before` identifies that boundary.

| ID    | Class               | Decision / evidence needed                                                                                                      | Impact if unresolved                                                                                        | Recommended owner                             | Required before                                  | PI-4A blocking? |
| ----- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------------ | --------------- |
| OQ-01 | Domain contract     | Define a first-class Project entity: identity, name/context, status, timestamps, Campaign parent, CRUD, list, and persistence.  | Project screens and preloaded Project context must remain unavailable.                                      | Product + Core/API                            | PI-4C Project UI or any Project mutation         | No              |
| OQ-02 | Domain mapping      | Decide whether `CreativeSet` is contained by Project, is equivalent to Project, or remains an independent generation batch.     | Creative history cannot be bound to Project without ambiguity or migration risk.                            | Product + Core/API                            | Project Creatives implementation                 | No              |
| OQ-03 | Authorization       | Define Project read/edit/archive/asset/generation policies and inheritance from workspace/Campaign roles.                       | UI can show only Campaign-scoped capability; Project controls stay disabled.                                | Security/IAM + Core/API                       | Project route/action enablement                  | No              |
| OQ-04 | Asset contract      | Define Campaign asset ownership versus current product-specific selection references.                                           | Campaign Assets must describe current references narrowly and cannot claim general ownership.               | Product + Asset/Campaign API                  | Campaign asset management expansion              | No              |
| OQ-05 | Asset contract      | Define Project-local asset storage, CRUD, upload/reference behavior, and version/license linkage.                               | Project-local pane and mutations remain unavailable.                                                        | Product + Asset API                           | Project Assets implementation                    | No              |
| OQ-06 | Asset inheritance   | Choose live inheritance versus snapshot, deduplication key, override/hide rules, and behavior after parent removal/replacement. | Effective Asset Pool can be specified but not computed authoritatively.                                     | Product + Core/API                            | Effective pool implementation/generation binding | No              |
| OQ-07 | Asset semantics     | Freeze asset role taxonomy and whether roles attach to asset, version, Campaign reference, Project reference, or usage.         | Role filters/badges must omit unknown values.                                                               | Product + Design + Asset API                  | Role-based selection UI                          | No              |
| OQ-08 | Usage visibility    | Establish authoritative asset-to-Creative/Project usage/reference query and retention semantics.                                | Usage counts/details remain partial or omitted.                                                             | Core/API + Data                               | Usage visibility implementation                  | No              |
| OQ-09 | Copy contract       | Add or explicitly reject a direct AI Copywriter suggestion request/acceptance contract, including copy fields and provenance.   | AI Copywriter control remains disabled; users enter and confirm copy manually.                              | Product + Generation API/Worker               | AI Copywriter enablement                         | No              |
| OQ-10 | Generation recovery | Decide whether per-item retry is needed in addition to current job-level retry.                                                 | Current UI accurately offers job-level retry preserving completed items.                                    | Product + Operations API                      | Optional item-level retry UX                     | No              |
| OQ-11 | Draft lineage       | Define an explicit AI-draft root marker and exact reset behavior when versions branch or generation metadata is incomplete.     | Reset must be guarded using current ancestry and cannot promise universal AI-root recovery.                 | Creative API + Product                        | Full Reset to AI Draft enablement                | No              |
| OQ-12 | Format activation   | Prioritize and approve canonical profiles/export recipes for Naver GFA, Meta, and Google Ads.                                   | Those channels remain visible but fail-closed as `Catalog not ready`; Kakao's three profiles remain usable. | Product + Media Catalog + Renderer governance | Enabling each additional format                  | No              |
| OQ-13 | Activity            | Decide whether Campaign/Project recent activity needs a durable audit/event projection and retention policy.                    | Recent activity is omitted, avoiding fabricated or incomplete history.                                      | Product + Platform/API                        | Activity module/UI                               | No              |
| OQ-14 | Notifications       | Decide whether global notifications are transient job/SSE status or a durable inbox with read state.                            | Shell may show current jobs/reconnection only; no persistent inbox claim.                                   | Product + Platform/API                        | Durable notification UI                          | No              |
| OQ-15 | History default     | Decide whether Project Creatives includes superseded/archived versions by default and define filter/pagination ordering.        | A later list implementation needs an explicit default; screen structure is unchanged.                       | Product + Creative API                        | Project Creative list contract                   | No              |

## Decision discipline

- PI-4C must not close these questions inside presentation code or client-only persistence.
- A decision that changes Project hierarchy, the four AI Creative steps, or the three-column editor requires reopening the PI-4A freeze rather than silently drifting.
- Adding a backend capability does not automatically make its control available; authorization, failure, recovery, and empty states must be implemented together.
- Renderer/vendor/Frozen34 changes remain outside this gate and require their own authority.

## Recommended sequencing after PI-4A

1. Freeze Project and CreativeSet relationship (OQ-01 through OQ-03).
2. Freeze effective Asset Pool semantics (OQ-04 through OQ-08).
3. Resolve optional workflow enhancements independently (OQ-09 through OQ-11).
4. Activate new formats only through catalog/renderer governance (OQ-12).
5. Treat activity, notifications, and history defaults as additive (OQ-13 through OQ-15).
