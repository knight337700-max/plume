CREATE TABLE IF NOT EXISTS live_smoke_validation_evidence_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_key varchar(320) NOT NULL UNIQUE,
  evidence_stage varchar(30) NOT NULL
    CHECK (evidence_stage IN ('SDK_ATTEMPT', 'PROVIDER_RESPONSE', 'VALIDATION', 'COVERAGE_WRITE')),
  workspace_id uuid NOT NULL,
  smoke_run_id uuid NOT NULL,
  budget_epoch_id uuid NOT NULL,
  verification_run_id uuid,
  job_item_id uuid NOT NULL,
  agent_code varchar(80) NOT NULL,
  call_kind varchar(20) NOT NULL CHECK (call_kind IN ('initial', 'retry', 'repair')),
  sdk_request_attempted boolean NOT NULL,
  provider_response_received boolean NOT NULL,
  provider_http_status integer,
  provider_request_id_hash char(64),
  resolved_model varchar(120),
  json_parse_status varchar(20) NOT NULL
    CHECK (json_parse_status IN ('PASS', 'FAIL', 'NOT_REACHED')),
  transport_validation_status varchar(20) NOT NULL
    CHECK (transport_validation_status IN ('PASS', 'FAIL', 'NOT_REACHED')),
  transport_error_code varchar(120),
  transport_error_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  domain_validation_status varchar(20) NOT NULL
    CHECK (domain_validation_status IN ('PASS', 'FAIL', 'NOT_REACHED')),
  domain_error_code varchar(120),
  domain_error_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  repair_eligible boolean NOT NULL,
  retry_eligible boolean NOT NULL,
  coverage_write_attempted boolean NOT NULL,
  coverage_write_succeeded boolean NOT NULL,
  coverage_write_error_code varchar(120),
  input_units integer,
  output_units integer,
  output_fingerprint char(64),
  output_length_bytes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (provider_http_status IS NULL OR provider_http_status BETWEEN 100 AND 599),
  CHECK (jsonb_typeof(transport_error_paths) = 'array'),
  CHECK (jsonb_typeof(domain_error_paths) = 'array'),
  CHECK (output_length_bytes IS NULL OR output_length_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS live_smoke_validation_evidence_lookup_idx
  ON live_smoke_validation_evidence_event
    (workspace_id, smoke_run_id, budget_epoch_id, job_item_id, created_at);

CREATE OR REPLACE FUNCTION prevent_live_smoke_validation_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'live_smoke_validation_evidence_event is append-only';
END;
$$;

DROP TRIGGER IF EXISTS live_smoke_validation_evidence_append_only
  ON live_smoke_validation_evidence_event;

CREATE TRIGGER live_smoke_validation_evidence_append_only
  BEFORE UPDATE OR DELETE ON live_smoke_validation_evidence_event
  FOR EACH ROW EXECUTE FUNCTION prevent_live_smoke_validation_evidence_mutation();
