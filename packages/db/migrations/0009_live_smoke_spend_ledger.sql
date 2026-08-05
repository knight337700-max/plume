CREATE TABLE IF NOT EXISTS live_smoke_spend_ledger (
  workspace_id uuid NOT NULL,
  smoke_run_id uuid NOT NULL,
  budget_epoch_id uuid NOT NULL,
  reservation_key varchar(250) NOT NULL,
  billing_period date NOT NULL,
  state varchar(30) NOT NULL DEFAULT 'RESERVED'
    CHECK (state IN ('RESERVED', 'DISPATCH_STARTED', 'SETTLED', 'RELEASED', 'UNKNOWN_BILLABLE')),
  reserved_micro_usd bigint NOT NULL CHECK (reserved_micro_usd >= 0),
  settled_micro_usd bigint CHECK (settled_micro_usd IS NULL OR settled_micro_usd >= 0),
  model varchar(120) NOT NULL,
  pricing_version varchar(120) NOT NULL,
  provider_request_id_hash char(64),
  input_units integer CHECK (input_units IS NULL OR input_units >= 0),
  output_units integer CHECK (output_units IS NULL OR output_units >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, smoke_run_id, budget_epoch_id, reservation_key),
  FOREIGN KEY (workspace_id, smoke_run_id, budget_epoch_id)
    REFERENCES live_smoke_budget_epoch (workspace_id, smoke_run_id, budget_epoch_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS live_smoke_spend_ledger_period_state_idx
  ON live_smoke_spend_ledger (billing_period, state);

CREATE INDEX IF NOT EXISTS live_smoke_spend_ledger_scope_idx
  ON live_smoke_spend_ledger (workspace_id, smoke_run_id, budget_epoch_id, state);
