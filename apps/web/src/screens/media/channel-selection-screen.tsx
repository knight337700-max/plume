import {
  ChannelSelectionCard,
  PlumeBanner,
  PlumeEmptyState,
  PlumeHeading,
  PlumeText,
  type ChannelSelectionCardProps,
} from "@plume/ui";

export type ChannelSelectionState = "loading" | "ready" | "empty" | "error";

export type ChannelOption = Omit<
  ChannelSelectionCardProps,
  "isSelected" | "onChange"
> & {
  isSelected?: boolean;
};

export interface ChannelSelectionScreenProps {
  channels?: readonly ChannelOption[];
  selectedChannelIds?: readonly string[];
  state?: ChannelSelectionState;
  onSelectionChange?: (channelId: string, isSelected: boolean) => void;
}

export function ChannelSelectionScreen({
  channels = [],
  selectedChannelIds,
  state = channels.length === 0 ? "empty" : "ready",
  onSelectionChange,
}: ChannelSelectionScreenProps) {
  return (
    <main data-screen-id="MEDIA-01" data-screen-state={state}>
      <header>
        <PlumeHeading level={1}>Select channels</PlumeHeading>
        <PlumeText type="supporting">
          Choose the channels this campaign will generate creative for.
        </PlumeText>
      </header>
      {state === "loading" ? (
        <PlumeText>Loading available channels…</PlumeText>
      ) : null}
      {state === "error" ? (
        <PlumeBanner
          status="error"
          title="Channels unavailable"
          description="We could not load the available channels. Try again."
        />
      ) : null}
      {state === "empty" ? (
        <PlumeEmptyState
          title="No channels available"
          description="There are no active channels for this campaign yet."
        />
      ) : null}
      {state === "ready" ? (
        <ul aria-label="Available channels">
          {channels.map((channel) => {
            const isSelected = selectedChannelIds
              ? selectedChannelIds.includes(channel.id)
              : channel.isSelected ?? false;

            return (
              <li key={channel.id}>
                <ChannelSelectionCard
                  {...channel}
                  isSelected={isSelected}
                  onChange={(nextSelected) =>
                    onSelectionChange?.(channel.id, nextSelected)
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
