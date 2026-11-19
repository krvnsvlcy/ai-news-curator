import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getAuthConfig, SESSION_COOKIE } from "./config";
import { createSessionToken, verifySessionToken } from "./token";

/** True if the request carries a valid session. Memoized per request. */
export const isAuthenticated = cache(async (): Promise<boolean> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(getAuthConfig(), token);
});

/**
 * Call at the top of every protected page, route handler and server action.
 * Proxy only does an early redirect; this is the real check.
 */
export async function requireSession(): Promise<void> {
  if (!(await isAuthenticated())) redirect("/login");
}

export async function startSession(): Promise<void> {
  const { token, expiresAt } = await createSessionToken(getAuthConfig());
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

/** Only allow same-origin relative paths as post-login redirect targets. */
export function safeRedirectPath(from: unknown): string {
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return "/";
  if (from.includes("\\")) return "/";
  return from;
}
