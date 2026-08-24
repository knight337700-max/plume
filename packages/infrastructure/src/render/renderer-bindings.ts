import {
  OBJECT_RIGHT_FORMAT_PROFILE_ID,
  OBJECT_RIGHT_TEMPLATE_ID,
  THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID,
  THUMBNAIL_BOX_RIGHT_TEMPLATE_ID,
} from "@plume/renderer-vendor";

export const PLUME_KAKAO_BIZBOARD_FORMAT_PROFILE_ID = "kakao-moment-bizboard-1029x258" as const;
export const PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID =
  "kakao-moment-bizboard-thumbnail-box-right-1029x258" as const;
export const PLUME_KAKAO_MOMENT_DISPLAY_NATIVE_2_1_FORMAT_PROFILE_ID =
  "kakao-moment-display-native-2-1-1200x600" as const;

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

export const THUMBNAIL_BOX_RIGHT_FORMAT_BINDING: CanonicalRendererFormatBinding = Object.freeze({
  plumeFormatProfileId: PLUME_KAKAO_MOMENT_THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID,
  rendererFormatProfileId: THUMBNAIL_BOX_RIGHT_FORMAT_PROFILE_ID,
  rendererTemplateId: THUMBNAIL_BOX_RIGHT_TEMPLATE_ID,
  layoutMode: "TEMPLATE_LOCKED",
});

export interface CanonicalFreeformRendererFormatBinding {
  readonly plumeFormatProfileId: string;
  readonly rendererFormatProfileId: string;
  readonly rendererTemplateId: null;
  readonly layoutMode: "FREEFORM";
}

export type CanonicalRendererBinding =
  | CanonicalRendererFormatBinding
  | CanonicalFreeformRendererFormatBinding;

export const KAKAO_DISPLAY_NATIVE_2_1_FREEFORM_BINDING: CanonicalFreeformRendererFormatBinding =
  Object.freeze({
    plumeFormatProfileId: PLUME_KAKAO_MOMENT_DISPLAY_NATIVE_2_1_FORMAT_PROFILE_ID,
    rendererFormatProfileId: "KAKAO_DISPLAY_NATIVE_2_1",
    rendererTemplateId: null,
    layoutMode: "FREEFORM",
  });

const bindings = new Map<string, CanonicalRendererBinding>([
  [OBJECT_RIGHT_FORMAT_BINDING.plumeFormatProfileId, OBJECT_RIGHT_FORMAT_BINDING],
  [THUMBNAIL_BOX_RIGHT_FORMAT_BINDING.plumeFormatProfileId, THUMBNAIL_BOX_RIGHT_FORMAT_BINDING],
  [
    KAKAO_DISPLAY_NATIVE_2_1_FREEFORM_BINDING.plumeFormatProfileId,
    KAKAO_DISPLAY_NATIVE_2_1_FREEFORM_BINDING,
  ],
]);

export class CanonicalRendererBindingError extends Error {
  public readonly code = "CANONICAL_RENDERER_FORMAT_BINDING_NOT_FOUND";

  public constructor() {
    super("No canonical Renderer binding exists for the requested Plume format profile");
    this.name = "CanonicalRendererBindingError";
  }
}

export function resolveCanonicalRendererBinding(
  plumeFormatProfileId: typeof PLUME_KAKAO_MOMENT_DISPLAY_NATIVE_2_1_FORMAT_PROFILE_ID,
): CanonicalFreeformRendererFormatBinding;
export function resolveCanonicalRendererBinding(
  plumeFormatProfileId: string,
): CanonicalRendererBinding;
export function resolveCanonicalRendererBinding(
  plumeFormatProfileId: string,
): CanonicalRendererBinding {
  const binding = bindings.get(plumeFormatProfileId);
  if (!binding) throw new CanonicalRendererBindingError();
  return binding;
}
