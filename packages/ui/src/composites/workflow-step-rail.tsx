import type { ReactNode } from "react";
import {
  PlumeBadge,
  PlumeButton,
  PlumeStatusDot,
  PlumeText,
} from "../components/index.js";

export type WorkflowStepStatus =
  | "locked"
  | "available"
  | "active"
  | "completed"
  | "blocked";

export interface WorkflowStep {
  id: string;
  label: string;
  status: WorkflowStepStatus;
  description?: ReactNode;
}

export interface WorkflowStepRailProps {
  steps: readonly WorkflowStep[];
  activeStepId?: string;
  onStepChange?: (step: WorkflowStep) => void;
  ariaLabel?: string;
}

const stepStatusLabels: Record<WorkflowStepStatus, string> = {
  locked: "Locked",
  available: "Available",
  active: "In progress",
  completed: "Completed",
  blocked: "Blocked",
};

const stepStatusVariants: Record<
  WorkflowStepStatus,
  "success" | "warning" | "error" | "accent" | "neutral"
> = {
  locked: "neutral",
  available: "accent",
  active: "accent",
  completed: "success",
  blocked: "error",
};

const stepBadgeVariants: Record<
  WorkflowStepStatus,
  "success" | "warning" | "error" | "info" | "neutral"
> = {
  locked: "neutral",
  available: "info",
  active: "info",
  completed: "success",
  blocked: "error",
};

function canNavigate(status: WorkflowStepStatus) {
  return status === "available" || status === "active" || status === "completed";
}

export function WorkflowStepRail({
  steps,
  activeStepId,
  onStepChange,
  ariaLabel = "Campaign workflow",
}: WorkflowStepRailProps) {
  return (
    <nav
      aria-label={ariaLabel}
      data-plume-component="workflow-step-rail"
    >
      <ol data-plume-region="workflow-steps">
        {steps.map((step) => {
          const isActive =
            step.id === activeStepId ||
            (activeStepId === undefined && step.status === "active");
          const statusLabel = stepStatusLabels[step.status];
          const navigable = canNavigate(step.status) && onStepChange !== undefined;

          return (
            <li
              key={step.id}
              data-step-id={step.id}
              data-step-status={step.status}
              data-step-active={String(isActive)}
            >
              <PlumeStatusDot
                variant={stepStatusVariants[step.status]}
                label={statusLabel}
                {...(isActive ? { isPulsing: true } : {})}
              />
              {navigable ? (
                <PlumeButton
                  type="button"
                  label={step.label}
                  variant={isActive ? "primary" : "ghost"}
                  size="sm"
                  onClick={() => onStepChange(step)}
                  {...(isActive ? { "aria-current": "step" } : {})}
                />
              ) : (
                <PlumeText>{step.label}</PlumeText>
              )}
              <PlumeBadge
                label={statusLabel}
                variant={stepBadgeVariants[step.status]}
              />
              {step.description ? (
                <PlumeText type="supporting">{step.description}</PlumeText>
              ) : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
