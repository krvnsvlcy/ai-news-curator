"use client";

import { useActionState } from "react";
import { type LoginState, login } from "./actions";

export function LoginForm({ from }: { from?: string }) {
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
        aria-invalid={Boolean(state.error)}
        aria-describedby={state.error ? "password-error" : undefined}
        className="mt-1 block w-full border-0 border-b border-ink/30 bg-transparent px-0 py-2 text-center text-lg text-ink outline-none transition-colors focus:border-ink aria-[invalid=true]:border-red-600"
      />
      <p
        id="password-error"
        role="alert"
        className="mt-2 min-h-5 text-center text-[13px] text-red-600 dark:text-red-400"
      >
        {state.error}
      </p>
      <div className="mt-6 flex justify-center">
        <button
          type="submit"
          disabled={pending}
          className="rounded-full bg-ink px-6 py-2.5 text-sm font-medium text-paper transition-opacity hover:opacity-85 disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </div>
    </form>
  );
}
