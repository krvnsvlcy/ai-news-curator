// Client-safe subscriber helpers. Subscribers themselves live in the database
// (@curator/db, owned per browser: see lib/owner.ts); nothing here stores them.

/** A subscriber as sent to the browser (dates as ISO strings). */
export interface Subscriber {
  id: string;
  email: string;
  subscribedAt: string;
}

export const EMAIL_RE = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

/** Splits pasted text (commas, spaces, semicolons or new lines) into address tokens. */
export function splitEmailList(text: string): string[] {
  return text
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^<|>$/g, ""))
    .filter(Boolean);
}

// --- Legacy: the list used to live in localStorage. Read once to move it to
// the database, then removed.
const LEGACY_KEY = "curator:subscribers:v1";

/** Shape of the old localStorage list (only the fields still used, plus status). */
export interface LegacySubscriber {
  email: string;
  status: "active" | "unsubscribed";
  subscribedAt: string;
}

export function readLegacySubscribers(): LegacySubscriber[] {
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is LegacySubscriber =>
        !!s &&
        typeof s.email === "string" &&
        (s.status === "active" || s.status === "unsubscribed") &&
        typeof s.subscribedAt === "string",
    );
  } catch {
    return [];
  }
}

export function clearLegacySubscribers() {
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // nothing to clear
  }
}

// Remembered address for "Send test" (per-browser convenience).
const TEST_KEY = "curator:test-email";
export function readTestEmail(): string {
  try {
    return window.localStorage.getItem(TEST_KEY) ?? "";
  } catch {
    return "";
  }
}
export function rememberTestEmail(email: string) {
  try {
    window.localStorage.setItem(TEST_KEY, email);
  } catch {
    // not important
  }
}
