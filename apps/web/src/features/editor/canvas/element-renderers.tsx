import type { CSSProperties, KeyboardEvent, ReactNode } from "react";

export interface SceneBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface SceneElementBase {
  readonly id: string;
  readonly bounds: SceneBounds;
  readonly opacity?: number;
  readonly rotation?: number;
}

export type SceneElement =
  | (SceneElementBase & {
      readonly type: "image";
      readonly src: string;
      readonly alt: string;
    })
  | (SceneElementBase & {
      readonly type: "text";
      readonly text: string;
      readonly fontSize?: number;
      readonly color?: string;
    })
  | (SceneElementBase & {
      readonly type: "logo";
      readonly src: string;
      readonly alt: string;
    })
  | (SceneElementBase & {
      readonly type: "shape";
      readonly shape: "rectangle" | "circle" | "line";
      readonly fill: string;
    });

export interface SceneElementRendererProps {
  element: SceneElement;
  isSelected: boolean;
  onSelect: (elementId: string) => void;
}

export function sceneBoundsStyle(
  bounds: SceneBounds,
  rotation = 0,
  opacity = 1,
): CSSProperties {
  return {
    position: "absolute",
    left: bounds.x,
    top: bounds.y,
    width: bounds.width,
    height: bounds.height,
    opacity,
    transform: rotation === 0 ? undefined : `rotate(${rotation}deg)`,
    transformOrigin: "center",
  };
}

function renderElementContent(element: SceneElement): ReactNode {
  if (element.type === "image") {
    return (
      <img
        src={element.src}
        alt={element.alt}
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }

  if (element.type === "logo") {
    return (
      <img
        src={element.src}
        alt={element.alt}
        draggable={false}
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    );
  }

  if (element.type === "text") {
    return (
      <span
        style={{
          display: "block",
          color: element.color ?? "inherit",
          fontSize: element.fontSize,
          whiteSpace: "pre-wrap",
        }}
      >
        {element.text}
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        backgroundColor: element.fill,
        borderRadius: element.shape === "circle" ? "50%" : undefined,
      }}
    />
  );
}

export function SceneElementRenderer({
  element,
  isSelected,
  onSelect,
}: SceneElementRendererProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(element.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${element.type} ${element.id}`}
      aria-pressed={isSelected}
      data-scene-element-id={element.id}
      data-scene-element-type={element.type}
      data-scene-selected={String(isSelected)}
      style={sceneBoundsStyle(element.bounds, element.rotation, element.opacity)}
      onClick={() => onSelect(element.id)}
      onKeyDown={handleKeyDown}
    >
      {renderElementContent(element)}
    </div>
  );
}
