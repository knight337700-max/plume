import type { ComponentProps } from "react";
/* eslint-disable no-restricted-imports -- Astryx primitives are consumed through the approved adapter. */
import {
  AstryxHeading,
  AstryxText,
} from "../astryx/index.js";
/* eslint-enable no-restricted-imports */

export type PlumeTextProps = ComponentProps<typeof AstryxText>;

export function PlumeText({ type = "body", ...props }: PlumeTextProps) {
  return (
    <AstryxText
      {...props}
      type={type}
      data-plume-component="text"
    />
  );
}

export type PlumeHeadingProps = ComponentProps<typeof AstryxHeading>;

export function PlumeHeading({
  color = "primary",
  ...props
}: PlumeHeadingProps) {
  return (
    <AstryxHeading
      {...props}
      color={color}
      data-plume-component="heading"
    />
  );
}
