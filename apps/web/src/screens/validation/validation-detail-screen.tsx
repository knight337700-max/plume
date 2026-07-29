import { useState } from "react";
import { PlumeBanner, PlumeButton, PlumeHeading, PlumeText } from "@plume/ui";
import {
  IssueList,
  recordWarningAcknowledgement,
  type ValidationIssue,
  type WarningAcknowledgements,
} from "../../features/validation/issue-list.js";
import {
  useElementHighlight,
  type ElementHighlight,
} from "../../features/validation/use-element-highlight.js";

export type ValidationDetailState = "loading" | "ready" | "error" | "passed";

export interface ValidationDetailScreenProps {
  version?: string;
  issues?: readonly ValidationIssue[];
  state?: ValidationDetailState;
  warningAcknowledgements?: WarningAcknowledgements;
  initialHighlight?: ElementHighlight;
  onIssueSelect?: (issue: ValidationIssue) => void;
  onEditIssue?: (issue: ValidationIssue) => void;
  onRevalidate?: () => void;
  onWarningAcknowledge?: (issue: ValidationIssue, reason: string) => void;
}

export function ValidationDetailScreen({
  version = "v1",
  issues = [],
  state = issues.length === 0 ? "passed" : "ready",
  warningAcknowledgements = {},
  initialHighlight,
  onIssueSelect,
  onEditIssue,
  onRevalidate,
  onWarningAcknowledge,
}: ValidationDetailScreenProps) {
  const [acknowledgements, setAcknowledgements] = useState<WarningAcknowledgements>(
    warningAcknowledgements,
  );
  const { highlight, highlightElement } = useElementHighlight(initialHighlight);
  const errorCount = issues.filter((issue) => issue.severity === "error").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;

  const handleIssueSelect = (issue: ValidationIssue) => {
    highlightElement({
      issueId: issue.id,
      reason: issue.target,
      ...(issue.elementId ? { elementId: issue.elementId } : {}),
    });
    onIssueSelect?.(issue);
  };

  const handleWarningAcknowledge = (issue: ValidationIssue, reason: string) => {
    setAcknowledgements((current) =>
      recordWarningAcknowledgement(current, issue.id, reason),
    );
    onWarningAcknowledge?.(issue, reason);
  };

  return (
    <main
      data-screen-id="VALID-01"
      data-screen-state={state}
      {...(highlight?.elementId
        ? { "data-highlighted-element-id": highlight.elementId }
        : {})}
    >
      <header>
        <PlumeHeading level={1}>Validation detail</PlumeHeading>
        <PlumeText type="supporting">
          Version {version} · {errorCount} errors · {warningCount} warnings
        </PlumeText>
      </header>
      {state === "loading" ? <PlumeText>Running validation…</PlumeText> : null}
      {state === "error" ? (
        <PlumeBanner
          status="error"
          title="Validation failed to run"
          description="Retry validation after checking the creative version."
        />
      ) : null}
      {state === "passed" ? (
        <PlumeBanner
          status="success"
          title="Validation passed"
          description="No blocking issues were found for this creative version."
        />
      ) : null}
      {highlight ? (
        <PlumeBanner
          status="info"
          title="Element highlighted"
          description={`Selected ${highlight.elementId} from issue ${highlight.issueId}.`}
          data-plume-region="element-highlight"
        />
      ) : null}
      <IssueList
        issues={issues}
        acknowledgements={acknowledgements}
        onIssueSelect={handleIssueSelect}
        {...(onEditIssue ? { onEditIssue } : {})}
        onAcknowledgeWarning={handleWarningAcknowledge}
      />
      {onRevalidate ? (
        <PlumeButton
          type="button"
          label="Revalidate creative"
          variant="primary"
          onClick={onRevalidate}
        />
      ) : null}
    </main>
  );
}
