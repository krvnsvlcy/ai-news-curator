import { Tracker } from "@curator/tracking";

let tracker: Tracker | undefined;

/** Signs email tracking links. Uses TRACKING_SECRET, falling back to AUTH_SECRET. */
export function getTracker(): Tracker {
  const secret = process.env.TRACKING_SECRET || process.env.AUTH_SECRET;
  if (!secret)
    throw new Error("TRACKING_SECRET (or AUTH_SECRET) must be set to send tracked email");
  tracker ??= new Tracker(secret);
  return tracker;
}
