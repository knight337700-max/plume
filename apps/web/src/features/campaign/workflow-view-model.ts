export type CampaignWorkflowStep = "SOURCES" | "BRIEF" | "PRODUCT_MATCHING" | "ASSET_POOL" | "MEDIA_SELECTION" | "READY";

export interface WorkflowBlocker { readonly code: string; readonly message: string; readonly severity?: "error" | "warning" }
export interface WorkflowViewModelInput { readonly currentStep: CampaignWorkflowStep; readonly blockers: readonly WorkflowBlocker[]; readonly isStale?: boolean }
export interface WorkflowViewModel {
  readonly currentStep: CampaignWorkflowStep;
  readonly blockers: readonly WorkflowBlocker[];
  readonly isStale: boolean;
  readonly ctaLabel: string;
  readonly ctaDisabled: boolean;
  readonly ctaAction: "refresh" | "resolve-blockers" | "continue" | "complete";
}

const stepLabels: Record<CampaignWorkflowStep, string> = {
  SOURCES: "Upload sources",
  BRIEF: "Review AI brief",
  PRODUCT_MATCHING: "Confirm products",
  ASSET_POOL: "Select assets",
  MEDIA_SELECTION: "Select channels and formats",
  READY: "Campaign ready",
};

export function deriveWorkflowViewModel(input: WorkflowViewModelInput): WorkflowViewModel {
  const isStale = input.isStale ?? false;
  if (isStale) return { ...input, isStale, ctaLabel: "Refresh workflow", ctaDisabled: false, ctaAction: "refresh" };
  if (input.blockers.length > 0) return { ...input, isStale, ctaLabel: "Resolve blockers", ctaDisabled: false, ctaAction: "resolve-blockers" };
  if (input.currentStep === "READY") return { ...input, isStale, ctaLabel: "Campaign ready", ctaDisabled: true, ctaAction: "complete" };
  return { ...input, isStale, ctaLabel: `Continue: ${stepLabels[input.currentStep]}`, ctaDisabled: false, ctaAction: "continue" };
}
