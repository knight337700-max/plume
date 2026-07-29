import type { ReactNode } from "react";
import {
  PlumeBadge,
  PlumeBanner,
  PlumeButton,
  PlumeSelectableCard,
  PlumeStatusDot,
  PlumeText,
} from "../components/index.js";

export interface ChannelSelectionCardProps {
  id: string;
  label: string;
  description: ReactNode;
  supportRange: string;
  activeFormatCount: number;
  validationStatus: "passed" | "warning" | "failed" | "pending";
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
  isDisabled?: boolean;
}

const validationLabels = {
  passed: "Validated",
  warning: "Warning",
  failed: "Validation failed",
  pending: "Pending validation",
} as const;

const validationVariants = {
  passed: "success",
  warning: "warning",
  failed: "error",
  pending: "neutral",
} as const;

export function ChannelSelectionCard({
  id,
  label,
  description,
  supportRange,
  activeFormatCount,
  validationStatus,
  isSelected,
  onChange,
  isDisabled = false,
}: ChannelSelectionCardProps) {
  return (
    <PlumeSelectableCard
      label={label}
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={isDisabled}
      data-plume-composite="channel-selection-card"
      data-channel-id={id}
    >
      <PlumeText>{label}</PlumeText>
      <PlumeText type="supporting">{description}</PlumeText>
      <PlumeText type="supporting">Support: {supportRange}</PlumeText>
      <PlumeText type="supporting">
        {activeFormatCount} active formats
      </PlumeText>
      <PlumeBadge
        label={validationLabels[validationStatus]}
        variant={validationVariants[validationStatus]}
      />
    </PlumeSelectableCard>
  );
}

export type FormatProfileStatus =
  | "active"
  | "legacy"
  | "pending"
  | "pending_verify"
  | "ACTIVE"
  | "LEGACY"
  | "PENDING_VERIFY";

export interface FormatProfileCardProps {
  id: string;
  label: string;
  ratio: string;
  width: number;
  height: number;
  requirements: string;
  status: FormatProfileStatus;
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
  isAvailable?: boolean;
  blockerReason?: string;
}

function isPendingFormat(status: FormatProfileStatus) {
  return status === "pending" || status === "pending_verify" || status === "PENDING_VERIFY";
}

function formatStatusLabel(status: FormatProfileStatus) {
  if (status === "active" || status === "ACTIVE") return "Active";
  if (status === "legacy" || status === "LEGACY") return "Legacy";
  return "Pending verification";
}

export function FormatProfileCard({
  id,
  label,
  ratio,
  width,
  height,
  requirements,
  status,
  isSelected,
  onChange,
  isAvailable = true,
  blockerReason,
}: FormatProfileCardProps) {
  const pending = isPendingFormat(status);
  const selectable = isAvailable && !pending;
  const unavailableReason =
    blockerReason ??
    (pending
      ? "This format is pending verification and cannot be selected yet."
      : "This format is unavailable for the current campaign.");

  return (
    <PlumeSelectableCard
      label={label}
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={!selectable}
      data-plume-composite="format-profile-card"
      data-format-id={id}
      data-format-status={status}
    >
      <PlumeText>{label}</PlumeText>
      <PlumeText type="supporting">Ratio {ratio}</PlumeText>
      <PlumeText type="supporting">
        {width}×{height}
      </PlumeText>
      <PlumeText type="supporting">{requirements}</PlumeText>
      <PlumeBadge
        label={formatStatusLabel(status)}
        variant={pending ? "warning" : status === "legacy" || status === "LEGACY" ? "neutral" : "success"}
      />
      {!selectable ? (
        <PlumeBanner
          status="warning"
          title="Unavailable"
          description={unavailableReason}
          data-plume-region="format-blocker"
        />
      ) : null}
    </PlumeSelectableCard>
  );
}

export interface ProductMatchCardProps {
  sourceProduct: string;
  candidate: string;
  score: number;
  reason: ReactNode;
  isUserConfirmed: boolean;
  onConfirm?: () => void;
  onExclude?: () => void;
  onCreateNew?: () => void;
}

export function ProductMatchCard({
  sourceProduct,
  candidate,
  score,
  reason,
  isUserConfirmed,
  onConfirm,
  onExclude,
  onCreateNew,
}: ProductMatchCardProps) {
  const normalizedScore = Math.min(100, Math.max(0, score));

  return (
    <article
      data-plume-component="product-match-card"
      data-match-confirmed={String(isUserConfirmed)}
    >
      <PlumeText type="supporting">Source product: {sourceProduct}</PlumeText>
      <PlumeText>{candidate}</PlumeText>
      <PlumeBadge label={`AI recommendation · ${normalizedScore}%`} variant="info" />
      <PlumeText type="supporting">AI reason: {reason}</PlumeText>
      <PlumeStatusDot
        variant={isUserConfirmed ? "success" : "warning"}
        label={isUserConfirmed ? "User confirmed" : "User confirmation required"}
      />
      <PlumeText>
        User confirmation: {isUserConfirmed ? "Confirmed" : "Not confirmed"}
      </PlumeText>
      {onConfirm ? (
        <PlumeButton
          type="button"
          label="Confirm product"
          variant="primary"
          onClick={onConfirm}
        />
      ) : null}
      {onExclude ? (
        <PlumeButton
          type="button"
          label="Exclude candidate"
          variant="ghost"
          onClick={onExclude}
        />
      ) : null}
      {onCreateNew ? (
        <PlumeButton
          type="button"
          label="Create new product"
          variant="secondary"
          onClick={onCreateNew}
        />
      ) : null}
    </article>
  );
}

export type AssetRecommendationState = "recommended" | "available" | "preferred" | "excluded";

export interface AssetRecommendationCardProps {
  id: string;
  label: string;
  product: string;
  aiReason: ReactNode;
  risk?: ReactNode;
  state: AssetRecommendationState;
  isSelected: boolean;
  onChange: (isSelected: boolean) => void;
}

const assetStateLabels: Record<AssetRecommendationState, string> = {
  recommended: "AI recommended",
  available: "Available",
  preferred: "Preferred",
  excluded: "Excluded",
};

export function AssetRecommendationCard({
  id,
  label,
  product,
  aiReason,
  risk,
  state,
  isSelected,
  onChange,
}: AssetRecommendationCardProps) {
  return (
    <PlumeSelectableCard
      label={label}
      isSelected={isSelected}
      onChange={onChange}
      isDisabled={state === "excluded"}
      data-plume-composite="asset-recommendation-card"
      data-asset-id={id}
      data-asset-state={state}
    >
      <PlumeText>{label}</PlumeText>
      <PlumeText type="supporting">Product: {product}</PlumeText>
      <PlumeBadge label={assetStateLabels[state]} variant={state === "excluded" ? "neutral" : "info"} />
      <PlumeText type="supporting">AI reason: {aiReason}</PlumeText>
      {risk ? <PlumeText type="supporting">Risk: {risk}</PlumeText> : null}
    </PlumeSelectableCard>
  );
}
