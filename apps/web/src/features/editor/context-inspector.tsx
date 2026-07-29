import { PlumeBadge, PlumeEmptyState, PlumeHeading, PlumeText } from "@plume/ui";
import type { SceneElement } from "./canvas/element-renderers.js";

export interface ContextInspectorProps {
  element?: SceneElement;
}

function elementSummary(element: SceneElement) {
  if (element.type === "text") return element.text;
  if (element.type === "shape") return element.shape;
  return element.alt;
}

export function ContextInspector({ element }: ContextInspectorProps) {
  return (
    <section
      data-plume-feature="context-inspector"
      data-context-element-id={element?.id}
      aria-label="Context inspector"
    >
      <PlumeHeading level={2}>Inspector</PlumeHeading>
      {element ? (
        <>
          <PlumeBadge label={element.type} variant="info" />
          <PlumeText>Element: {element.id}</PlumeText>
          <PlumeText type="supporting">{elementSummary(element)}</PlumeText>
          <PlumeText type="supporting">
            Position {element.bounds.x},{element.bounds.y} · {element.bounds.width}×{element.bounds.height}
          </PlumeText>
        </>
      ) : (
        <PlumeEmptyState
          title="No element selected"
          description="Select an element on the canvas to inspect its properties."
        />
      )}
    </section>
  );
}
