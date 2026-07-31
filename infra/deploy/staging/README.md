# Plume staging deployment contract

This directory defines the platform-neutral interface for a staging deployment
of the MVP candidate. `services.yaml` is consumed by a deployment adapter; it
is intentionally not a Kubernetes, Compose, or vendor-specific manifest.

## Service topology

```text
Public ingress
  ├── Web (1–4 replicas, TLS)
  └── API (1–8 replicas, TLS, SSE)

Private network
  ├── Worker (1–12 replicas, independent API scale)
  ├── Scheduler (1 replica, lease singleton)
  ├── PostgreSQL (managed or persistent)
  ├── Redis (cache and queue backplane)
  └── S3-compatible object storage
```

Only Web and API are public entry points. PostgreSQL, Redis, object storage,
Worker, and Scheduler have no direct public ingress. The API and Worker each
declare their own scaling bounds so queue depth can be handled without
coupling HTTP capacity to consumer capacity.

## Platform adapter responsibilities

- Pull the exact digest-pinned image references in `services.yaml`; mutable
  tags and `latest` are not accepted.
- Create or attach the private network and managed data services.
- Mount `plume-staging-runtime` from the platform secret manager.
- Run `pnpm db:migrate:staging` with the release backup confirmation before
  shifting traffic to a new API image.
- Configure TLS, the API CORS origin, secure SameSite cookies, and the signed
  URL host for the staging domain.
- Expose OTLP and metrics destinations without placing credentials in the
  browser or in source control.
- Apply the liveness/readiness probes, resource requests/limits, shutdown
  grace periods, and rolling deployment constraints.

## Data and recovery assumptions

PostgreSQL is the system of record and requires encrypted daily backups with a
35-day retention and a monthly restore drill. Object storage requires
encryption, versioning, and a 90-day retention policy. Redis persistence is
required for recovery, while queue delivery remains at-least-once and worker
handlers must remain idempotent.

For rollback, redeploy the previous immutable image tag. Do not perform an
automatic destructive database rollback: restore a verified backup and apply a
forward fix. Pause consumers before a schema rollback. A rolling API deploy
keeps the old API available while SSE connections drain; a worker terminates
only after it finishes the current item or releases its lease.

## Staging smoke and approval

After deployment, `/api/v1/health/live` is the process probe and
`/api/v1/health/ready` is the dependency probe. Run the smoke checks listed in
`services.yaml`: Web TLS, API liveness/readiness, database/Redis/storage
readiness, queue consumption, SSE reconnect, and signed URL access. Staging E2E must be green before the GitHub
Environment manual approval gate can unlock a release candidate. Reviewer
assignment and environment protection are configured in GitHub, not in this
repository.

`secrets.example.yaml` contains only secret-manager references and placeholders.
Provision real values out-of-band and rotate them through the provider.
