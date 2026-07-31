ALTER TABLE async_job ADD COLUMN IF NOT EXISTS correlation_id uuid;
ALTER TABLE async_job ADD COLUMN IF NOT EXISTS idempotency_key varchar(500);
ALTER TABLE async_job ADD COLUMN IF NOT EXISTS payload_hash char(64);
ALTER TABLE async_job_item ADD COLUMN IF NOT EXISTS command varchar(200);
ALTER TABLE async_job_item ADD COLUMN IF NOT EXISTS message_id uuid;
ALTER TABLE async_job_item ADD COLUMN IF NOT EXISTS causation_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS async_job_workspace_idempotency_uq
  ON async_job (workspace_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS async_job_item_message_idx ON async_job_item (message_id) WHERE message_id IS NOT NULL;
