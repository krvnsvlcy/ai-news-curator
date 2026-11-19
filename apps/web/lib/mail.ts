import { getMailerConfig, Mailer } from "@curator/mailer";
import { headers } from "next/headers";

let cached: { key: string; mailer: Mailer } | undefined;

/** Null when SMTP_URL / SMTP_FROM aren't set. */
export function getMailer(): Mailer | null {
  const config = getMailerConfig();
  if (!config) return null;
  const key = `${config.url}|${config.from}`;
  if (cached?.key !== key) cached = { key, mailer: Mailer.fromConfig(config) };
  return cached.mailer;
}

/** Base URL for links in emails: APP_URL if set, otherwise the current request's origin. */
export async function appOrigin(): Promise<string> {
  const fromEnv = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
