"use client";

import { useActionState } from "react";
import { editorialButton, editorialInput } from "@/components/editorial";
import { type LoginState, login } from "./actions";

export function LoginForm({ from, hint }: { from?: string; hint?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="mt-10 text-left">
      <input type="hidden" name="from" value={from ?? "/"} />
      <label htmlFor="password" className="block text-center text-[13px] text-muted">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        placeholder={hint}
        // biome-ignore lint/a11y/noAutofocus: the password is the page's only field
        autoFocus
        aria-invalid={Boolean(state.error)}
        aria-describedby={
          [state.error && "password-error", hint && "password-hint"].filter(Boolean).join(" ") ||
          undefined
        }
        className={`${editorialInput} mt-1 text-center`}
      />
      {/* Placeholders aren't reliably announced; keep the hint available to screen readers. */}
      {hint && (
        <p id="password-hint" className="sr-only">
          Hint: {hint}
        </p>
      )}
      <p
        id="password-error"
        role="alert"
        className="mt-2 min-h-5 text-center text-[13px] text-red-600"
      >
        {state.error}
      </p>
      <div className="mt-6 flex justify-center">
        <button type="submit" disabled={pending} className={editorialButton}>
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </form>
  );
}
