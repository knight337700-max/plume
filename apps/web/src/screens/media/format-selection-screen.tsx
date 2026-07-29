import {
  PlumeBanner,
  PlumeBadge,
  PlumeEmptyState,
  PlumeHeading,
  PlumeText,
} from "@plume/ui";
import { FormatCard, type FormatCardProps } from "../../features/media/format-card.js";

export type FormatSelectionState = "loading" | "ready" | "empty" | "error";

export type FormatOption = FormatCardProps;

export interface FormatSelectionScreenProps {
  formats?: readonly FormatOption[];
  selectedFormatIds?: readonly string[];
  state?: FormatSelectionState;
  onSelectionChange?: (formatId: string, isSelected: boolean) => void;
}

export function FormatSelectionScreen({
  formats = [],
  selectedFormatIds,
  state = formats.length === 0 ? "empty" : "ready",
  onSelectionChange,
}: FormatSelectionScreenProps) {
  const selectableFormatCount = formats.filter(
    (format) =>
      format.isAvailable !== false &&
      format.status !== "pending" &&
      format.status !== "pending_verify" &&
      format.status !== "PENDING_VERIFY",
  ).length;

  return (
    <main data-screen-id="MEDIA-02" data-screen-state={state}>
      <header>
        <PlumeHeading level={1}>Select formats</PlumeHeading>
        <PlumeText type="supporting">
          Review ratio previews and delivery specifications before generation.
        </PlumeText>
        <PlumeBadge
          label={`${selectableFormatCount} selectable formats`}
          variant="info"
        />
      </header>
      {state === "loading" ? (
        <PlumeText>Loading format profiles…</PlumeText>
      ) : null}
      {state === "error" ? (
        <PlumeBanner
          status="error"
          title="Formats unavailable"
          description="We could not load the format profiles. Try again."
        />
      ) : null}
      {state === "empty" ? (
        <PlumeEmptyState
          title="No format profiles available"
          description="Select an active channel before choosing formats."
        />
      ) : null}
      {state === "ready" ? (
        <ul aria-label="Available format profiles">
          {formats.map((format) => {
            const isSelected = selectedFormatIds
              ? selectedFormatIds.includes(format.id)
              : format.isSelected ?? false;

            return (
              <li key={format.id}>
                <FormatCard
                  {...format}
                  isSelected={isSelected}
                  onChange={(nextSelected) =>
                    onSelectionChange?.(format.id, nextSelected)
                  }
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </main>
  );
}
