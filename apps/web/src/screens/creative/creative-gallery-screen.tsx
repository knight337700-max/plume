import {
  PlumeBanner,
  PlumeButton,
  PlumeEmptyState,
  PlumeHeading,
  PlumeText,
} from "@plume/ui";
import {
  CreativeResultCard,
  type CreativeResultCardProps,
  type CreativeStatus,
} from "../../features/creative/creative-result-card.js";

export type CreativeGalleryState = "loading" | "ready" | "empty" | "error";

export interface CreativeFilterOption {
  id: string;
  label: string;
}

export interface CreativeGalleryFilters {
  productId?: string;
  formatId?: string;
  status?: CreativeStatus | "all";
}

export interface CreativeGalleryScreenProps {
  creatives?: readonly CreativeResultCardProps[];
  products?: readonly CreativeFilterOption[];
  formats?: readonly CreativeFilterOption[];
  filters?: CreativeGalleryFilters;
  state?: CreativeGalleryState;
  onProductFilterChange?: (productId: string | undefined) => void;
  onFormatFilterChange?: (formatId: string | undefined) => void;
  onStatusFilterChange?: (status: CreativeStatus | "all") => void;
  onEdit?: (creativeId: string) => void;
  onValidate?: (creativeId: string) => void;
}

const statusOptions: readonly { id: CreativeStatus | "all"; label: string }[] = [
  { id: "all", label: "All statuses" },
  { id: "generating", label: "Generating" },
  { id: "ready", label: "Ready" },
  { id: "validation_failed", label: "Validation failed" },
  { id: "validated", label: "Validated" },
  { id: "approved", label: "Approved" },
  { id: "failed", label: "Generation failed" },
];

function isSelected(value: string | undefined, selected: string | undefined) {
  return (value ?? "all") === (selected ?? "all");
}

export function CreativeGalleryScreen({
  creatives = [],
  products = [],
  formats = [],
  filters = {},
  state = creatives.length === 0 ? "empty" : "ready",
  onProductFilterChange,
  onFormatFilterChange,
  onStatusFilterChange,
  onEdit,
  onValidate,
}: CreativeGalleryScreenProps) {
  const visibleCreatives = creatives.filter((creative) => {
    const productMatches = !filters.productId || creative.productId === filters.productId;
    const formatMatches = !filters.formatId || creative.formatId === filters.formatId;
    const statusMatches =
      !filters.status || filters.status === "all" || creative.status === filters.status;
    return productMatches && formatMatches && statusMatches;
  });

  const productOptions = products.length > 0
    ? products
    : [...new Map(creatives.map((creative) => [creative.productId, { id: creative.productId, label: creative.productName }])).values()];
  const formatOptions = formats.length > 0
    ? formats
    : [...new Map(creatives.map((creative) => [creative.formatId, { id: creative.formatId, label: creative.formatLabel }])).values()];

  return (
    <main data-screen-id="CREATIVE-01" data-screen-state={state}>
      <header>
        <PlumeHeading level={1}>Creative gallery</PlumeHeading>
        <PlumeText type="supporting">
          Review generated creatives and continue with editing or validation.
        </PlumeText>
      </header>
      {state === "loading" ? <PlumeText>Loading generated creatives…</PlumeText> : null}
      {state === "error" ? (
        <PlumeBanner
          status="error"
          title="Creatives unavailable"
          description="We could not load the generated creatives. Try again."
        />
      ) : null}
      <section aria-label="Creative filters" data-plume-region="creative-filters">
        <div data-filter-group="product">
          <PlumeText type="supporting">Product</PlumeText>
          <PlumeButton
            type="button"
            label="All products"
            variant={isSelected(undefined, filters.productId) ? "primary" : "ghost"}
            data-filter-value="all"
            {...(onProductFilterChange ? { onClick: () => onProductFilterChange(undefined) } : {})}
          />
          {productOptions.map((product) => (
            <PlumeButton
              key={product.id}
              type="button"
              label={product.label}
              variant={isSelected(product.id, filters.productId) ? "primary" : "ghost"}
              data-filter-value={product.id}
              {...(onProductFilterChange ? { onClick: () => onProductFilterChange(product.id) } : {})}
            />
          ))}
        </div>
        <div data-filter-group="format">
          <PlumeText type="supporting">Format</PlumeText>
          <PlumeButton
            type="button"
            label="All formats"
            variant={isSelected(undefined, filters.formatId) ? "primary" : "ghost"}
            data-filter-value="all"
            {...(onFormatFilterChange ? { onClick: () => onFormatFilterChange(undefined) } : {})}
          />
          {formatOptions.map((format) => (
            <PlumeButton
              key={format.id}
              type="button"
              label={format.label}
              variant={isSelected(format.id, filters.formatId) ? "primary" : "ghost"}
              data-filter-value={format.id}
              {...(onFormatFilterChange ? { onClick: () => onFormatFilterChange(format.id) } : {})}
            />
          ))}
        </div>
        <div data-filter-group="status">
          <PlumeText type="supporting">Status</PlumeText>
          {statusOptions.map((status) => (
            <PlumeButton
              key={status.id}
              type="button"
              label={status.label}
              variant={(filters.status ?? "all") === status.id ? "primary" : "ghost"}
              data-filter-value={status.id}
              {...(onStatusFilterChange ? { onClick: () => onStatusFilterChange(status.id) } : {})}
            />
          ))}
        </div>
      </section>
      {state === "empty" || (state === "ready" && visibleCreatives.length === 0) ? (
        <PlumeEmptyState
          title={state === "empty" ? "No generated creatives" : "No matching creatives"}
          description="Adjust the product, format, or status filters."
        />
      ) : null}
      {state === "ready" && visibleCreatives.length > 0 ? (
        <ul aria-label="Generated creatives" data-plume-region="creative-grid">
          {visibleCreatives.map((creative) => (
            <li key={creative.id}>
              <CreativeResultCard
                {...creative}
                {...(onEdit ? { onEdit: () => onEdit(creative.id) } : {})}
                {...(onValidate ? { onValidate: () => onValidate(creative.id) } : {})}
              />
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  );
}
