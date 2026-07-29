import type { ComponentProps } from "react";
/* eslint-disable no-restricted-imports -- Astryx primitives are consumed through the approved adapter. */
import {
  AstryxBadge,
  AstryxBanner,
  AstryxStatusDot,
} from "../astryx/index.js";
/* eslint-enable no-restricted-imports */

export type PlumeBadgeProps = ComponentProps<typeof AstryxBadge>;

export function PlumeBadge({ variant = "neutral", ...props }: PlumeBadgeProps) {
  return (
    <AstryxBadge
      {...props}
      variant={variant}
      data-plume-component="badge"
    />
  );
}

export type PlumeBannerProps = ComponentProps<typeof AstryxBanner>;

export function PlumeBanner(props: PlumeBannerProps) {
  return <AstryxBanner {...props} data-plume-component="banner" />;
}

export type PlumeStatusDotProps = ComponentProps<typeof AstryxStatusDot>;

export function PlumeStatusDot(props: PlumeStatusDotProps) {
  return <AstryxStatusDot {...props} data-plume-component="status-dot" />;
}
