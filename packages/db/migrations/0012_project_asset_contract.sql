CREATE TYPE project_status AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE asset_role_code AS ENUM ('LOGO', 'MODEL', 'PRODUCT', 'KEY_VISUAL', 'BACKGROUND', 'BADGE', 'GRAPHIC', 'REFERENCE');

CREATE TABLE project (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, campaign_id uuid NOT NULL REFERENCES campaign(id),
  name varchar(300) NOT NULL, description text, status project_status NOT NULL DEFAULT 'ACTIVE', created_by uuid, archived_at timestamptz,
  revision_no integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
  CONSTRAINT project_campaign_name_uq UNIQUE (campaign_id, name)
);
CREATE INDEX project_workspace_campaign_idx ON project(workspace_id, campaign_id);
CREATE TABLE project_asset_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, project_id uuid NOT NULL REFERENCES project(id),
  asset_version_id uuid NOT NULL REFERENCES asset_version(id), product_id uuid,
  role_code asset_role_code NOT NULL, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_asset_reference_scope_uq UNIQUE NULLS NOT DISTINCT (project_id, asset_version_id, product_id)
);
CREATE INDEX project_asset_reference_project_idx ON project_asset_reference(workspace_id, project_id);
ALTER TABLE campaign_asset ADD COLUMN role_code asset_role_code;
ALTER TABLE generation_request ADD COLUMN project_id uuid REFERENCES project(id);
ALTER TABLE generation_request ADD COLUMN asset_pool_snapshot_json jsonb;
ALTER TABLE creative_set ADD COLUMN project_id uuid REFERENCES project(id);
CREATE INDEX generation_request_project_idx ON generation_request(workspace_id, project_id);
CREATE INDEX creative_set_project_idx ON creative_set(workspace_id, project_id);
