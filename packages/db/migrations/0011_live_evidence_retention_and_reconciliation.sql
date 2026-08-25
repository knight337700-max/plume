CREATE TABLE IF NOT EXISTS live_smoke_failure_evidence_event (
  failure_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  failure_key varchar(360) NOT NULL UNIQUE,
  workspace_id uuid NOT NULL,
  smoke_run_id uuid NOT NULL,
  budget_epoch_id uuid NOT NULL,
  verification_run_id uuid,
  job_item_id uuid NOT NULL,
  agent_code varchar(80) NOT NULL,
  call_kind varchar(20) NOT NULL CHECK (call_kind IN ('canary', 'initial', 'retry', 'repair')),
  failure_class varchar(40) NOT NULL CHECK (failure_class IN (
    'PRE_DISPATCH_VALIDATION', 'BUDGET_RESERVATION', 'DISPATCH_EVIDENCE',
    'PROVIDER_TRANSPORT', 'PROVIDER_REJECTED', 'PROVIDER_RESPONSE_PARSE',
    'STRUCTURED_OUTPUT_SCHEMA', 'DOMAIN_VALIDATION', 'USAGE_MISSING',
    'USAGE_INVALID', 'SETTLEMENT', 'EVIDENCE_WRITE', 'UNKNOWN_BILLABLE',
    'INTERNAL_UNKNOWN'
  )),
  stable_error_code varchar(120) NOT NULL,
  retryable boolean NOT NULL,
  stage varchar(40) NOT NULL,
  synthetic_scenario_id varchar(120) NOT NULL,
  reservation_created boolean NOT NULL,
  dispatch_started boolean NOT NULL,
  sdk_attempted boolean NOT NULL,
  provider_response_received boolean NOT NULL,
  usage_present boolean NOT NULL,
  settlement_state varchar(30),
  validation_stage varchar(30),
  schema_error_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(schema_error_paths) = 'array')
);

CREATE INDEX IF NOT EXISTS live_smoke_failure_evidence_lookup_idx
  ON live_smoke_failure_evidence_event
    (workspace_id, smoke_run_id, budget_epoch_id, created_at);

CREATE TABLE IF NOT EXISTS live_smoke_reconciliation_adjustments (
  adjustment_key varchar(320) PRIMARY KEY,
  billing_scope varchar(250) NOT NULL,
  billing_period_utc date NOT NULL,
  source_approval_id varchar(160) NOT NULL,
  reason_code varchar(80) NOT NULL,
  conservative_micro_usd bigint NOT NULL CHECK (conservative_micro_usd >= 0),
  represents_actual_cost boolean NOT NULL DEFAULT false CHECK (represents_actual_cost = false),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS live_smoke_reconciliation_scope_period_idx
  ON live_smoke_reconciliation_adjustments (billing_scope, billing_period_utc);

CREATE TABLE IF NOT EXISTS live_smoke_evidence_exports (
  export_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_id varchar(160) NOT NULL,
  smoke_run_id uuid NOT NULL,
  budget_epoch_id uuid,
  bundle_hash char(64) NOT NULL,
  exporter_version varchar(80) NOT NULL,
  export_status varchar(20) NOT NULL CHECK (export_status IN ('COMPLETE')),
  exported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (approval_id, smoke_run_id)
);

CREATE OR REPLACE FUNCTION prevent_live_smoke_failure_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'live_smoke_failure_evidence_event is append-only';
END;
$$;

CREATE TRIGGER live_smoke_failure_evidence_append_only
  BEFORE UPDATE OR DELETE ON live_smoke_failure_evidence_event
  FOR EACH ROW EXECUTE FUNCTION prevent_live_smoke_failure_evidence_mutation();

CREATE OR REPLACE FUNCTION prevent_live_smoke_reconciliation_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'live_smoke_reconciliation_adjustments is append-only';
END;
$$;

CREATE TRIGGER live_smoke_reconciliation_append_only
  BEFORE UPDATE OR DELETE ON live_smoke_reconciliation_adjustments
  FOR EACH ROW EXECUTE FUNCTION prevent_live_smoke_reconciliation_mutation();

CREATE OR REPLACE FUNCTION prevent_live_smoke_evidence_exports_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'live_smoke_evidence_exports is append-only';
END;
$$;

CREATE TRIGGER live_smoke_evidence_exports_append_only
  BEFORE UPDATE OR DELETE ON live_smoke_evidence_exports
  FOR EACH ROW EXECUTE FUNCTION prevent_live_smoke_evidence_exports_mutation();
