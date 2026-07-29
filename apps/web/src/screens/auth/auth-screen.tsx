import { useState, type FormEvent } from "react";
import {
  PlumeBanner,
  PlumeButton,
  PlumeHeading,
  PlumeSkeleton,
  PlumeText,
  PlumeTextInput,
} from "@plume/ui";

export type AuthScreenState = "idle" | "loading" | "submitting" | "expired" | "error" | "locked";

export interface AuthScreenProps {
  state?: AuthScreenState;
  initialEmail?: string;
  errorMessage?: string;
  onSubmit?: (input: { email: string; password: string }) => void | Promise<void>;
  onRetry?: () => void;
}

export function AuthScreen({
  state = "idle",
  initialEmail = "",
  errorMessage,
  onSubmit,
  onRetry,
}: AuthScreenProps) {
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const busy = state === "loading" || state === "submitting";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit?.({ email, password });
  }

  return (
    <main data-screen-id="AUTH-01" data-screen-state={state} aria-busy={busy}>
      <section aria-labelledby="auth-heading">
        <PlumeHeading level={1}>Sign in to Plume</PlumeHeading>
        <PlumeText type="supporting">Continue to your creative workspace.</PlumeText>
        {state === "expired" ? (
          <PlumeBanner status="warning" title="Session expired" description="Sign in again to continue." />
        ) : null}
        {state === "error" ? (
          <PlumeBanner status="error" title="Unable to sign in" description={errorMessage ?? "Check your details and try again."} />
        ) : null}
        {state === "locked" ? (
          <PlumeBanner status="error" title="Account temporarily locked" description={errorMessage ?? "Try again later or contact an administrator."} />
        ) : null}
        {state === "loading" ? (
          <PlumeSkeleton aria-label="Loading session" />
        ) : (
          <form onSubmit={submit} noValidate>
            <PlumeTextInput
              label="Email"
              type="email"
              htmlName="email"
              value={email}
              onChange={setEmail}
              isRequired
              hasAutoFocus
              isDisabled={busy || state === "locked"}
            />
            <PlumeTextInput
              label="Password"
              type="password"
              htmlName="password"
              value={password}
              onChange={setPassword}
              isRequired
              isDisabled={busy || state === "locked"}
            />
            <PlumeButton
              type="submit"
              label={state === "submitting" ? "Signing in" : "Sign in"}
              variant="primary"
              isLoading={state === "submitting"}
              isDisabled={busy || state === "locked"}
            />
            {state === "error" && onRetry ? (
              <PlumeButton type="button" label="Retry" variant="ghost" onClick={onRetry} />
            ) : null}
          </form>
        )}
      </section>
    </main>
  );
}
