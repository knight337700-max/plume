import { PlumeBadge, PlumeButton, PlumeHeading, PlumeText } from "@plume/ui";

export interface CreativeListItem {
  readonly id: string;
  readonly label: string;
  readonly status?: string;
}

export interface CreativeListPanelProps {
  items?: readonly CreativeListItem[];
  selectedId?: string;
  onSelect?: (creativeId: string) => void;
}

export function CreativeListPanel({
  items = [],
  selectedId,
  onSelect,
}: CreativeListPanelProps) {
  return (
    <section data-plume-feature="creative-list-panel" aria-label="Creatives">
      <PlumeHeading level={2}>Creatives</PlumeHeading>
      {items.length === 0 ? (
        <PlumeText type="supporting">No creatives in this document.</PlumeText>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id} data-creative-list-id={item.id}>
              <PlumeButton
                type="button"
                label={item.label}
                variant={item.id === selectedId ? "primary" : "ghost"}
                aria-current={item.id === selectedId ? "page" : undefined}
                {...(onSelect ? { onClick: () => onSelect(item.id) } : {})}
              />
              {item.status ? <PlumeBadge label={item.status} variant="neutral" /> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
