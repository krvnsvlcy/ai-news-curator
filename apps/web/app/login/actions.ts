"use server";

import { redirect } from "next/navigation";
import { getAuthConfig } from "@/lib/auth/config";
import { passwordMatches } from "@/lib/auth/password";
import { endSession, safeRedirectPath, startSession } from "@/lib/auth/session";

export interface LoginState {
  error?: string;
}

const FAILURE_DELAY_MS = 750;

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const password = formData.get("password");
  if (typeof password !== "string" || password.length === 0) {
    return { error: "Enter the password." };
  }

  if (!passwordMatches(password, getAuthConfig().password)) {
    // Slow down guessing. Not a substitute for rate limiting at the edge.
    await new Promise((r) => setTimeout(r, FAILURE_DELAY_MS));
    return { error: "Incorrect password." };
  }

  await startSession();
  redirect(safeRedirectPath(formData.get("from")));
}

export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}
