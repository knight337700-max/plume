CREATE TABLE IF NOT EXISTS live_smoke_budget_policy (
  workspace_id uuid NOT NULL,
  smoke_run_id uuid NOT NULL,
  budget_epoch_id uuid NOT NULL,
  cached_input_micro_usd_per_million bigint NOT NULL CHECK (cached_input_micro_usd_per_million > 0),
  max_estimated_input_tokens integer NOT NULL CHECK (max_estimated_input_tokens > 0),
  per_run_soft_stop_micro_usd bigint NOT NULL CHECK (per_run_soft_stop_micro_usd > 0),
  per_run_hard_cap_micro_usd bigint NOT NULL CHECK (per_run_hard_cap_micro_usd > per_run_soft_stop_micro_usd),
  monthly_limit_micro_usd bigint NOT NULL CHECK (monthly_limit_micro_usd > per_run_hard_cap_micro_usd),
  safety_buffer_micro_usd bigint NOT NULL CHECK (safety_buffer_micro_usd > 0 AND safety_buffer_micro_usd < per_run_hard_cap_micro_usd),
  absolute_provider_call_cap integer NOT NULL CHECK (absolute_provider_call_cap BETWEEN 1 AND 20),
  billing_scope varchar(250) NOT NULL CHECK (length(trim(billing_scope)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, smoke_run_id, budget_epoch_id),
  FOREIGN KEY (workspace_id, smoke_run_id, budget_epoch_id)
    REFERENCES live_smoke_budget_epoch (workspace_id, smoke_run_id, budget_epoch_id)
    ON DELETE RESTRICT
);

ALTER TABLE live_smoke_spend_ledger
  ADD COLUMN IF NOT EXISTS cached_input_units integer NOT NULL DEFAULT 0
    CHECK (cached_input_units >= 0 AND cached_input_units <= COALESCE(input_units, cached_input_units));

ALTER TABLE live_smoke_validation_evidence_event
  ADD COLUMN IF NOT EXISTS cached_input_units integer
    CHECK (cached_input_units IS NULL OR cached_input_units >= 0);

CREATE INDEX IF NOT EXISTS live_smoke_budget_policy_scope_period_idx
  ON live_smoke_budget_policy (billing_scope, created_at);

CREATE INDEX IF NOT EXISTS live_smoke_spend_ledger_billing_period_state_idx
  ON live_smoke_spend_ledger (billing_period, state, budget_epoch_id);
