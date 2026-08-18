import { OBJECT_RIGHT_FORMAT_PROFILE_ID, OBJECT_RIGHT_TEMPLATE_ID } from "@plume/renderer-vendor";

export const PLUME_KAKAO_BIZBOARD_FORMAT_PROFILE_ID = "kakao-moment-bizboard-1029x258" as const;

export interface CanonicalRendererFormatBinding {
  readonly plumeFormatProfileId: string;
  readonly rendererFormatProfileId: string;
  readonly rendererTemplateId: string;
  readonly layoutMode: "TEMPLATE_LOCKED";
}

export const OBJECT_RIGHT_FORMAT_BINDING: CanonicalRendererFormatBinding = Object.freeze({
  plumeFormatProfileId: PLUME_KAKAO_BIZBOARD_FORMAT_PROFILE_ID,
  rendererFormatProfileId: OBJECT_RIGHT_FORMAT_PROFILE_ID,
  rendererTemplateId: OBJECT_RIGHT_TEMPLATE_ID,
  layoutMode: "TEMPLATE_LOCKED",
});

const bindings = new Map<string, CanonicalRendererFormatBinding>([
  [OBJECT_RIGHT_FORMAT_BINDING.plumeFormatProfileId, OBJECT_RIGHT_FORMAT_BINDING],
]);

export class CanonicalRendererBindingError extends Error {
  public readonly code = "CANONICAL_RENDERER_FORMAT_BINDING_NOT_FOUND";

  public constructor() {
    super("No canonical Renderer binding exists for the requested Plume format profile");
    this.name = "CanonicalRendererBindingError";
  }
}

export function resolveCanonicalRendererBinding(
  plumeFormatProfileId: string,
): CanonicalRendererFormatBinding {
  const binding = bindings.get(plumeFormatProfileId);
  if (!binding) throw new CanonicalRendererBindingError();
  return binding;
}
