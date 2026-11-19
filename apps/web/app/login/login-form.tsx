"use client";

import { useActionState } from "react";
import { buttonClass } from "@/components/button-styles";
import { type LoginState, login } from "./actions";

export function LoginForm({ from }: { from?: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="mt-5">
      <input type="hidden" name="from" value={from ?? "/"} />
      <label htmlFor="password" className="text-[13px] font-medium">
        Password
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        aria-invalid={Boolean(state.error)}
        aria-describedby={state.error ? "password-error" : undefined}
        className="mt-1.5 block w-full rounded-md border border-rule bg-paper px-3 py-1.5 text-[14px] outline-none transition-colors focus:border-ink aria-[invalid=true]:border-red-600"
      />
      <p
        id="password-error"
        role="alert"
        className="mt-1.5 min-h-5 text-[13px] text-red-600 dark:text-red-400"
      >
        {state.error}
      </p>
      <button
        type="submit"
        disabled={pending}
        className={`${buttonClass("primary")} mt-2 h-9 w-full`}
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
