import { cookies } from "next/headers";
import { isValidOwnerId, newOwnerId, OWNER_COOKIE, ownerCookieOptions } from "./owner";

/** This browser's owner id, or null if it has none yet (pages can't set cookies). */
export async function currentOwnerId(): Promise<string | null> {
  const v = (await cookies()).get(OWNER_COOKIE)?.value;
  return isValidOwnerId(v) ? v : null;
}

/** For server actions: returns this browser's owner id, issuing one if missing. */
export async function ensureOwnerId(): Promise<string> {
  const existing = await currentOwnerId();
  if (existing) return existing;
  const id = newOwnerId();
  (await cookies()).set(OWNER_COOKIE, id, ownerCookieOptions());
  return id;
}
