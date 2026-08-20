import type { ContractBundle } from "./contracts.js";
import { createIssue, sortAndDedupeIssues } from "./errors.js";
import type { CanonicalInput, KakaoBizboardInputV1, ValidationIssue } from "./types.js";

const forbiddenControl = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/u;
const variationSelector = /[\uFE00-\uFE0F\u{E0100}-\u{E01EF}]/u;
const emojiOrPictograph = /[\p{Emoji_Presentation}\p{Extended_Pictographic}\u2700-\u27BF]/u;
const forbiddenEmoticons = ["^^", ":D", ":-)", "☞", "☑", "♨"];

export function validateRawText(
  input: KakaoBizboardInputV1,
  contracts: ContractBundle,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const fields: Array<[string, string]> = [
    ["/advertiser/text", input.advertiser.text],
    ["/copy/headline", input.copy.headline],
    ["/copy/subcopy", input.copy.subcopy],
  ];
  if (input.cta.label !== null && input.cta.label !== undefined) fields.push(["/cta/label", input.cta.label]);

  for (const [pointer, value] of fields) {
    if (forbiddenControl.test(value)) {
      issues.push(createIssue(contracts.errorRegistry, "KBR-TEXT-002", pointer));
    }
    if (
      variationSelector.test(value) ||
      emojiOrPictograph.test(value) ||
      forbiddenEmoticons.some((pattern) => value.includes(pattern))
    ) {
      issues.push(createIssue(contracts.errorRegistry, "KBR-TEXT-001", pointer));
    }
  }
  return sortAndDedupeIssues(issues);
}

export function validateCanonicalSemantics(
  input: CanonicalInput,
  contracts: ContractBundle,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const requiredStrings: Array<[string, string]> = [
    ["/advertiser/text", input.advertiser.text],
    ["/copy/headline", input.copy.headline],
    ["/copy/subcopy", input.copy.subcopy],
    ["/assets/product/path", input.assets.product.path],
    ["/output/directory", input.output.directory],
    ["/output/baseName", input.output.baseName],
  ];
  for (const [pointer, value] of requiredStrings) {
    if (value.length === 0) issues.push(createIssue(contracts.errorRegistry, "KBR-INPUT-007", pointer));
  }

  const normalizedHeadline = input.copy.headline.toLocaleLowerCase("ko-KR");
  const normalizedSubcopy = input.copy.subcopy.toLocaleLowerCase("ko-KR");
  if (normalizedHeadline === normalizedSubcopy) {
    issues.push(createIssue(contracts.errorRegistry, "KBR-TEXT-003", "/copy"));
  }

  const advertiser = input.advertiser.text.toLocaleLowerCase("ko-KR");
  const inHeadline = normalizedHeadline.includes(advertiser);
  const inSubcopy = normalizedSubcopy.includes(advertiser);
  if (!inHeadline && !inSubcopy) {
    issues.push(createIssue(contracts.errorRegistry, "KBR-TEXT-007", "/advertiser/text"));
  } else if (inHeadline && inSubcopy) {
    issues.push(createIssue(contracts.errorRegistry, "KBR-TEXT-010", "/advertiser/text"));
  }

  const ctaMode = contracts.ctaRegistry.modes.find(({ id }) => id === input.cta.mode);
  if (!ctaMode) {
    issues.push(createIssue(contracts.errorRegistry, "KBR-CTA-001", "/cta/mode"));
  } else if (!ctaMode.enabled) {
    issues.push(createIssue(contracts.errorRegistry, contracts.ctaRegistry.disabledModeErrorCode, "/cta/mode"));
  } else {
    if (!ctaMode.allowedLandingTypes.includes(input.cta.landingType)) {
      issues.push(createIssue(contracts.errorRegistry, "KBR-CTA-004", "/cta/landingType"));
    }
    if (!ctaMode.allowedLabels.includes(input.cta.label)) {
      issues.push(createIssue(contracts.errorRegistry, "KBR-CTA-002", "/cta/label"));
    }
  }

  return sortAndDedupeIssues(issues);
}
