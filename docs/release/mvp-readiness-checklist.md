# Plume MVP candidate readiness checklist

This checklist is the operator record for the local `GATE_G_MVP_CANDIDATE`.
It describes the evidence required before a remote release is considered. A
checked item must link to a command log or an approved review; the checklist
does not turn an absent result into a pass.

## Candidate identity

- Repository: `C:\Users\Lenovo\Desktop\plume`
- Branch: `codex/mvp-build`
- Candidate image tag: `mvp` (immutable registry digest is required remotely)
- Task range: `PLM-0001` through `PLM-0180`
- Local remote/push/tag/release: intentionally not configured or performed

## Required evidence

| Area              | Evidence                                                         | Result                              |
| ----------------- | ---------------------------------------------------------------- | ----------------------------------- |
| Task traceability | 180 unique Task IDs and one commit per Task                      | `[ ]` record commit range           |
| Gate history      | Gates A–F completed and Gate G checks green                      | `[ ]` record gate report            |
| Catalog           | Active profile references and rule sets are intact               | `[ ]` `pnpm integrity`              |
| Contracts         | OpenAPI, screen, agent schema codegen has zero drift             | `[ ]` `pnpm contracts:check`        |
| Static            | Lint and TypeScript checks are clean                             | `[ ]` `pnpm lint`, `pnpm typecheck` |
| Tests             | Unit, integration, API contract, delivery, and SSE tests pass    | `[ ]` release check output          |
| Jacomo API        | Upload → AI → 3 creatives → edit → revalidation → approval → ZIP | `[ ]` `pnpm e2e:api:jacomo`         |
| Jacomo Browser    | Actual UI confirmation steps at 1440px                           | `[ ]` `pnpm e2e:web:jacomo`         |
| Visual            | 15 approved views at 1440, 1280, and compact widths              | `[ ]` `pnpm e2e:visual`             |
| Accessibility     | Critical/serious 0, keyboard, reduced motion, 200% zoom          | `[ ]` `pnpm e2e:a11y`               |
| Docker            | Web/API/Worker/Scheduler build and run non-root                  | `[ ]` four Docker builds            |
| Staging           | Service contract, smoke, backups, and rollback reviewed          | `[ ]` staging smoke log             |
| Approval          | Protected GitHub Environment approval after staging E2E          | `[ ]` reviewer and timestamp        |

## Known limitations and explicit non-claims

- The catalog contains one intentionally non-active profile:
  `KAKAO_MOMENT / kakao.bizboard.expandable.multi.provisional.v1` is
  `PENDING_VERIFY` and must remain blocked until official placement evidence is
  reviewed. The Jacomo fixture uses the confirmed
  `kakao.bizboard.banner.standard.v2025-07-09` profile.
- Live OpenAI API validation is `NOT_RUN` for the local candidate. All Gate G
  E2E uses the deterministic mock scenario server; no API key is needed.
  Before enabling a staging provider, the operator must provision a
  least-privilege key in the managed secret store, use a dedicated test
  workspace with synthetic assets, verify request/response schema and
  redaction logs, record cost/latency/error evidence, then revoke or rotate
  the key. No production user data or external advertising calls are allowed.
- This local run does not create a GitHub repository, configure `origin`, push,
  create a tag, publish a release, or deploy staging/production.
- Production SLOs, external provider commercial limits, domain/TLS ownership,
  and GitHub reviewer membership remain operational approvals outside this
  repository.

## Renderer and artifact policy

- Renderer decision: [`docs/adr/ADR-001-renderer-technology.md`](../adr/ADR-001-renderer-technology.md)
  selects `native-deterministic-raster` for the MVP. A future Sharp/SVG or
  Canvas adapter requires a new locked dependency, a real image smoke test,
  and an ADR update.
- Visual baselines are generated from the implemented deterministic UI only;
  reference design images are not baselines. Snapshot updates are manual and
  must include a reviewed diff. `--update-snapshots` is forbidden in release
  automation.
- Reports, traces, videos, downloaded ZIPs, generated PNGs, coverage, browser
  binaries, Docker archives, databases, object-storage data, `.env` files, and
  secrets are not release artifacts.

## Data, migration, and rollback

- PostgreSQL is the system of record. Run the migration before traffic and
  verify schema compatibility with the previous image during a rolling deploy.
- Required staging assumption: encrypted daily PostgreSQL backup, 35-day
  retention, and a monthly restore drill. Object storage requires versioning
  and 90-day retention; Redis persistence is required for recovery.
- Application rollback redeploys the previous immutable image tag. Database
  rollback is restore-and-forward-fix, never an automatic destructive down
  migration. Pause consumers before a schema rollback and allow SSE connections
  to drain before retiring old API replicas.

## Secret provisioning and environment protection

- Provision `DATABASE_URL`, `REDIS_URL`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`,
  `S3_SECRET_ACCESS_KEY`, `S3_BUCKET`, and `SESSION_SECRET` through the
  `plume-staging-runtime` managed secret reference in
  [`infra/deploy/staging/secrets.example.yaml`](../../infra/deploy/staging/secrets.example.yaml).
- `OPENAI_API_KEY` is optional for the local MVP and must never be injected
  into the Web process or browser bundle.
- Configure the protected GitHub Environment
  `plume-staging-approval` with named reviewers. The workflow dependency is
  `staging-e2e → manual-approval → release-candidate`; no release candidate
  job may start before approval.

## Staging smoke record

Record the target, image digests, migration ID, smoke command output, and
rollback owner after deployment:

```text
Target/domain:
Image digests:
Migration ID/time:
Web TLS:
API health/readiness:
PostgreSQL/Redis/Object Storage readiness:
Queue consumer and scheduler lease:
SSE reconnect:
Signed URL access:
Rollback owner and contact:
Reviewer:
Timestamp:
```

## Release approval

```text
MVP candidate approved: [ ] yes  [ ] no
Approver:
Approval timestamp (UTC):
Exception accepted:
Follow-up issue:
```

The local completion report remains the source of truth for the commands
actually run. Remote release requires explicit user approval after this file
and the staging evidence are reviewed.
