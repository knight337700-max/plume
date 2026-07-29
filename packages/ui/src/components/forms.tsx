import type { ComponentProps } from "react";
/* eslint-disable no-restricted-imports -- Astryx form primitives are consumed through the adapter. */
import {
  AstryxCheckboxInput,
  AstryxFileInput,
  AstryxTextArea,
  AstryxTextInput,
} from "../astryx/index.js";
/* eslint-enable no-restricted-imports */

type FieldError = {
  error?: string;
};

export type PlumeTextInputProps = ComponentProps<typeof AstryxTextInput> &
  FieldError;

export function PlumeTextInput({ error, status, ...props }: PlumeTextInputProps) {
  const resolvedStatus = error
    ? { type: "error" as const, message: error }
    : status;

  return (
    <AstryxTextInput
      {...props}
      {...(resolvedStatus ? { status: resolvedStatus } : {})}
      data-plume-component="text-input"
    />
  );
}

export type PlumeTextAreaProps = ComponentProps<typeof AstryxTextArea> & FieldError;

export function PlumeTextArea({ error, status, ...props }: PlumeTextAreaProps) {
  const resolvedStatus = error
    ? { type: "error" as const, message: error }
    : status;

  return (
    <AstryxTextArea
      {...props}
      {...(resolvedStatus ? { status: resolvedStatus } : {})}
      data-plume-component="text-area"
    />
  );
}

export type PlumeFileInputProps = ComponentProps<typeof AstryxFileInput> &
  FieldError;

export function PlumeFileInput({ error, status, ...props }: PlumeFileInputProps) {
  const resolvedStatus = error
    ? { type: "error" as const, message: error }
    : status;

  return (
    <AstryxFileInput
      {...props}
      {...(resolvedStatus ? { status: resolvedStatus } : {})}
      data-plume-component="file-input"
    />
  );
}

export type PlumeCheckboxProps = ComponentProps<typeof AstryxCheckboxInput> &
  FieldError;

export function PlumeCheckbox({ error, status, ...props }: PlumeCheckboxProps) {
  const resolvedStatus = error
    ? { type: "error" as const, message: error }
    : status;

  return (
    <AstryxCheckboxInput
      {...props}
      {...(resolvedStatus ? { status: resolvedStatus } : {})}
      data-plume-component="checkbox"
    />
  );
}
