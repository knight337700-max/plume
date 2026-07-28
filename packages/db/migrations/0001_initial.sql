-- PLM-0029: initial PostgreSQL schema for the 63 domain entities.
-- All timestamps are timestamptz and all entity identifiers are UUIDs.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE workspace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name varchar(200) NOT NULL, slug varchar(100) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'ACTIVE', revision_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE user_account (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email varchar(320) NOT NULL, display_name varchar(200) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'INVITED', last_login_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), revision_no integer NOT NULL DEFAULT 1, deleted_at timestamptz
);
CREATE TABLE workspace_member (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id uuid NOT NULL,
  role_code varchar(30) NOT NULL, status varchar(30) NOT NULL DEFAULT 'INVITED', joined_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), revision_no integer NOT NULL DEFAULT 1
);
CREATE TABLE workspace_invitation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, email varchar(320) NOT NULL,
  role_code varchar(30) NOT NULL, token_hash varchar(255) NOT NULL, status varchar(30) NOT NULL DEFAULT 'PENDING',
  expires_at timestamptz NOT NULL, invited_by uuid NOT NULL, accepted_by uuid, created_at timestamptz NOT NULL DEFAULT now(), responded_at timestamptz
);
CREATE TABLE workspace_policy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, self_approval_allowed boolean NOT NULL DEFAULT false,
  retention_days integer, filename_pattern varchar(500), policy_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  revision_no integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE advertiser (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, name varchar(200) NOT NULL,
  normalized_name varchar(200) NOT NULL, status varchar(30) NOT NULL DEFAULT 'ACTIVE', owner_user_id uuid,
  revision_no integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE brand (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, advertiser_id uuid NOT NULL,
  name varchar(200) NOT NULL, normalized_name varchar(200) NOT NULL, logo_asset_id uuid, status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  revision_no integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE brand_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, brand_id uuid NOT NULL, brand_message text,
  tone_json jsonb NOT NULL DEFAULT '{}'::jsonb, color_tokens_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  forbidden_expressions_json jsonb NOT NULL DEFAULT '[]'::jsonb, revision_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, brand_id uuid NOT NULL, name varchar(300) NOT NULL,
  normalized_name varchar(300) NOT NULL, internal_code varchar(100), category_code varchar(100), landing_url text, description text,
  selling_points_json jsonb NOT NULL DEFAULT '[]'::jsonb, attributes_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(30) NOT NULL DEFAULT 'DRAFT', representative_asset_id uuid, revision_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE product_variant (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, product_id uuid NOT NULL, sku varchar(150),
  name varchar(300) NOT NULL, attributes_json jsonb NOT NULL DEFAULT '{}'::jsonb, price_minor bigint, sale_price_minor bigint,
  currency_code char(3), availability varchar(30), status varchar(30) NOT NULL DEFAULT 'ACTIVE', revision_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);

CREATE TABLE file_object (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, storage_provider varchar(50) NOT NULL,
  bucket varchar(200) NOT NULL, object_key text NOT NULL, original_filename varchar(500) NOT NULL, mime_type varchar(200) NOT NULL,
  bytes bigint NOT NULL, checksum_sha256 char(64) NOT NULL, width integer, height integer, color_mode varchar(30), alpha boolean,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb, created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE design_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, brand_id uuid NOT NULL, name varchar(300) NOT NULL,
  asset_type varchar(50) NOT NULL, status varchar(30) NOT NULL DEFAULT 'PROCESSING', current_version_id uuid,
  license_status varchar(30) NOT NULL, license_start_at timestamptz, license_end_at timestamptz,
  analysis_summary_json jsonb NOT NULL DEFAULT '{}'::jsonb, revision_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE asset_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, design_asset_id uuid NOT NULL, version_no integer NOT NULL,
  file_object_id uuid NOT NULL, source_type varchar(50) NOT NULL, analysis_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_asset_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, product_id uuid NOT NULL, design_asset_id uuid NOT NULL,
  usage_type varchar(50) NOT NULL, priority integer NOT NULL, is_representative boolean NOT NULL DEFAULT false,
  excluded_from_generation boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE asset_tag (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, name varchar(100) NOT NULL,
  normalized_name varchar(100) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE asset_tag_link (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, design_asset_id uuid NOT NULL, asset_tag_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE campaign (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, brand_id uuid NOT NULL, display_code varchar(50) NOT NULL,
  name varchar(300) NOT NULL, objective_code varchar(100) NOT NULL, start_date date, end_date date, landing_url text, owner_user_id uuid,
  status varchar(40) NOT NULL DEFAULT 'DRAFT', current_step varchar(50) NOT NULL, revision_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE campaign_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, campaign_id uuid NOT NULL, file_object_id uuid NOT NULL,
  source_type varchar(50) NOT NULL, notes text, status varchar(30) NOT NULL DEFAULT 'UPLOADED', uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE campaign_source_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, campaign_source_id uuid NOT NULL, async_job_id uuid,
  status varchar(30) NOT NULL DEFAULT 'QUEUED', extracted_text_uri text, analysis_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  model_info_json jsonb NOT NULL DEFAULT '{}'::jsonb, error_json jsonb, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE campaign_brief (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, campaign_id uuid NOT NULL, current_version_id uuid,
  current_confirmed_version_id uuid, status varchar(30) NOT NULL DEFAULT 'DRAFT', revision_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE campaign_brief_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, campaign_brief_id uuid NOT NULL, version_no integer NOT NULL,
  parent_version_id uuid, source_kind varchar(30) NOT NULL, content_json jsonb NOT NULL, source_citations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  brand_profile_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb, status varchar(30) NOT NULL DEFAULT 'DRAFT', created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), confirmed_at timestamptz
);
CREATE TABLE campaign_product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, campaign_id uuid NOT NULL, product_id uuid NOT NULL,
  brief_version_id uuid NOT NULL, source_name varchar(300), match_confidence numeric(5,4), match_reason text,
  status varchar(30) NOT NULL DEFAULT 'PENDING', sort_order integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE campaign_asset (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, campaign_id uuid NOT NULL, design_asset_id uuid NOT NULL,
  product_id uuid, recommendation_score numeric(7,4), recommendation_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(30) NOT NULL DEFAULT 'RECOMMENDED', is_preferred boolean NOT NULL DEFAULT false, excluded_reason text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE campaign_channel_selection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, campaign_id uuid NOT NULL, channel_id uuid NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'SELECTED', selection_reason text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE campaign_format_selection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, campaign_id uuid NOT NULL, campaign_channel_selection_id uuid NOT NULL,
  format_profile_id uuid NOT NULL, layout_template_id uuid, placement_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  selection_json jsonb NOT NULL DEFAULT '{}'::jsonb, format_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  rule_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb, export_recipe_snapshot_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(30) NOT NULL DEFAULT 'SELECTED', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE generation_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, campaign_id uuid NOT NULL, brief_version_id uuid NOT NULL,
  creative_set_id uuid, async_job_id uuid, generation_mode varchar(50) NOT NULL, config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(30) NOT NULL DEFAULT 'QUEUED', requested_by uuid, requested_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE generation_request_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, generation_request_id uuid NOT NULL, product_id uuid,
  campaign_format_selection_id uuid NOT NULL, asset_selection_json jsonb NOT NULL DEFAULT '{}'::jsonb, copy_config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL, status varchar(30) NOT NULL DEFAULT 'QUEUED', creative_id uuid, error_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);

CREATE TABLE channel (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code varchar(50) NOT NULL, name varchar(100) NOT NULL, status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE product_family (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel_id uuid NOT NULL, code varchar(100) NOT NULL, name varchar(200) NOT NULL,
  purchase_type varchar(30), status varchar(30) NOT NULL DEFAULT 'ACTIVE', metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE ad_product (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), product_family_id uuid NOT NULL, code varchar(100) NOT NULL, name varchar(200) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'ACTIVE', metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE placement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel_id uuid NOT NULL, code varchar(150) NOT NULL, name varchar(250) NOT NULL,
  surface varchar(100), status varchar(30) NOT NULL DEFAULT 'ACTIVE', availability_json jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE guideline_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel_id uuid NOT NULL, version varchar(100) NOT NULL, title varchar(300) NOT NULL,
  effective_from date, effective_to date, verification_status varchar(40) NOT NULL, status varchar(30) NOT NULL DEFAULT 'DRAFT', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE source_reference (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), guideline_version_id uuid NOT NULL, source_type varchar(50) NOT NULL, title varchar(300) NOT NULL,
  url text, file_hash char(64), accessed_at timestamptz, metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE export_recipe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), stable_key varchar(200) NOT NULL, version varchar(50) NOT NULL, name varchar(250) NOT NULL,
  recipe_json jsonb NOT NULL, status varchar(30) NOT NULL DEFAULT 'DRAFT', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE format_profile (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), channel_id uuid NOT NULL, ad_product_id uuid NOT NULL, guideline_version_id uuid,
  export_recipe_id uuid NOT NULL, stable_key varchar(250) NOT NULL, version varchar(100) NOT NULL, name varchar(300) NOT NULL,
  render_mode varchar(60) NOT NULL, media_type varchar(50) NOT NULL, status varchar(40) NOT NULL DEFAULT 'DRAFT', verification_status varchar(50) NOT NULL,
  spec_json jsonb NOT NULL, effective_from date, effective_to date, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE format_placement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), format_profile_id uuid NOT NULL, placement_id uuid NOT NULL, status varchar(30) NOT NULL DEFAULT 'ACTIVE',
  override_json jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rule_set (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), guideline_version_id uuid, stable_key varchar(250) NOT NULL, version varchar(100) NOT NULL,
  name varchar(300) NOT NULL, scope varchar(50) NOT NULL, status varchar(30) NOT NULL DEFAULT 'DRAFT', metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE rule_definition (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rule_set_id uuid NOT NULL, rule_code varchar(250) NOT NULL, rule_type varchar(40) NOT NULL,
  scope varchar(50) NOT NULL, target varchar(50) NOT NULL, operator varchar(100) NOT NULL, value_json jsonb NOT NULL,
  severity varchar(20) NOT NULL, auto_fix varchar(50) NOT NULL, message text NOT NULL, source_reference_id uuid, sort_order integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE format_rule_set (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), format_profile_id uuid NOT NULL, rule_set_id uuid NOT NULL,
  priority integer NOT NULL, required boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE layout_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), guideline_version_id uuid, stable_key varchar(250) NOT NULL, version varchar(100) NOT NULL,
  name varchar(300) NOT NULL, template_type varchar(50) NOT NULL, template_json jsonb NOT NULL, preview_file_hash char(64),
  status varchar(30) NOT NULL DEFAULT 'DRAFT', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE format_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), format_profile_id uuid NOT NULL, layout_template_id uuid NOT NULL,
  is_default boolean NOT NULL DEFAULT false, sort_order integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE catalog_override (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, target_type varchar(50) NOT NULL, target_id uuid NOT NULL,
  override_json jsonb NOT NULL, status varchar(30) NOT NULL DEFAULT 'ACTIVE', revision_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);

CREATE TABLE creative_set (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, campaign_id uuid NOT NULL, name varchar(300) NOT NULL,
  generation_request_id uuid, status varchar(40) NOT NULL DEFAULT 'DRAFT', revision_no integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE creative (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, creative_set_id uuid NOT NULL, campaign_id uuid NOT NULL,
  product_id uuid, campaign_format_selection_id uuid NOT NULL, current_version_id uuid, status varchar(40) NOT NULL DEFAULT 'DRAFT',
  revision_no integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE creative_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, creative_id uuid NOT NULL, version_no integer NOT NULL,
  parent_version_id uuid, format_profile_id uuid NOT NULL, layout_template_id uuid, brief_version_id uuid NOT NULL,
  document_json jsonb NOT NULL, copy_assets_json jsonb NOT NULL DEFAULT '{}'::jsonb, generation_metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status varchar(40) NOT NULL DEFAULT 'DRAFT', revision_no integer NOT NULL DEFAULT 1, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(), frozen_at timestamptz
);
CREATE TABLE creative_asset_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, creative_version_id uuid NOT NULL, asset_version_id uuid NOT NULL,
  element_id varchar(150), usage_type varchar(50) NOT NULL, transform_json jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE creative_edit_operation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, creative_version_id uuid NOT NULL, operation_no integer NOT NULL,
  source varchar(30) NOT NULL, command_text text, operation_json jsonb NOT NULL, applied_by uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE creative_render (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, creative_version_id uuid NOT NULL, async_job_id uuid,
  render_purpose varchar(30) NOT NULL, file_object_id uuid NOT NULL, status varchar(30) NOT NULL DEFAULT 'COMPLETED',
  render_config_json jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE validation_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, creative_version_id uuid NOT NULL, async_job_id uuid,
  run_no integer NOT NULL, status varchar(30) NOT NULL DEFAULT 'QUEUED', format_snapshot_json jsonb NOT NULL, rule_snapshot_json jsonb NOT NULL,
  input_render_id uuid, summary_json jsonb NOT NULL DEFAULT '{}'::jsonb, requested_by uuid, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE TABLE validation_result (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, validation_run_id uuid NOT NULL, rule_definition_id uuid,
  rule_code varchar(250) NOT NULL, rule_version varchar(100) NOT NULL, result_type varchar(30) NOT NULL, severity varchar(20) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'OPEN', target_element_ids_json jsonb NOT NULL DEFAULT '[]'::jsonb, message text NOT NULL,
  details_json jsonb NOT NULL DEFAULT '{}'::jsonb, suggested_fix_json jsonb, confidence numeric(5,4), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE warning_acknowledgement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, validation_result_id uuid NOT NULL, acknowledged_by uuid NOT NULL,
  reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE comment_thread (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, target_type varchar(50) NOT NULL, target_id uuid NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'OPEN', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, comment_thread_id uuid NOT NULL, author_id uuid NOT NULL,
  parent_comment_id uuid, body text NOT NULL, status varchar(30) NOT NULL DEFAULT 'ACTIVE', created_at timestamptz NOT NULL DEFAULT now(), edited_at timestamptz
);

CREATE TABLE approval_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, creative_version_id uuid NOT NULL, validation_run_id uuid NOT NULL,
  stage_no integer NOT NULL, required_approvals integer NOT NULL, status varchar(30) NOT NULL DEFAULT 'PENDING', requested_by uuid NOT NULL,
  assignee_id uuid, requested_at timestamptz NOT NULL DEFAULT now(), resolved_at timestamptz, superseded_by uuid
);
CREATE TABLE approval_decision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, approval_request_id uuid NOT NULL, decision varchar(20) NOT NULL,
  decided_by uuid NOT NULL, comment text, warning_reason text, validation_snapshot_json jsonb NOT NULL, decided_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE export_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, campaign_id uuid NOT NULL, async_job_id uuid, export_recipe_id uuid NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'QUEUED', options_json jsonb NOT NULL DEFAULT '{}'::jsonb, manifest_json jsonb, requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz, expires_at timestamptz, error_json jsonb
);
CREATE TABLE export_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, export_job_id uuid NOT NULL, creative_version_id uuid NOT NULL,
  approval_request_id uuid NOT NULL, validation_run_id uuid NOT NULL, sort_order integer NOT NULL, status varchar(30) NOT NULL DEFAULT 'PENDING',
  error_json jsonb, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE export_file (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, export_job_id uuid NOT NULL, export_item_id uuid,
  file_object_id uuid NOT NULL, file_role varchar(40) NOT NULL, relative_path text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE async_job (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, job_type varchar(60) NOT NULL, status varchar(30) NOT NULL DEFAULT 'QUEUED',
  subject_type varchar(50), subject_id uuid, requested_by uuid, payload_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  progress_percent numeric(5,2) NOT NULL DEFAULT 0, current_step varchar(100), attempt_no integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3, scheduled_at timestamptz, started_at timestamptz, completed_at timestamptz, error_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE async_job_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, async_job_id uuid NOT NULL, item_key varchar(250) NOT NULL,
  subject_type varchar(50), subject_id uuid, status varchar(30) NOT NULL DEFAULT 'QUEUED', progress_percent numeric(5,2) NOT NULL DEFAULT 0,
  result_json jsonb, error_json jsonb, started_at timestamptz, completed_at timestamptz
);
CREATE TABLE activity_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, actor_id uuid, event_type varchar(100) NOT NULL,
  entity_type varchar(50) NOT NULL, entity_id uuid NOT NULL, summary text NOT NULL, metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid, actor_id uuid, action varchar(100) NOT NULL, entity_type varchar(50) NOT NULL,
  entity_id uuid, request_id varchar(100), before_json jsonb, after_json jsonb, ip_hash varchar(255), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, user_id uuid NOT NULL, event_id uuid,
  notification_type varchar(50) NOT NULL, title varchar(300) NOT NULL, body text NOT NULL, deep_link text, read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);

-- Primary business uniqueness and tenant-scoped lookup indexes.
CREATE UNIQUE INDEX workspace_slug_uq ON workspace(slug);
CREATE UNIQUE INDEX user_account_email_uq ON user_account(email);
CREATE UNIQUE INDEX workspace_member_workspace_user_uq ON workspace_member(workspace_id, user_id);
CREATE UNIQUE INDEX workspace_policy_workspace_uq ON workspace_policy(workspace_id);
CREATE UNIQUE INDEX advertiser_active_name_uq ON advertiser(workspace_id, normalized_name) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX brand_active_name_uq ON brand(advertiser_id, normalized_name) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX brand_profile_brand_uq ON brand_profile(brand_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX product_active_internal_code_uq ON product(brand_id, internal_code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX product_variant_active_sku_uq ON product_variant(product_id, sku) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX file_object_workspace_checksum_bytes_uq ON file_object(workspace_id, checksum_sha256, bytes);
CREATE UNIQUE INDEX asset_version_asset_version_uq ON asset_version(design_asset_id, version_no);
CREATE UNIQUE INDEX product_asset_link_usage_uq ON product_asset_link(product_id, design_asset_id, usage_type) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX asset_tag_active_name_uq ON asset_tag(workspace_id, normalized_name) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX asset_tag_link_asset_tag_uq ON asset_tag_link(design_asset_id, asset_tag_id);
CREATE UNIQUE INDEX campaign_workspace_display_code_uq ON campaign(workspace_id, display_code) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX campaign_brief_campaign_uq ON campaign_brief(campaign_id);
CREATE UNIQUE INDEX campaign_brief_version_uq ON campaign_brief_version(campaign_brief_id, version_no);
CREATE UNIQUE INDEX campaign_product_uq ON campaign_product(campaign_id, product_id);
CREATE UNIQUE INDEX campaign_asset_uq ON campaign_asset(campaign_id, design_asset_id, product_id);
CREATE UNIQUE INDEX campaign_channel_selection_uq ON campaign_channel_selection(campaign_id, channel_id);
CREATE UNIQUE INDEX campaign_format_selection_uq ON campaign_format_selection(campaign_id, format_profile_id, layout_template_id);
CREATE UNIQUE INDEX generation_request_item_uq ON generation_request_item(generation_request_id, product_id, campaign_format_selection_id);
CREATE UNIQUE INDEX channel_code_uq ON channel(code);
CREATE UNIQUE INDEX product_family_channel_code_uq ON product_family(channel_id, code);
CREATE UNIQUE INDEX ad_product_family_code_uq ON ad_product(product_family_id, code);
CREATE UNIQUE INDEX placement_channel_code_uq ON placement(channel_id, code);
CREATE UNIQUE INDEX guideline_version_channel_version_uq ON guideline_version(channel_id, version);
CREATE UNIQUE INDEX export_recipe_stable_version_uq ON export_recipe(stable_key, version);
CREATE UNIQUE INDEX format_profile_stable_version_uq ON format_profile(stable_key, version);
CREATE UNIQUE INDEX format_placement_uq ON format_placement(format_profile_id, placement_id);
CREATE UNIQUE INDEX rule_set_stable_version_uq ON rule_set(stable_key, version);
CREATE UNIQUE INDEX rule_definition_code_uq ON rule_definition(rule_set_id, rule_code);
CREATE UNIQUE INDEX format_rule_set_uq ON format_rule_set(format_profile_id, rule_set_id);
CREATE UNIQUE INDEX layout_template_stable_version_uq ON layout_template(stable_key, version);
CREATE UNIQUE INDEX format_template_uq ON format_template(format_profile_id, layout_template_id);
CREATE UNIQUE INDEX catalog_override_target_uq ON catalog_override(workspace_id, target_type, target_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX creative_version_uq ON creative_version(creative_id, version_no);
CREATE UNIQUE INDEX creative_asset_usage_uq ON creative_asset_usage(creative_version_id, asset_version_id, element_id);
CREATE UNIQUE INDEX creative_edit_operation_uq ON creative_edit_operation(creative_version_id, operation_no);
CREATE UNIQUE INDEX validation_run_uq ON validation_run(creative_version_id, run_no);
CREATE UNIQUE INDEX warning_acknowledgement_uq ON warning_acknowledgement(validation_result_id);
CREATE UNIQUE INDEX comment_thread_target_uq ON comment_thread(workspace_id, target_type, target_id) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX approval_decision_uq ON approval_decision(approval_request_id, decided_by);
CREATE UNIQUE INDEX export_item_job_version_uq ON export_item(export_job_id, creative_version_id);
CREATE UNIQUE INDEX export_file_job_path_uq ON export_file(export_job_id, relative_path);
CREATE UNIQUE INDEX async_job_item_uq ON async_job_item(async_job_id, item_key);
CREATE INDEX campaign_workspace_status_updated_idx ON campaign(workspace_id, status, updated_at DESC);
CREATE INDEX campaign_brand_dates_idx ON campaign(brand_id, start_date, end_date);
CREATE INDEX creative_campaign_status_updated_idx ON creative(campaign_id, status, updated_at DESC);
CREATE INDEX creative_version_version_idx ON creative_version(creative_id, version_no DESC);
CREATE INDEX async_job_workspace_status_created_idx ON async_job(workspace_id, status, created_at DESC);
CREATE INDEX async_job_type_status_schedule_idx ON async_job(job_type, status, scheduled_at);
CREATE INDEX validation_result_run_severity_idx ON validation_result(validation_run_id, severity, status);

-- Foreign keys are added after all tables exist to support the catalog's
-- intentional current-version and job-cycle references.
ALTER TABLE workspace_member ADD CONSTRAINT workspace_member_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE workspace_member ADD CONSTRAINT workspace_member_user_fk FOREIGN KEY (user_id) REFERENCES user_account(id) ON DELETE RESTRICT;
ALTER TABLE workspace_invitation ADD CONSTRAINT workspace_invitation_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE workspace_invitation ADD CONSTRAINT workspace_invitation_invited_by_fk FOREIGN KEY (invited_by) REFERENCES user_account(id) ON DELETE RESTRICT;
ALTER TABLE workspace_invitation ADD CONSTRAINT workspace_invitation_accepted_by_fk FOREIGN KEY (accepted_by) REFERENCES user_account(id) ON DELETE SET NULL;
ALTER TABLE workspace_policy ADD CONSTRAINT workspace_policy_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE advertiser ADD CONSTRAINT advertiser_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE advertiser ADD CONSTRAINT advertiser_owner_fk FOREIGN KEY (owner_user_id) REFERENCES user_account(id) ON DELETE SET NULL;
ALTER TABLE brand ADD CONSTRAINT brand_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE brand ADD CONSTRAINT brand_advertiser_fk FOREIGN KEY (advertiser_id) REFERENCES advertiser(id) ON DELETE RESTRICT;
ALTER TABLE brand ADD CONSTRAINT brand_logo_asset_fk FOREIGN KEY (logo_asset_id) REFERENCES design_asset(id) ON DELETE SET NULL;
ALTER TABLE brand_profile ADD CONSTRAINT brand_profile_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE brand_profile ADD CONSTRAINT brand_profile_brand_fk FOREIGN KEY (brand_id) REFERENCES brand(id) ON DELETE RESTRICT;
ALTER TABLE product ADD CONSTRAINT product_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE product ADD CONSTRAINT product_brand_fk FOREIGN KEY (brand_id) REFERENCES brand(id) ON DELETE RESTRICT;
ALTER TABLE product ADD CONSTRAINT product_representative_asset_fk FOREIGN KEY (representative_asset_id) REFERENCES design_asset(id) ON DELETE SET NULL;
ALTER TABLE product_variant ADD CONSTRAINT product_variant_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE product_variant ADD CONSTRAINT product_variant_product_fk FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE CASCADE;
ALTER TABLE file_object ADD CONSTRAINT file_object_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE file_object ADD CONSTRAINT file_object_created_by_fk FOREIGN KEY (created_by) REFERENCES user_account(id) ON DELETE SET NULL;
ALTER TABLE design_asset ADD CONSTRAINT design_asset_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE design_asset ADD CONSTRAINT design_asset_brand_fk FOREIGN KEY (brand_id) REFERENCES brand(id) ON DELETE RESTRICT;
ALTER TABLE design_asset ADD CONSTRAINT design_asset_current_version_fk FOREIGN KEY (current_version_id) REFERENCES asset_version(id) ON DELETE SET NULL;
ALTER TABLE asset_version ADD CONSTRAINT asset_version_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE asset_version ADD CONSTRAINT asset_version_asset_fk FOREIGN KEY (design_asset_id) REFERENCES design_asset(id) ON DELETE RESTRICT;
ALTER TABLE asset_version ADD CONSTRAINT asset_version_file_fk FOREIGN KEY (file_object_id) REFERENCES file_object(id) ON DELETE RESTRICT;
ALTER TABLE asset_version ADD CONSTRAINT asset_version_created_by_fk FOREIGN KEY (created_by) REFERENCES user_account(id) ON DELETE SET NULL;
ALTER TABLE product_asset_link ADD CONSTRAINT product_asset_link_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE product_asset_link ADD CONSTRAINT product_asset_link_product_fk FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE RESTRICT;
ALTER TABLE product_asset_link ADD CONSTRAINT product_asset_link_asset_fk FOREIGN KEY (design_asset_id) REFERENCES design_asset(id) ON DELETE RESTRICT;
ALTER TABLE asset_tag ADD CONSTRAINT asset_tag_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE asset_tag_link ADD CONSTRAINT asset_tag_link_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE asset_tag_link ADD CONSTRAINT asset_tag_link_asset_fk FOREIGN KEY (design_asset_id) REFERENCES design_asset(id) ON DELETE CASCADE;
ALTER TABLE asset_tag_link ADD CONSTRAINT asset_tag_link_tag_fk FOREIGN KEY (asset_tag_id) REFERENCES asset_tag(id) ON DELETE CASCADE;
ALTER TABLE campaign ADD CONSTRAINT campaign_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE campaign ADD CONSTRAINT campaign_brand_fk FOREIGN KEY (brand_id) REFERENCES brand(id) ON DELETE RESTRICT;
ALTER TABLE campaign ADD CONSTRAINT campaign_owner_fk FOREIGN KEY (owner_user_id) REFERENCES user_account(id) ON DELETE SET NULL;
ALTER TABLE campaign_source ADD CONSTRAINT campaign_source_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE campaign_source ADD CONSTRAINT campaign_source_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaign(id) ON DELETE RESTRICT;
ALTER TABLE campaign_source ADD CONSTRAINT campaign_source_file_fk FOREIGN KEY (file_object_id) REFERENCES file_object(id) ON DELETE RESTRICT;
ALTER TABLE campaign_source ADD CONSTRAINT campaign_source_uploaded_by_fk FOREIGN KEY (uploaded_by) REFERENCES user_account(id) ON DELETE SET NULL;
ALTER TABLE campaign_source_analysis ADD CONSTRAINT campaign_source_analysis_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE campaign_source_analysis ADD CONSTRAINT campaign_source_analysis_source_fk FOREIGN KEY (campaign_source_id) REFERENCES campaign_source(id) ON DELETE RESTRICT;
ALTER TABLE campaign_source_analysis ADD CONSTRAINT campaign_source_analysis_job_fk FOREIGN KEY (async_job_id) REFERENCES async_job(id) ON DELETE SET NULL;
ALTER TABLE campaign_brief ADD CONSTRAINT campaign_brief_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE campaign_brief ADD CONSTRAINT campaign_brief_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaign(id) ON DELETE RESTRICT;
ALTER TABLE campaign_brief ADD CONSTRAINT campaign_brief_current_fk FOREIGN KEY (current_version_id) REFERENCES campaign_brief_version(id) ON DELETE SET NULL;
ALTER TABLE campaign_brief ADD CONSTRAINT campaign_brief_confirmed_fk FOREIGN KEY (current_confirmed_version_id) REFERENCES campaign_brief_version(id) ON DELETE SET NULL;
ALTER TABLE campaign_brief_version ADD CONSTRAINT campaign_brief_version_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE campaign_brief_version ADD CONSTRAINT campaign_brief_version_brief_fk FOREIGN KEY (campaign_brief_id) REFERENCES campaign_brief(id) ON DELETE RESTRICT;
ALTER TABLE campaign_brief_version ADD CONSTRAINT campaign_brief_version_parent_fk FOREIGN KEY (parent_version_id) REFERENCES campaign_brief_version(id) ON DELETE SET NULL;
ALTER TABLE campaign_brief_version ADD CONSTRAINT campaign_brief_version_created_by_fk FOREIGN KEY (created_by) REFERENCES user_account(id) ON DELETE SET NULL;
ALTER TABLE campaign_product ADD CONSTRAINT campaign_product_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE campaign_product ADD CONSTRAINT campaign_product_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaign(id) ON DELETE RESTRICT;
ALTER TABLE campaign_product ADD CONSTRAINT campaign_product_product_fk FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE RESTRICT;
ALTER TABLE campaign_product ADD CONSTRAINT campaign_product_brief_fk FOREIGN KEY (brief_version_id) REFERENCES campaign_brief_version(id) ON DELETE RESTRICT;
ALTER TABLE campaign_asset ADD CONSTRAINT campaign_asset_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE campaign_asset ADD CONSTRAINT campaign_asset_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaign(id) ON DELETE RESTRICT;
ALTER TABLE campaign_asset ADD CONSTRAINT campaign_asset_asset_fk FOREIGN KEY (design_asset_id) REFERENCES design_asset(id) ON DELETE RESTRICT;
ALTER TABLE campaign_asset ADD CONSTRAINT campaign_asset_product_fk FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE SET NULL;
ALTER TABLE campaign_channel_selection ADD CONSTRAINT campaign_channel_selection_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE campaign_channel_selection ADD CONSTRAINT campaign_channel_selection_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaign(id) ON DELETE RESTRICT;
ALTER TABLE campaign_channel_selection ADD CONSTRAINT campaign_channel_selection_channel_fk FOREIGN KEY (channel_id) REFERENCES channel(id) ON DELETE RESTRICT;
ALTER TABLE campaign_format_selection ADD CONSTRAINT campaign_format_selection_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE campaign_format_selection ADD CONSTRAINT campaign_format_selection_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaign(id) ON DELETE RESTRICT;
ALTER TABLE campaign_format_selection ADD CONSTRAINT campaign_format_selection_channel_fk FOREIGN KEY (campaign_channel_selection_id) REFERENCES campaign_channel_selection(id) ON DELETE RESTRICT;
ALTER TABLE campaign_format_selection ADD CONSTRAINT campaign_format_selection_profile_fk FOREIGN KEY (format_profile_id) REFERENCES format_profile(id) ON DELETE RESTRICT;
ALTER TABLE campaign_format_selection ADD CONSTRAINT campaign_format_selection_template_fk FOREIGN KEY (layout_template_id) REFERENCES layout_template(id) ON DELETE SET NULL;
ALTER TABLE generation_request ADD CONSTRAINT generation_request_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE generation_request ADD CONSTRAINT generation_request_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaign(id) ON DELETE RESTRICT;
ALTER TABLE generation_request ADD CONSTRAINT generation_request_brief_fk FOREIGN KEY (brief_version_id) REFERENCES campaign_brief_version(id) ON DELETE RESTRICT;
ALTER TABLE generation_request ADD CONSTRAINT generation_request_creative_set_fk FOREIGN KEY (creative_set_id) REFERENCES creative_set(id) ON DELETE SET NULL;
ALTER TABLE generation_request ADD CONSTRAINT generation_request_async_job_fk FOREIGN KEY (async_job_id) REFERENCES async_job(id) ON DELETE SET NULL;
ALTER TABLE generation_request ADD CONSTRAINT generation_request_requested_by_fk FOREIGN KEY (requested_by) REFERENCES user_account(id) ON DELETE SET NULL;
ALTER TABLE generation_request_item ADD CONSTRAINT generation_item_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE generation_request_item ADD CONSTRAINT generation_item_request_fk FOREIGN KEY (generation_request_id) REFERENCES generation_request(id) ON DELETE CASCADE;
ALTER TABLE generation_request_item ADD CONSTRAINT generation_item_product_fk FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE SET NULL;
ALTER TABLE generation_request_item ADD CONSTRAINT generation_item_format_fk FOREIGN KEY (campaign_format_selection_id) REFERENCES campaign_format_selection(id) ON DELETE RESTRICT;
ALTER TABLE generation_request_item ADD CONSTRAINT generation_item_creative_fk FOREIGN KEY (creative_id) REFERENCES creative(id) ON DELETE SET NULL;
ALTER TABLE product_family ADD CONSTRAINT product_family_channel_fk FOREIGN KEY (channel_id) REFERENCES channel(id) ON DELETE RESTRICT;
ALTER TABLE ad_product ADD CONSTRAINT ad_product_family_fk FOREIGN KEY (product_family_id) REFERENCES product_family(id) ON DELETE RESTRICT;
ALTER TABLE placement ADD CONSTRAINT placement_channel_fk FOREIGN KEY (channel_id) REFERENCES channel(id) ON DELETE RESTRICT;
ALTER TABLE guideline_version ADD CONSTRAINT guideline_version_channel_fk FOREIGN KEY (channel_id) REFERENCES channel(id) ON DELETE RESTRICT;
ALTER TABLE source_reference ADD CONSTRAINT source_reference_guideline_fk FOREIGN KEY (guideline_version_id) REFERENCES guideline_version(id) ON DELETE CASCADE;
ALTER TABLE format_profile ADD CONSTRAINT format_profile_channel_fk FOREIGN KEY (channel_id) REFERENCES channel(id) ON DELETE RESTRICT;
ALTER TABLE format_profile ADD CONSTRAINT format_profile_product_fk FOREIGN KEY (ad_product_id) REFERENCES ad_product(id) ON DELETE RESTRICT;
ALTER TABLE format_profile ADD CONSTRAINT format_profile_guideline_fk FOREIGN KEY (guideline_version_id) REFERENCES guideline_version(id) ON DELETE SET NULL;
ALTER TABLE format_profile ADD CONSTRAINT format_profile_recipe_fk FOREIGN KEY (export_recipe_id) REFERENCES export_recipe(id) ON DELETE RESTRICT;
ALTER TABLE format_placement ADD CONSTRAINT format_placement_profile_fk FOREIGN KEY (format_profile_id) REFERENCES format_profile(id) ON DELETE CASCADE;
ALTER TABLE format_placement ADD CONSTRAINT format_placement_placement_fk FOREIGN KEY (placement_id) REFERENCES placement(id) ON DELETE CASCADE;
ALTER TABLE rule_set ADD CONSTRAINT rule_set_guideline_fk FOREIGN KEY (guideline_version_id) REFERENCES guideline_version(id) ON DELETE SET NULL;
ALTER TABLE rule_definition ADD CONSTRAINT rule_definition_rule_set_fk FOREIGN KEY (rule_set_id) REFERENCES rule_set(id) ON DELETE CASCADE;
ALTER TABLE rule_definition ADD CONSTRAINT rule_definition_source_fk FOREIGN KEY (source_reference_id) REFERENCES source_reference(id) ON DELETE SET NULL;
ALTER TABLE format_rule_set ADD CONSTRAINT format_rule_set_profile_fk FOREIGN KEY (format_profile_id) REFERENCES format_profile(id) ON DELETE CASCADE;
ALTER TABLE format_rule_set ADD CONSTRAINT format_rule_set_rule_fk FOREIGN KEY (rule_set_id) REFERENCES rule_set(id) ON DELETE RESTRICT;
ALTER TABLE layout_template ADD CONSTRAINT layout_template_guideline_fk FOREIGN KEY (guideline_version_id) REFERENCES guideline_version(id) ON DELETE SET NULL;
ALTER TABLE format_template ADD CONSTRAINT format_template_profile_fk FOREIGN KEY (format_profile_id) REFERENCES format_profile(id) ON DELETE CASCADE;
ALTER TABLE format_template ADD CONSTRAINT format_template_layout_fk FOREIGN KEY (layout_template_id) REFERENCES layout_template(id) ON DELETE RESTRICT;
ALTER TABLE catalog_override ADD CONSTRAINT catalog_override_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE creative_set ADD CONSTRAINT creative_set_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE creative_set ADD CONSTRAINT creative_set_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaign(id) ON DELETE RESTRICT;
ALTER TABLE creative_set ADD CONSTRAINT creative_set_generation_request_fk FOREIGN KEY (generation_request_id) REFERENCES generation_request(id) ON DELETE SET NULL;
ALTER TABLE creative ADD CONSTRAINT creative_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE creative ADD CONSTRAINT creative_set_fk FOREIGN KEY (creative_set_id) REFERENCES creative_set(id) ON DELETE RESTRICT;
ALTER TABLE creative ADD CONSTRAINT creative_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaign(id) ON DELETE RESTRICT;
ALTER TABLE creative ADD CONSTRAINT creative_product_fk FOREIGN KEY (product_id) REFERENCES product(id) ON DELETE SET NULL;
ALTER TABLE creative ADD CONSTRAINT creative_format_selection_fk FOREIGN KEY (campaign_format_selection_id) REFERENCES campaign_format_selection(id) ON DELETE RESTRICT;
ALTER TABLE creative ADD CONSTRAINT creative_current_version_fk FOREIGN KEY (current_version_id) REFERENCES creative_version(id) ON DELETE SET NULL;
ALTER TABLE creative_version ADD CONSTRAINT creative_version_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE creative_version ADD CONSTRAINT creative_version_creative_fk FOREIGN KEY (creative_id) REFERENCES creative(id) ON DELETE RESTRICT;
ALTER TABLE creative_version ADD CONSTRAINT creative_version_parent_fk FOREIGN KEY (parent_version_id) REFERENCES creative_version(id) ON DELETE SET NULL;
ALTER TABLE creative_version ADD CONSTRAINT creative_version_profile_fk FOREIGN KEY (format_profile_id) REFERENCES format_profile(id) ON DELETE RESTRICT;
ALTER TABLE creative_version ADD CONSTRAINT creative_version_layout_fk FOREIGN KEY (layout_template_id) REFERENCES layout_template(id) ON DELETE SET NULL;
ALTER TABLE creative_version ADD CONSTRAINT creative_version_brief_fk FOREIGN KEY (brief_version_id) REFERENCES campaign_brief_version(id) ON DELETE RESTRICT;
ALTER TABLE creative_version ADD CONSTRAINT creative_version_created_by_fk FOREIGN KEY (created_by) REFERENCES user_account(id) ON DELETE SET NULL;
ALTER TABLE creative_asset_usage ADD CONSTRAINT creative_asset_usage_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE creative_asset_usage ADD CONSTRAINT creative_asset_usage_version_fk FOREIGN KEY (creative_version_id) REFERENCES creative_version(id) ON DELETE CASCADE;
ALTER TABLE creative_asset_usage ADD CONSTRAINT creative_asset_usage_asset_fk FOREIGN KEY (asset_version_id) REFERENCES asset_version(id) ON DELETE RESTRICT;
ALTER TABLE creative_edit_operation ADD CONSTRAINT creative_edit_operation_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE creative_edit_operation ADD CONSTRAINT creative_edit_operation_version_fk FOREIGN KEY (creative_version_id) REFERENCES creative_version(id) ON DELETE CASCADE;
ALTER TABLE creative_edit_operation ADD CONSTRAINT creative_edit_operation_user_fk FOREIGN KEY (applied_by) REFERENCES user_account(id) ON DELETE SET NULL;
ALTER TABLE creative_render ADD CONSTRAINT creative_render_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE creative_render ADD CONSTRAINT creative_render_version_fk FOREIGN KEY (creative_version_id) REFERENCES creative_version(id) ON DELETE RESTRICT;
ALTER TABLE creative_render ADD CONSTRAINT creative_render_job_fk FOREIGN KEY (async_job_id) REFERENCES async_job(id) ON DELETE SET NULL;
ALTER TABLE creative_render ADD CONSTRAINT creative_render_file_fk FOREIGN KEY (file_object_id) REFERENCES file_object(id) ON DELETE RESTRICT;
ALTER TABLE validation_run ADD CONSTRAINT validation_run_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE validation_run ADD CONSTRAINT validation_run_version_fk FOREIGN KEY (creative_version_id) REFERENCES creative_version(id) ON DELETE RESTRICT;
ALTER TABLE validation_run ADD CONSTRAINT validation_run_job_fk FOREIGN KEY (async_job_id) REFERENCES async_job(id) ON DELETE SET NULL;
ALTER TABLE validation_run ADD CONSTRAINT validation_run_render_fk FOREIGN KEY (input_render_id) REFERENCES creative_render(id) ON DELETE SET NULL;
ALTER TABLE validation_run ADD CONSTRAINT validation_run_requested_by_fk FOREIGN KEY (requested_by) REFERENCES user_account(id) ON DELETE SET NULL;
ALTER TABLE validation_result ADD CONSTRAINT validation_result_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE validation_result ADD CONSTRAINT validation_result_run_fk FOREIGN KEY (validation_run_id) REFERENCES validation_run(id) ON DELETE CASCADE;
ALTER TABLE validation_result ADD CONSTRAINT validation_result_rule_fk FOREIGN KEY (rule_definition_id) REFERENCES rule_definition(id) ON DELETE SET NULL;
ALTER TABLE warning_acknowledgement ADD CONSTRAINT warning_ack_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE warning_acknowledgement ADD CONSTRAINT warning_ack_result_fk FOREIGN KEY (validation_result_id) REFERENCES validation_result(id) ON DELETE RESTRICT;
ALTER TABLE warning_acknowledgement ADD CONSTRAINT warning_ack_user_fk FOREIGN KEY (acknowledged_by) REFERENCES user_account(id) ON DELETE RESTRICT;
ALTER TABLE comment_thread ADD CONSTRAINT comment_thread_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE comment ADD CONSTRAINT comment_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE comment ADD CONSTRAINT comment_thread_fk FOREIGN KEY (comment_thread_id) REFERENCES comment_thread(id) ON DELETE CASCADE;
ALTER TABLE comment ADD CONSTRAINT comment_author_fk FOREIGN KEY (author_id) REFERENCES user_account(id) ON DELETE RESTRICT;
ALTER TABLE comment ADD CONSTRAINT comment_parent_fk FOREIGN KEY (parent_comment_id) REFERENCES comment(id) ON DELETE SET NULL;
ALTER TABLE approval_request ADD CONSTRAINT approval_request_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE approval_request ADD CONSTRAINT approval_request_version_fk FOREIGN KEY (creative_version_id) REFERENCES creative_version(id) ON DELETE RESTRICT;
ALTER TABLE approval_request ADD CONSTRAINT approval_request_validation_fk FOREIGN KEY (validation_run_id) REFERENCES validation_run(id) ON DELETE RESTRICT;
ALTER TABLE approval_request ADD CONSTRAINT approval_request_requested_by_fk FOREIGN KEY (requested_by) REFERENCES user_account(id) ON DELETE RESTRICT;
ALTER TABLE approval_request ADD CONSTRAINT approval_request_assignee_fk FOREIGN KEY (assignee_id) REFERENCES user_account(id) ON DELETE SET NULL;
ALTER TABLE approval_request ADD CONSTRAINT approval_request_superseded_by_fk FOREIGN KEY (superseded_by) REFERENCES approval_request(id) ON DELETE SET NULL;
ALTER TABLE approval_decision ADD CONSTRAINT approval_decision_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE approval_decision ADD CONSTRAINT approval_decision_request_fk FOREIGN KEY (approval_request_id) REFERENCES approval_request(id) ON DELETE RESTRICT;
ALTER TABLE approval_decision ADD CONSTRAINT approval_decision_user_fk FOREIGN KEY (decided_by) REFERENCES user_account(id) ON DELETE RESTRICT;
ALTER TABLE export_job ADD CONSTRAINT export_job_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE export_job ADD CONSTRAINT export_job_campaign_fk FOREIGN KEY (campaign_id) REFERENCES campaign(id) ON DELETE RESTRICT;
ALTER TABLE export_job ADD CONSTRAINT export_job_async_job_fk FOREIGN KEY (async_job_id) REFERENCES async_job(id) ON DELETE SET NULL;
ALTER TABLE export_job ADD CONSTRAINT export_job_recipe_fk FOREIGN KEY (export_recipe_id) REFERENCES export_recipe(id) ON DELETE RESTRICT;
ALTER TABLE export_job ADD CONSTRAINT export_job_requested_by_fk FOREIGN KEY (requested_by) REFERENCES user_account(id) ON DELETE RESTRICT;
ALTER TABLE export_item ADD CONSTRAINT export_item_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE export_item ADD CONSTRAINT export_item_job_fk FOREIGN KEY (export_job_id) REFERENCES export_job(id) ON DELETE CASCADE;
ALTER TABLE export_item ADD CONSTRAINT export_item_version_fk FOREIGN KEY (creative_version_id) REFERENCES creative_version(id) ON DELETE RESTRICT;
ALTER TABLE export_item ADD CONSTRAINT export_item_approval_fk FOREIGN KEY (approval_request_id) REFERENCES approval_request(id) ON DELETE RESTRICT;
ALTER TABLE export_item ADD CONSTRAINT export_item_validation_fk FOREIGN KEY (validation_run_id) REFERENCES validation_run(id) ON DELETE RESTRICT;
ALTER TABLE export_file ADD CONSTRAINT export_file_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE export_file ADD CONSTRAINT export_file_job_fk FOREIGN KEY (export_job_id) REFERENCES export_job(id) ON DELETE CASCADE;
ALTER TABLE export_file ADD CONSTRAINT export_file_item_fk FOREIGN KEY (export_item_id) REFERENCES export_item(id) ON DELETE SET NULL;
ALTER TABLE export_file ADD CONSTRAINT export_file_object_fk FOREIGN KEY (file_object_id) REFERENCES file_object(id) ON DELETE RESTRICT;
ALTER TABLE async_job ADD CONSTRAINT async_job_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE async_job ADD CONSTRAINT async_job_requested_by_fk FOREIGN KEY (requested_by) REFERENCES user_account(id) ON DELETE SET NULL;
ALTER TABLE async_job_item ADD CONSTRAINT async_job_item_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE async_job_item ADD CONSTRAINT async_job_item_job_fk FOREIGN KEY (async_job_id) REFERENCES async_job(id) ON DELETE CASCADE;
ALTER TABLE activity_event ADD CONSTRAINT activity_event_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE activity_event ADD CONSTRAINT activity_event_actor_fk FOREIGN KEY (actor_id) REFERENCES user_account(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE SET NULL;
ALTER TABLE audit_log ADD CONSTRAINT audit_log_actor_fk FOREIGN KEY (actor_id) REFERENCES user_account(id) ON DELETE SET NULL;
ALTER TABLE notification ADD CONSTRAINT notification_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE notification ADD CONSTRAINT notification_user_fk FOREIGN KEY (user_id) REFERENCES user_account(id) ON DELETE RESTRICT;
ALTER TABLE notification ADD CONSTRAINT notification_event_fk FOREIGN KEY (event_id) REFERENCES activity_event(id) ON DELETE SET NULL;

-- Operational infrastructure tables intentionally excluded from the 63-entity catalog.
CREATE TABLE outbox_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, topic varchar(200) NOT NULL,
  message_key varchar(500) NOT NULL, message_type varchar(200) NOT NULL, schema_version integer NOT NULL,
  payload_json jsonb NOT NULL, headers_json jsonb NOT NULL DEFAULT '{}'::jsonb, available_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz, attempt_count integer NOT NULL DEFAULT 0, last_error text, lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE message_consumption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL, message_id uuid NOT NULL,
  handler_name varchar(200) NOT NULL, handler_version varchar(100) NOT NULL, outcome_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, message_id, handler_name, handler_version)
);
CREATE INDEX outbox_message_claim_idx ON outbox_message (available_at, created_at) WHERE published_at IS NULL;
CREATE INDEX outbox_message_workspace_idx ON outbox_message (workspace_id, created_at);
ALTER TABLE outbox_message ADD CONSTRAINT outbox_message_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
ALTER TABLE message_consumption ADD CONSTRAINT message_consumption_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE RESTRICT;
