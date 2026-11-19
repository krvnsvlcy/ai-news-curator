import { createHash, timingSafeEqual } from "node:crypto";

/** Constant-time comparison; hashing first makes lengths equal. */
export function passwordMatches(candidate: string, expected: string): boolean {
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
