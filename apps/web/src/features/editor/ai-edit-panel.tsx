import {
  PlumeBanner,
  PlumeButton,
  PlumeHeading,
  PlumeText,
  PlumeTextArea,
} from "@plume/ui";
import {
  OperationPreview,
  type EditOperation,
} from "./operation-preview.js";

export type AiEditState = "idle" | "generating" | "preview_ready" | "applying" | "error";

export interface AiEditPanelProps {
  selectedElementId?: string;
  prompt?: string;
  state?: AiEditState;
  operation?: EditOperation;
  onPromptChange?: (prompt: string) => void;
  onGenerate?: (prompt: string) => void;
  onConfirmOperation?: () => void;
  onApplyOperation?: () => void;
  onRejectOperation?: () => void;
}

export function AiEditPanel({
  selectedElementId,
  prompt = "",
  state = "idle",
  operation,
  onPromptChange,
  onGenerate,
  onConfirmOperation,
  onApplyOperation,
  onRejectOperation,
}: AiEditPanelProps) {
  return (
    <section data-plume-feature="ai-edit-panel" data-ai-edit-state={state}>
      <PlumeHeading level={2}>AI edit</PlumeHeading>
      <PlumeText type="supporting">
        {selectedElementId
          ? `Editing selected element ${selectedElementId}.`
          : "Select an element before asking for an edit."}
      </PlumeText>
      {state === "error" ? (
        <PlumeBanner
          status="error"
          title="AI edit unavailable"
          description="The operation preview could not be generated. Try a more specific instruction."
        />
      ) : null}
      <PlumeTextArea
        label="Describe an edit"
        value={prompt}
        onChange={(nextPrompt) => onPromptChange?.(nextPrompt)}
        isDisabled={state === "generating" || state === "applying"}
      />
      <PlumeButton
        type="button"
        label={state === "generating" ? "Generating preview…" : "Generate preview"}
        variant="secondary"
        isDisabled={state === "generating" || state === "applying" || prompt.trim().length === 0}
        {...(onGenerate ? { onClick: () => onGenerate(prompt) } : {})}
      />
      {operation ? (
        <OperationPreview
          operation={operation}
          {...(onConfirmOperation ? { onConfirm: onConfirmOperation } : {})}
          {...(onApplyOperation ? { onApply: onApplyOperation } : {})}
          {...(onRejectOperation ? { onReject: onRejectOperation } : {})}
        />
      ) : null}
    </section>
  );
}
