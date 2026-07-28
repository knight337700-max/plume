# Plume local infrastructure

This Compose file provides the local PostgreSQL, Redis and MinIO services used by Plume.

The development database is `plume`. The reserved test database is `plume_test`; its provisioning is owned by the later database foundation tasks and is intentionally not implemented in Gate A.

Copy `.env.example` to a local environment file when needed. The example credentials are local-only placeholders and are not production secrets. Named volumes persist service data between runs; this Gate does not automate volume deletion.

Start services with:

```powershell
docker compose -f infra/compose/docker-compose.yml up -d
```
