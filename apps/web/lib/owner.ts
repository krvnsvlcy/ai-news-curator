// Which subscribers belong to "you". There are no user accounts (one shared
// password), so ownership is per browser: an opaque random id in a long-lived
// cookie, issued by the proxy on the first request. It survives sign-out, so a
// browser keeps its list. Safe for the proxy (edge) and server code alike.

export const OWNER_COOKIE = "curator_owner";
/** Browsers cap cookie lifetime at 400 days; it's refreshed on every visit. */
export const OWNER_COOKIE_MAX_AGE = 60 * 60 * 24 * 400;

const OWNER_RE = /^[A-Za-z0-9_-]{22}$/;

export function isValidOwnerId(v: string | undefined): v is string {
  return !!v && OWNER_RE.test(v);
}

/** 128 random bits, base64url (22 chars). */
export function newOwnerId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function ownerCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: OWNER_COOKIE_MAX_AGE,
  };
}
