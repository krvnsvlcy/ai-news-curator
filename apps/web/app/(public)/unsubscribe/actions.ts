"use server";

import { recordUnsubscribe } from "@curator/db";
import { getTracker } from "@/lib/tracking";

/**
 * Public (no session): readers call this from the unsubscribe page after
 * confirming. The signed token is the only input; it carries an anonymous
 * recipient id, so no address reaches the server.
 */
export async function recordUnsubscribeAction(token: string): Promise<void> {
  if (typeof token !== "string") return;
  const payload = getTracker().verifyToken(token, "unsubscribe");
  if (!payload) return;
  try {
    await recordUnsubscribe({
      letterId: payload.letterId,
      recipient: payload.recipient,
      test: payload.test,
    });
  } catch (err) {
    console.error("[tracking] failed to record unsubscribe", err);
  }
}
