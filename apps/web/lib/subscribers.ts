// Demo subscriber list, kept ONLY in this browser's localStorage so testers can
// send real email without reaching anyone they didn't add themselves. Nothing
// here is sent to the server except at send time (addresses only, not stored).
import { useSyncExternalStore } from "react";

export type SubscriberStatus = "active" | "unsubscribed";

export interface Subscriber {
  id: string;
  email: string;
  name?: string;
  status: SubscriberStatus;
  source: "dashboard" | "signup";
  subscribedAt: string;
  unsubscribedAt?: string;
}

const KEY = "curator:subscribers:v1";
const CHANGE_EVENT = "curator:subscribers-changed";
const EMPTY: Subscriber[] = [];

export const EMAIL_RE = /^[^\s@<>(),;:"[\]]+@[^\s@<>(),;:"[\]]+\.[^\s@<>(),;:"[\]]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return email.length <= 254 && EMAIL_RE.test(email);
}

function isSubscriber(v: unknown): v is Subscriber {
  const s = v as Subscriber;
  return (
    !!s &&
    typeof s.id === "string" &&
    typeof s.email === "string" &&
    (s.status === "active" || s.status === "unsubscribed") &&
    typeof s.subscribedAt === "string"
  );
}

let cachedRaw: string | null | undefined;
let cachedList: Subscriber[] = EMPTY;

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null; // storage blocked (private mode, disabled site data…)
  }
}

export function readSubscribers(): Subscriber[] {
  const raw = readRaw();
  if (raw === cachedRaw) return cachedList;
  cachedRaw = raw;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    cachedList = Array.isArray(parsed) ? parsed.filter(isSubscriber) : EMPTY;
  } catch {
    cachedList = EMPTY;
  }
  return cachedList;
}

/** Returns false if the browser refused to store the list. */
function writeSubscribers(list: Subscriber[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    return false;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

export function storageAvailable(): boolean {
  try {
    const k = `${KEY}:probe`;
    window.localStorage.setItem(k, "1");
    window.localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => e.key === KEY && onChange(); // other tabs
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

const noop = () => () => {};

/** Live subscriber list; `ready` is false during server render and hydration. */
export function useSubscribers(): { subscribers: Subscriber[]; ready: boolean } {
  const subscribers = useSyncExternalStore(subscribe, readSubscribers, () => EMPTY);
  const ready = useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
  return { subscribers, ready };
}

export type AddOutcome = "added" | "reactivated" | "exists" | "invalid" | "storage-error";

export function addSubscriber(
  rawEmail: string,
  opts: { name?: string; source: Subscriber["source"] },
): AddOutcome {
  const email = normalizeEmail(rawEmail);
  if (!isValidEmail(email)) return "invalid";
  const list = readSubscribers();
  const existing = list.find((s) => s.email === email);
  if (existing?.status === "active") return "exists";
  const now = new Date().toISOString();
  const name = opts.name?.trim() || undefined;
  const next = existing
    ? list.map((s) =>
        s.id === existing.id
          ? {
              ...s,
              status: "active" as const,
              subscribedAt: now,
              unsubscribedAt: undefined,
              ...(name ? { name } : {}),
            }
          : s,
      )
    : [
        ...list,
        {
          id: crypto.randomUUID(),
          email,
          ...(name ? { name } : {}),
          status: "active" as const,
          source: opts.source,
          subscribedAt: now,
        },
      ];
  if (!writeSubscribers(next)) return "storage-error";
  return existing ? "reactivated" : "added";
}

/** Adds every address found in pasted text (commas, spaces or new lines). */
export function addManySubscribers(text: string): {
  added: number;
  skipped: number;
  invalid: string[];
} {
  const tokens = text
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^<|>$/g, ""))
    .filter(Boolean);
  const result = { added: 0, skipped: 0, invalid: [] as string[] };
  for (const t of tokens) {
    const outcome = addSubscriber(t, { source: "dashboard" });
    if (outcome === "added" || outcome === "reactivated") result.added++;
    else if (outcome === "invalid") result.invalid.push(t);
    else result.skipped++;
  }
  return result;
}

export function setSubscriberStatus(id: string, status: SubscriberStatus): boolean {
  const now = new Date().toISOString();
  return writeSubscribers(
    readSubscribers().map((s) =>
      s.id === id
        ? status === "active"
          ? { ...s, status, unsubscribedAt: undefined }
          : { ...s, status, unsubscribedAt: now }
        : s,
    ),
  );
}

export function removeSubscriber(id: string): boolean {
  return writeSubscribers(readSubscribers().filter((s) => s.id !== id));
}

export function clearSubscribers(): boolean {
  return writeSubscribers([]);
}

export function unsubscribeEmail(
  rawEmail: string,
): "unsubscribed" | "already" | "not-found" | "storage-error" {
  const email = normalizeEmail(rawEmail);
  const s = readSubscribers().find((x) => x.email === email);
  if (!s) return "not-found";
  if (s.status === "unsubscribed") return "already";
  return setSubscriberStatus(s.id, "unsubscribed") ? "unsubscribed" : "storage-error";
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
