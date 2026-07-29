import type { ComponentProps } from "react";
/* eslint-disable no-restricted-imports -- Astryx feedback primitives are consumed through the adapter. */
import {
  AstryxEmptyState,
  AstryxProgressBar,
  AstryxSkeleton,
} from "../astryx/index.js";
/* eslint-enable no-restricted-imports */

export type PlumeProgressStep = {
  current: number;
  total: number;
  label?: string;
};

export type PlumeProgressProps = ComponentProps<typeof AstryxProgressBar> & {
  currentStep?: PlumeProgressStep;
};

export function PlumeProgress({
  currentStep,
  "aria-valuetext": ariaValueText,
  ...props
}: PlumeProgressProps) {
  const stepText = currentStep
    ? `${currentStep.label ? `${currentStep.label}: ` : ""}Step ${currentStep.current} of ${currentStep.total}`
    : ariaValueText;

  return (
    <AstryxProgressBar
      {...props}
      data-plume-component="progress"
      {...(stepText ? { "aria-valuetext": stepText } : {})}
      {...(currentStep
        ? { "data-plume-current-step": String(currentStep.current) }
        : {})}
    />
  );
}

export type PlumeSkeletonProps = ComponentProps<typeof AstryxSkeleton>;

export function PlumeSkeleton(props: PlumeSkeletonProps) {
  return <AstryxSkeleton {...props} data-plume-component="skeleton" />;
}

export type PlumeEmptyStateProps = ComponentProps<typeof AstryxEmptyState>;

export function PlumeEmptyState(props: PlumeEmptyStateProps) {
  return <AstryxEmptyState {...props} data-plume-component="empty-state" />;
}
