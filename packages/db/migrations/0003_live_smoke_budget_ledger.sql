CREATE TABLE IF NOT EXISTS live_smoke_budget_ledger (
  workspace_id uuid NOT NULL,
  smoke_run_id uuid NOT NULL,
  call_limit integer NOT NULL CHECK (call_limit BETWEEN 1 AND 20),
  used_units integer NOT NULL DEFAULT 0 CHECK (used_units >= 0 AND used_units <= call_limit),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, smoke_run_id)
);

CREATE TABLE IF NOT EXISTS live_smoke_budget_reservation (
  workspace_id uuid NOT NULL,
  smoke_run_id uuid NOT NULL,
  reservation_key varchar(250) NOT NULL,
  units integer NOT NULL CHECK (units > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, smoke_run_id, reservation_key),
  FOREIGN KEY (workspace_id, smoke_run_id)
    REFERENCES live_smoke_budget_ledger (workspace_id, smoke_run_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS live_smoke_budget_reservation_run_idx
  ON live_smoke_budget_reservation (workspace_id, smoke_run_id);
