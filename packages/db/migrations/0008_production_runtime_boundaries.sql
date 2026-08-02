CREATE TABLE IF NOT EXISTS session_record (
  id varchar(255) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES user_account(id) ON DELETE RESTRICT,
  email varchar(320) NOT NULL,
  display_name varchar(200) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS session_record_user_idx ON session_record (user_id, expires_at);

CREATE TABLE IF NOT EXISTS upload_session (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspace(id) ON DELETE RESTRICT,
  status varchar(30) NOT NULL,
  mode varchar(20) NOT NULL,
  filename varchar(500) NOT NULL,
  mime_type varchar(200) NOT NULL,
  bytes bigint NOT NULL CHECK (bytes > 0),
  checksum_sha256 char(64),
  purpose varchar(50) NOT NULL,
  object_key text NOT NULL,
  bucket varchar(200) NOT NULL,
  expires_at timestamptz NOT NULL,
  parts_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  file_object_id uuid REFERENCES file_object(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(parts_json) = 'array')
);

CREATE INDEX IF NOT EXISTS upload_session_workspace_status_idx
  ON upload_session (workspace_id, status, updated_at);
