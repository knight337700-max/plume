import { PlumeBanner, PlumeButton, PlumeHeading, PlumeText } from "@plume/ui";

export type GenerationConfigState = "idle" | "submitting" | "error" | "ready";

export interface GenerationConfigScreenProps {
  expectedCreativeCount?: number;
  selectedChannelCount?: number;
  selectedFormatCount?: number;
  state?: GenerationConfigState;
  onSubmit?: () => void;
}

export function GenerationConfigScreen({
  expectedCreativeCount = 0,
  selectedChannelCount = 0,
  selectedFormatCount = 0,
  state = "ready",
  onSubmit,
}: GenerationConfigScreenProps) {
  return (
    <main data-screen-id="GEN-01" data-screen-state={state}>
      <header>
        <PlumeHeading level={1}>Configure generation</PlumeHeading>
        <PlumeText type="supporting">
          Confirm the generation scope before starting the creative job.
        </PlumeText>
      </header>
      {state === "error" ? (
        <PlumeBanner
          status="error"
          title="Generation could not start"
          description="Resolve the configuration issues and try again."
        />
      ) : null}
      <section aria-label="Generation configuration">
        <PlumeText>
          Expected creatives: {expectedCreativeCount}
        </PlumeText>
        <PlumeText type="supporting">
          {selectedChannelCount} channels × {selectedFormatCount} formats
        </PlumeText>
      </section>
      <PlumeButton
        type="button"
        label={state === "submitting" ? "Starting generation…" : "Start generation"}
        variant="primary"
        isDisabled={state === "submitting"}
        {...(onSubmit ? { onClick: onSubmit } : {})}
      />
    </main>
  );
}
