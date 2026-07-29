import { CampaignWorkShell, PlumeBanner, PlumeButton, PlumeHeading, PlumeText, WorkflowStepRail, type WorkflowStep } from "@plume/ui";
import { deriveWorkflowViewModel, type WorkflowBlocker, type CampaignWorkflowStep } from "../../features/campaign/workflow-view-model.js";

export interface CampaignOverviewScreenProps { campaignName?: string; currentStep?: CampaignWorkflowStep; blockers?: readonly WorkflowBlocker[]; isStale?: boolean; steps?: readonly WorkflowStep[]; onPrimaryAction?: (action: string) => void }

export function CampaignOverviewScreen({ campaignName = "Campaign", currentStep = "SOURCES", blockers = [], isStale = false, steps = [], onPrimaryAction }: CampaignOverviewScreenProps) {
  const model = deriveWorkflowViewModel({ currentStep, blockers, isStale });
  const action = () => onPrimaryAction?.(model.ctaAction);
  return (
    <main data-screen-id="CAMP-03" data-screen-state={isStale ? "stale" : blockers.length > 0 ? "blocked" : "ready"}>
      <CampaignWorkShell workflowRail={steps.length > 0 ? <WorkflowStepRail steps={steps} activeStepId={currentStep} /> : <PlumeText>Workflow</PlumeText>}>
        <header><PlumeHeading level={1}>{campaignName}</PlumeHeading><PlumeText type="supporting">Current step: {currentStep}</PlumeText></header>
        {isStale ? <PlumeBanner status="warning" title="Workflow is stale" description="Refresh to see the latest campaign state." /> : null}
        {blockers.length > 0 ? <PlumeBanner status="error" title="Workflow blockers" description={`${blockers.length} blocker(s) need attention.`}><ul>{blockers.map((blocker) => <li key={blocker.code}>{blocker.message}</li>)}</ul></PlumeBanner> : null}
        <PlumeButton type="button" label={model.ctaLabel} variant="primary" isDisabled={model.ctaDisabled} onClick={action} />
      </CampaignWorkShell>
    </main>
  );
}
