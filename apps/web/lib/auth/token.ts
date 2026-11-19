// Session tokens: "v1.<expiresAtSeconds>.<base64url HMAC-SHA256>".
// Uses Web Crypto only, so it runs in both Proxy and server code.
import { type AuthConfig, SESSION_TTL_SECONDS } from "./config";

const VERSION = "v1";
const encoder = new TextEncoder();

// The key covers the password as well as the secret, so rotating
// AUTH_PASSWORD invalidates every existing session.
async function hmacKey({ secret, password }: AuthConfig): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", encoder.encode(`${secret}\0${password}`));
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

function toBase64Url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64url");
}

export async function createSessionToken(
  config: AuthConfig,
  now = Date.now(),
): Promise<{ token: string; expiresAt: Date }> {
  const exp = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = `${VERSION}.${exp}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(config), encoder.encode(payload));
  return { token: `${payload}.${toBase64Url(sig)}`, expiresAt: new Date(exp * 1000) };
}

export async function verifySessionToken(
  config: AuthConfig,
  token: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return false;
  const [version, expRaw, sigRaw] = parts as [string, string, string];

  const exp = Number(expRaw);
  if (!Number.isInteger(exp) || exp * 1000 <= now) return false;

  // Buffer's base64url decoder ignores invalid characters rather than throwing;
  // a malformed signature simply fails verification.
  const sig: Uint8Array<ArrayBuffer> = new Uint8Array(Buffer.from(sigRaw, "base64url"));
  // subtle.verify compares in constant time.
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(config),
    sig,
    encoder.encode(`${version}.${expRaw}`),
  );
}
