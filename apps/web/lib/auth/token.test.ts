import { describe, expect, it } from "vitest";
import { SESSION_TTL_SECONDS } from "./config";
import { createSessionToken, verifySessionToken } from "./token";

const config = { password: "hunter2", secret: "x".repeat(32) };
const now = Date.UTC(2026, 10, 19);

describe("session tokens", () => {
  it("accepts a freshly issued token", async () => {
    const { token } = await createSessionToken(config, now);
    expect(await verifySessionToken(config, token, now)).toBe(true);
  });

  it("rejects expired tokens", async () => {
    const { token } = await createSessionToken(config, now);
    const later = now + (SESSION_TTL_SECONDS + 1) * 1000;
    expect(await verifySessionToken(config, token, later)).toBe(false);
  });

  it("rejects a token with a tampered expiry", async () => {
    const { token } = await createSessionToken(config, now);
    const [v, exp, sig] = token.split(".");
    const forged = `${v}.${Number(exp) + 999999}.${sig}`;
    expect(await verifySessionToken(config, forged, now)).toBe(false);
  });

  it("invalidates sessions when the password changes", async () => {
    const { token } = await createSessionToken(config, now);
    expect(await verifySessionToken({ ...config, password: "new" }, token, now)).toBe(false);
  });

  it("rejects garbage", async () => {
    for (const t of [undefined, "", "abc", "v1.1.", "v2.9999999999.AAAA"]) {
      expect(await verifySessionToken(config, t, now)).toBe(false);
    }
  });
});
