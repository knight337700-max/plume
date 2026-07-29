import {
  LayerProvider,
  type LayerProviderProps,
} from "@astryxdesign/core";

export type AstryxProviderProps = LayerProviderProps;

export function AstryxProvider(props: AstryxProviderProps) {
  return <LayerProvider {...props} />;
}
