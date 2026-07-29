import type { ComponentProps } from "react";
/* eslint-disable no-restricted-imports -- Astryx selection primitives are consumed through the adapter. */
import {
  AstryxMultiSelector,
  AstryxRadioList,
  AstryxSelectableCard,
  AstryxSelector,
  AstryxSlider,
  AstryxSwitch,
  AstryxTypeahead,
} from "../astryx/index.js";
/* eslint-enable no-restricted-imports */

export type PlumeSelectableCardProps = ComponentProps<typeof AstryxSelectableCard>;

export function PlumeSelectableCard({
  isSelected,
  ...props
}: PlumeSelectableCardProps) {
  return (
    <AstryxSelectableCard
      {...props}
      isSelected={isSelected}
      data-plume-component="selectable-card"
      data-plume-selected={String(isSelected)}
    />
  );
}

export type PlumeRadioListProps = ComponentProps<typeof AstryxRadioList>;

export function PlumeRadioList(props: PlumeRadioListProps) {
  return <AstryxRadioList {...props} data-plume-component="radio-list" />;
}

export type PlumeSelectorProps = ComponentProps<typeof AstryxSelector>;

export function PlumeSelector(props: PlumeSelectorProps) {
  return <AstryxSelector {...props} data-plume-component="selector" />;
}

export type PlumeMultiSelectorProps = ComponentProps<typeof AstryxMultiSelector>;

export function PlumeMultiSelector(props: PlumeMultiSelectorProps) {
  return (
    <AstryxMultiSelector {...props} data-plume-component="multi-selector" />
  );
}

export type PlumeSliderProps = ComponentProps<typeof AstryxSlider>;

export function PlumeSlider(props: PlumeSliderProps) {
  return <AstryxSlider {...props} data-plume-component="slider" />;
}

export type PlumeSwitchProps = ComponentProps<typeof AstryxSwitch>;

export function PlumeSwitch(props: PlumeSwitchProps) {
  return <AstryxSwitch {...props} data-plume-component="switch" />;
}

export type PlumeTypeaheadProps = ComponentProps<typeof AstryxTypeahead>;

export function PlumeTypeahead(props: PlumeTypeaheadProps) {
  return <AstryxTypeahead {...props} data-plume-component="typeahead" />;
}
