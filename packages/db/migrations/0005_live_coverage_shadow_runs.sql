CREATE TABLE IF NOT EXISTS live_smoke_budget_correction_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correction_key varchar(250) NOT NULL UNIQUE,
  workspace_id uuid NOT NULL,
  smoke_run_id uuid NOT NULL,
  budget_epoch_id uuid NOT NULL,
  event_type varchar(80) NOT NULL,
  affected_reservations integer NOT NULL CHECK (affected_reservations >= 0),
  openai_requests integer NOT NULL CHECK (openai_requests >= 0),
  financial_cost_usd numeric(12, 6) NOT NULL CHECK (financial_cost_usd >= 0),
  original_records_mutated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS live_smoke_verification_run (
  verification_run_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  smoke_run_id uuid NOT NULL,
  budget_epoch_id uuid NOT NULL,
  parent_workflow_job_id uuid NOT NULL,
  idempotency_key varchar(250) NOT NULL,
  purpose varchar(80) NOT NULL CHECK (purpose = 'LIVE_COVERAGE_ONLY'),
  status varchar(30) NOT NULL DEFAULT 'QUEUED'
    CHECK (status IN ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, verification_run_id),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS agent_live_coverage (
  workspace_id uuid NOT NULL,
  verification_run_id uuid NOT NULL,
  smoke_run_id uuid NOT NULL,
  budget_epoch_id uuid NOT NULL,
  parent_workflow_job_id uuid NOT NULL,
  agent_code varchar(80) NOT NULL,
  provider varchar(50) NOT NULL,
  model varchar(120) NOT NULL,
  provider_request_sent boolean NOT NULL,
  structured_output_passed boolean NOT NULL,
  domain_validation_passed boolean NOT NULL,
  request_id_hash char(64),
  input_units integer,
  output_units integer,
  verified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, verification_run_id, agent_code),
  FOREIGN KEY (workspace_id, verification_run_id)
    REFERENCES live_smoke_verification_run (workspace_id, verification_run_id)
);

CREATE INDEX IF NOT EXISTS agent_live_coverage_parent_workflow_idx
  ON agent_live_coverage (workspace_id, parent_workflow_job_id);
