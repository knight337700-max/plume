CREATE TABLE IF NOT EXISTS live_smoke_reservation_lifecycle_event (
  event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL,
  smoke_run_id uuid NOT NULL,
  budget_epoch_id uuid NOT NULL,
  reservation_key varchar(250) NOT NULL,
  agent_code varchar(80),
  lifecycle_state varchar(40) NOT NULL
    CHECK (lifecycle_state IN ('RESERVED', 'DISPATCH_STARTED', 'PROVIDER_RESPONDED', 'RELEASED_PRE_DISPATCH')),
  provider_mode varchar(20) NOT NULL CHECK (provider_mode IN ('mock', 'live')),
  provider_request_sent boolean NOT NULL,
  provider_response_received boolean NOT NULL,
  billable_request_count integer NOT NULL CHECK (billable_request_count IN (0, 1)),
  request_id_hash char(64),
  input_units integer,
  output_units integer,
  terminal_error_code varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, smoke_run_id, budget_epoch_id, reservation_key, lifecycle_state)
);

CREATE INDEX IF NOT EXISTS live_smoke_reservation_lifecycle_lookup_idx
  ON live_smoke_reservation_lifecycle_event (workspace_id, smoke_run_id, budget_epoch_id, created_at);

CREATE TABLE IF NOT EXISTS live_smoke_budget_reconciliation_event (
  reconciliation_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reconciliation_key varchar(250) NOT NULL UNIQUE,
  workspace_id uuid NOT NULL,
  smoke_run_id uuid NOT NULL,
  budget_epoch_id uuid NOT NULL,
  reserved_units integer NOT NULL CHECK (reserved_units >= 0),
  provider_requests_sent integer NOT NULL CHECK (provider_requests_sent >= 0),
  provider_responses_received integer NOT NULL CHECK (provider_responses_received >= 0),
  pre_dispatch_released integer NOT NULL CHECK (pre_dispatch_released >= 0),
  live_coverage_created integer NOT NULL CHECK (live_coverage_created >= 0),
  original_rows_mutated boolean NOT NULL DEFAULT false,
  root_cause_classification varchar(120) NOT NULL,
  details_redacted varchar(500) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS live_smoke_provider_canary (
  verification_run_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  smoke_run_id uuid NOT NULL,
  budget_epoch_id uuid NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'PASS', 'FAIL')),
  provider_request_sent boolean NOT NULL DEFAULT false,
  provider_response_received boolean NOT NULL DEFAULT false,
  http_200 boolean NOT NULL DEFAULT false,
  resolved_model varchar(120),
  strict_output_valid boolean NOT NULL DEFAULT false,
  domain_validation_valid boolean NOT NULL DEFAULT false,
  store_disabled boolean NOT NULL DEFAULT false,
  background_disabled boolean NOT NULL DEFAULT false,
  tools_unused boolean NOT NULL DEFAULT false,
  error_code varchar(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
