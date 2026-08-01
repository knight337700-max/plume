CREATE TABLE IF NOT EXISTS live_smoke_budget_epoch (
  workspace_id uuid NOT NULL,
  smoke_run_id uuid NOT NULL,
  budget_epoch_id uuid NOT NULL,
  parent_budget_epoch_id uuid,
  call_limit integer NOT NULL CHECK (call_limit > 0 AND call_limit <= 20),
  used_units integer NOT NULL DEFAULT 0 CHECK (used_units >= 0 AND used_units <= call_limit),
  status varchar(30) NOT NULL DEFAULT 'OPEN'
    CHECK (status IN ('OPEN', 'CLOSED_EXHAUSTED', 'CLOSED')),
  reason varchar(250) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, smoke_run_id, budget_epoch_id)
);

CREATE TABLE IF NOT EXISTS live_smoke_budget_epoch_reservation (
  workspace_id uuid NOT NULL,
  smoke_run_id uuid NOT NULL,
  budget_epoch_id uuid NOT NULL,
  reservation_key varchar(250) NOT NULL,
  units integer NOT NULL CHECK (units > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, smoke_run_id, budget_epoch_id, reservation_key),
  FOREIGN KEY (workspace_id, smoke_run_id, budget_epoch_id)
    REFERENCES live_smoke_budget_epoch (workspace_id, smoke_run_id, budget_epoch_id)
);

CREATE INDEX IF NOT EXISTS idx_live_smoke_budget_epoch_reservation_lookup
  ON live_smoke_budget_epoch_reservation (workspace_id, smoke_run_id, budget_epoch_id);

INSERT INTO live_smoke_budget_epoch (
  workspace_id,
  smoke_run_id,
  budget_epoch_id,
  parent_budget_epoch_id,
  call_limit,
  used_units,
  status,
  reason
)
SELECT
  workspace_id,
  smoke_run_id,
  md5(workspace_id::text || ':' || smoke_run_id::text || ':phase2c4')::uuid,
  NULL,
  call_limit,
  used_units,
  CASE WHEN used_units >= call_limit THEN 'CLOSED_EXHAUSTED' ELSE 'CLOSED' END,
  'phase2c4-legacy-immutable'
FROM live_smoke_budget_ledger
ON CONFLICT (workspace_id, smoke_run_id, budget_epoch_id) DO NOTHING;

INSERT INTO live_smoke_budget_epoch_reservation (
  workspace_id,
  smoke_run_id,
  budget_epoch_id,
  reservation_key,
  units,
  created_at
)
SELECT
  reservation.workspace_id,
  reservation.smoke_run_id,
  md5(reservation.workspace_id::text || ':' || reservation.smoke_run_id::text || ':phase2c4')::uuid,
  reservation.reservation_key,
  reservation.units,
  reservation.created_at
FROM live_smoke_budget_reservation AS reservation
JOIN live_smoke_budget_ledger AS ledger
  ON ledger.workspace_id = reservation.workspace_id
 AND ledger.smoke_run_id = reservation.smoke_run_id
ON CONFLICT (workspace_id, smoke_run_id, budget_epoch_id, reservation_key) DO NOTHING;
