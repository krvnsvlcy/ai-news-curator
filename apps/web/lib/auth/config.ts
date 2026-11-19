export const SESSION_COOKIE = "curator_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export interface AuthConfig {
  password: string;
  secret: string;
}

/** Reads auth env vars. Throws so misconfiguration fails loudly instead of locking everyone out silently. */
export function getAuthConfig(): AuthConfig {
  const password = process.env.AUTH_PASSWORD;
  const secret = process.env.AUTH_SECRET;
  if (!password) throw new Error("AUTH_PASSWORD is not set");
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set to at least 32 characters");
  }
  return { password, secret };
}

/**
 * Optional hint shown on the login page (AUTH_PASSWORD_HINT). Anyone who can
 * open the login page can read it, so never put the password itself here.
 */
export function getPasswordHint(): string | undefined {
  const hint = process.env.AUTH_PASSWORD_HINT?.trim();
  return hint ? hint.slice(0, 200) : undefined;
}
