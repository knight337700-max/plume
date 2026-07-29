import { useState, type FormEvent } from "react";
import { PlumeButton, PlumeHeading, PlumeText, PlumeTextInput } from "@plume/ui";

export interface CampaignCreateScreenProps { onCreate?: (input: { name: string; objective: string }) => void | Promise<void>; state?: "idle" | "submitting" | "error"; errorMessage?: string }

export function CampaignCreateScreen({ onCreate, state = "idle", errorMessage }: CampaignCreateScreenProps) {
  const [name, setName] = useState("");
  const [objective, setObjective] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); await onCreate?.({ name, objective }); }
  return (
    <main data-screen-id="CAMP-02" data-screen-state={state}>
      <PlumeHeading level={1}>Create campaign</PlumeHeading>
      <PlumeText type="supporting">Set the campaign basics before starting the workflow.</PlumeText>
      {state === "error" ? <p role="alert">{errorMessage ?? "Campaign could not be created."}</p> : null}
      <form onSubmit={submit}>
        <PlumeTextInput label="Campaign name" value={name} onChange={setName} isRequired isDisabled={state === "submitting"} />
        <PlumeTextInput label="Objective" value={objective} onChange={setObjective} isRequired isDisabled={state === "submitting"} />
        <PlumeButton type="submit" label={state === "submitting" ? "Creating campaign" : "Create campaign"} variant="primary" isLoading={state === "submitting"} />
      </form>
    </main>
  );
}
