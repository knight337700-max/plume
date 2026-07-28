import { pgEnum } from "drizzle-orm/pg-core";

export const workspaceStatusEnum = pgEnum("workspace_status", ["ACTIVE", "SUSPENDED", "ARCHIVED"]);
export const userAccountStatusEnum = pgEnum("user_account_status", [
  "ACTIVE",
  "INVITED",
  "LOCKED",
  "DISABLED",
]);
export const workspaceMemberStatusEnum = pgEnum("workspace_member_status", [
  "ACTIVE",
  "INVITED",
  "SUSPENDED",
]);
export const workspaceInvitationStatusEnum = pgEnum("workspace_invitation_status", [
  "PENDING",
  "ACCEPTED",
  "EXPIRED",
  "REVOKED",
]);
export const advertiserStatusEnum = pgEnum("advertiser_status", ["ACTIVE", "ARCHIVED"]);
export const brandStatusEnum = pgEnum("brand_status", ["ACTIVE", "ARCHIVED"]);
export const productStatusEnum = pgEnum("product_status", ["ACTIVE", "ARCHIVED", "DRAFT"]);
export const productVariantStatusEnum = pgEnum("product_variant_status", [
  "ACTIVE",
  "ARCHIVED",
  "OUT_OF_STOCK",
]);
export const designAssetStatusEnum = pgEnum("design_asset_status", [
  "ACTIVE",
  "ARCHIVED",
  "PROCESSING",
  "FAILED",
]);
export const campaignStatusEnum = pgEnum("campaign_status", [
  "DRAFT",
  "ANALYZING",
  "ACTIVE",
  "COMPLETED",
  "ARCHIVED",
]);
export const campaignSourceStatusEnum = pgEnum("campaign_source_status", [
  "UPLOADED",
  "ANALYZING",
  "READY",
  "FAILED",
  "ARCHIVED",
]);
export const campaignSourceAnalysisStatusEnum = pgEnum("campaign_source_analysis_status", [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
]);
export const campaignBriefStatusEnum = pgEnum("campaign_brief_status", [
  "DRAFT",
  "REVIEW_REQUIRED",
  "CONFIRMED",
]);
export const campaignBriefVersionStatusEnum = pgEnum("campaign_brief_version_status", [
  "DRAFT",
  "CONFIRMED",
  "SUPERSEDED",
]);
export const campaignProductStatusEnum = pgEnum("campaign_product_status", [
  "MATCHED",
  "EXCLUDED",
  "PENDING",
]);
export const campaignAssetStatusEnum = pgEnum("campaign_asset_status", [
  "SELECTED",
  "RECOMMENDED",
  "EXCLUDED",
]);
export const campaignChannelSelectionStatusEnum = pgEnum("campaign_channel_selection_status", [
  "SELECTED",
  "REMOVED",
]);
export const campaignFormatSelectionStatusEnum = pgEnum("campaign_format_selection_status", [
  "SELECTED",
  "REMOVED",
  "BLOCKED",
]);
export const generationRequestStatusEnum = pgEnum("generation_request_status", [
  "QUEUED",
  "RUNNING",
  "PARTIAL_SUCCESS",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export const generationRequestItemStatusEnum = pgEnum("generation_request_item_status", [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export const channelStatusEnum = pgEnum("channel_status", ["ACTIVE", "DISABLED"]);
export const productFamilyStatusEnum = pgEnum("product_family_status", [
  "ACTIVE",
  "LEGACY_ONLY",
  "DISABLED",
]);
export const adProductStatusEnum = pgEnum("ad_product_status", [
  "ACTIVE",
  "LEGACY_ONLY",
  "DISABLED",
]);
export const placementStatusEnum = pgEnum("placement_status", [
  "ACTIVE",
  "FEATURE_DEPENDENT",
  "ENDED",
  "DISABLED",
]);
export const guidelineVersionStatusEnum = pgEnum("guideline_version_status", [
  "DRAFT",
  "ACTIVE",
  "SUPERSEDED",
  "RETIRED",
]);
export const exportRecipeStatusEnum = pgEnum("export_recipe_status", [
  "DRAFT",
  "ACTIVE",
  "LEGACY_ONLY",
  "RETIRED",
]);
export const formatProfileStatusEnum = pgEnum("format_profile_status", [
  "DRAFT",
  "ACTIVE",
  "PENDING_VERIFY",
  "FEATURE_DEPENDENT",
  "LEGACY_ONLY",
  "DISABLED",
]);
export const formatPlacementStatusEnum = pgEnum("format_placement_status", [
  "ACTIVE",
  "BLOCKED",
  "FEATURE_DEPENDENT",
]);
export const ruleSetStatusEnum = pgEnum("rule_set_status", [
  "DRAFT",
  "ACTIVE",
  "LEGACY_ONLY",
  "RETIRED",
]);
export const layoutTemplateStatusEnum = pgEnum("layout_template_status", [
  "DRAFT",
  "ACTIVE",
  "PENDING_VERIFY",
  "LEGACY_ONLY",
  "RETIRED",
]);
export const catalogOverrideStatusEnum = pgEnum("catalog_override_status", ["ACTIVE", "DISABLED"]);
export const creativeSetStatusEnum = pgEnum("creative_set_status", [
  "DRAFT",
  "GENERATING",
  "GENERATED",
  "PARTIALLY_APPROVED",
  "APPROVED",
  "EXPORTED",
  "ARCHIVED",
]);
export const creativeStatusEnum = pgEnum("creative_status", [
  "DRAFT",
  "GENERATING",
  "GENERATED",
  "REVISION_REQUIRED",
  "READY_FOR_APPROVAL",
  "APPROVED",
  "EXPORTED",
  "ARCHIVED",
]);
export const creativeVersionStatusEnum = pgEnum("creative_version_status", [
  "DRAFT",
  "VALIDATING",
  "REVISION_REQUIRED",
  "READY_FOR_APPROVAL",
  "APPROVED",
  "EXPORTED",
  "SUPERSEDED",
]);
export const creativeRenderStatusEnum = pgEnum("creative_render_status", ["COMPLETED", "FAILED"]);
export const validationRunStatusEnum = pgEnum("validation_run_status", [
  "QUEUED",
  "RUNNING",
  "PASS",
  "WARNING",
  "ERROR",
  "FAILED",
]);
export const validationResultStatusEnum = pgEnum("validation_result_status", [
  "OPEN",
  "FIXED",
  "ACKNOWLEDGED",
  "NOT_APPLICABLE",
]);
export const commentThreadStatusEnum = pgEnum("comment_thread_status", [
  "OPEN",
  "RESOLVED",
  "ARCHIVED",
]);
export const commentStatusEnum = pgEnum("comment_status", ["ACTIVE", "REDACTED"]);
export const approvalRequestStatusEnum = pgEnum("approval_request_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
  "SUPERSEDED",
]);
export const exportJobStatusEnum = pgEnum("export_job_status", [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
  "EXPIRED",
]);
export const exportItemStatusEnum = pgEnum("export_item_status", [
  "PENDING",
  "COMPLETED",
  "FAILED",
]);
export const asyncJobStatusEnum = pgEnum("async_job_status", [
  "QUEUED",
  "RUNNING",
  "PARTIAL_SUCCESS",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export const asyncJobItemStatusEnum = pgEnum("async_job_item_status", [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);
export const workspaceRoleEnum = pgEnum("workspace_role", [
  "OWNER",
  "ADMIN",
  "EDITOR",
  "REVIEWER",
  "VIEWER",
]);
export const jobTypeEnum = pgEnum("job_type", [
  "BRIEF_ANALYSIS",
  "PRODUCT_MATCH",
  "ASSET_ANALYSIS",
  "ASSET_RECOMMENDATION",
  "CREATIVE_GENERATION",
  "CREATIVE_RENDER",
  "VALIDATION",
  "NATURAL_LANGUAGE_EDIT",
  "EXPORT_RENDER",
  "CATALOG_INTEGRITY_CHECK",
]);
export const validationSeverityEnum = pgEnum("validation_severity", ["INFO", "WARNING", "ERROR"]);
export const validationTypeEnum = pgEnum("validation_type", ["DETERMINISTIC", "AI_ASSISTED"]);
export const fileRoleEnum = pgEnum("file_role", [
  "CREATIVE",
  "PREVIEW",
  "MANIFEST",
  "VALIDATION_REPORT",
  "COPY_CSV",
  "PACKAGE",
  "SOURCE",
]);
export const catalogVerificationStatusEnum = pgEnum("catalog_verification_status", [
  "VERIFIED",
  "APPLICATION_STANDARD",
  "FEATURE_DEPENDENT",
  "PENDING_ACCOUNT_UI_CONFIRMATION",
  "PENDING_VERIFY",
  "SCHEDULED_REQUIREMENT",
]);
