import type { ReactNode } from "react";
import {
  PlumeButton,
  PlumeText,
  ValidationIssueCard,
  type ValidationIssueSeverity,
} from "@plume/ui";

export interface ValidationIssue {
  readonly id: string;
  readonly severity: ValidationIssueSeverity;
  readonly target: string;
  readonly message: ReactNode;
  readonly suggestedFix?: ReactNode;
  readonly elementId?: string;
}

export type WarningAcknowledgements = Readonly<Record<string, string>>;

export function recordWarningAcknowledgement(
  acknowledgements: WarningAcknowledgements,
  issueId: string,
  reason: string,
): WarningAcknowledgements {
  return { ...acknowledgements, [issueId]: reason };
}

export interface IssueListProps {
  issues?: readonly ValidationIssue[];
  acknowledgements?: WarningAcknowledgements;
  onIssueSelect?: (issue: ValidationIssue) => void;
  onEditIssue?: (issue: ValidationIssue) => void;
  onAcknowledgeWarning?: (issue: ValidationIssue, reason: string) => void;
}

const defaultWarningReason = "Warning reviewed and acknowledged by the user.";

export function IssueList({
  issues = [],
  acknowledgements = {},
  onIssueSelect,
  onEditIssue,
  onAcknowledgeWarning,
}: IssueListProps) {
  return (
    <ol data-plume-feature="validation-issue-list" aria-label="Validation issues">
      {issues.map((issue) => (
        <li key={issue.id} data-validation-issue-id={issue.id}>
          <ValidationIssueCard
            id={issue.id}
            severity={issue.severity}
            target={issue.target}
            message={issue.message}
            {...(issue.suggestedFix ? { suggestedFix: issue.suggestedFix } : {})}
            {...(issue.severity === "error" && onEditIssue
              ? { onFix: () => onEditIssue(issue) }
              : {})}
            {...(issue.severity === "warning" && onAcknowledgeWarning
              ? {
                  onAcknowledgeWarning: () =>
                    onAcknowledgeWarning(issue, defaultWarningReason),
                }
              : {})}
          />
          {issue.elementId ? (
            <PlumeButton
              type="button"
              label={`Highlight ${issue.target}`}
              variant="ghost"
              data-issue-action="highlight"
              data-highlight-element-id={issue.elementId}
              {...(onIssueSelect ? { onClick: () => onIssueSelect(issue) } : {})}
            />
          ) : null}
          {acknowledgements[issue.id] ? (
            <PlumeText type="supporting">
              Acknowledgement reason: {acknowledgements[issue.id]}
            </PlumeText>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
