import { ProductMatchCard as DomainProductMatchCard, type ProductMatchCardProps } from "@plume/ui";

export type MatchingProductCardProps = ProductMatchCardProps & { readonly candidateId: string };

export function ProductMatchCard({ candidateId, ...props }: MatchingProductCardProps) {
  return <div data-matching-candidate-id={candidateId}><DomainProductMatchCard {...props} /></div>;
}
