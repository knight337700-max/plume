export interface DisabledBackgroundRemovalInput {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly mode: "AUTO" | "PRODUCT" | "PERSON";
}

export class DisabledBackgroundRemovalProvider {
  public async remove(_input: DisabledBackgroundRemovalInput): Promise<never> {
    const error = new Error("Background removal provider is disabled in MVP");
    Object.assign(error, { code: "BACKGROUND_REMOVAL_DISABLED", statusCode: 422 });
    throw error;
  }
}
