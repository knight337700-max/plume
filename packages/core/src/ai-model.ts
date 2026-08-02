export const DEFAULT_LLM_MODEL = "gpt-5.6-luna" as const;

export const SUPPORTED_LLM_MODELS = Object.freeze([DEFAULT_LLM_MODEL]);

export type LlmModel = (typeof SUPPORTED_LLM_MODELS)[number];

export function resolveLlmModel(value?: string): LlmModel {
  const model = value?.trim() || DEFAULT_LLM_MODEL;
  if (!SUPPORTED_LLM_MODELS.includes(model as LlmModel)) {
    throw new Error(`Unsupported OPENAI_MODEL: ${model}`);
  }
  return model as LlmModel;
}
