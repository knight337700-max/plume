import type { ComponentProps } from "react";
/* eslint-disable no-restricted-imports -- Astryx data primitives are consumed through the adapter. */
import {
  AstryxList,
  AstryxMetadataList,
  AstryxTable,
  AstryxTreeList,
} from "../astryx/index.js";
/* eslint-enable no-restricted-imports */

export type PlumeTableSort = Record<
  string,
  "ascending" | "descending" | "none"
>;

export type PlumeTableProps = ComponentProps<typeof AstryxTable> & {
  sortState?: PlumeTableSort;
};

export function PlumeTable({ sortState, ...props }: PlumeTableProps) {
  const sortStateValue = sortState ? JSON.stringify(sortState) : undefined;

  return (
    <AstryxTable
      {...props}
      data-plume-component="table"
      {...(sortStateValue ? { "data-plume-sort-state": sortStateValue } : {})}
    />
  );
}

export type PlumeListProps = ComponentProps<typeof AstryxList>;

export function PlumeList(props: PlumeListProps) {
  return <AstryxList {...props} data-plume-component="list" />;
}

export type PlumeMetadataListProps = ComponentProps<typeof AstryxMetadataList>;

export function PlumeMetadataList(props: PlumeMetadataListProps) {
  return (
    <AstryxMetadataList {...props} data-plume-component="metadata-list" />
  );
}

export type PlumeTreeListProps = ComponentProps<typeof AstryxTreeList>;

export function PlumeTreeList(props: PlumeTreeListProps) {
  return <AstryxTreeList {...props} data-plume-component="tree-list" />;
}
