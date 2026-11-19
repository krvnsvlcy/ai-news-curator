import { createHmac, timingSafeEqual } from "node:crypto";

// Signed, opaque tokens for links in sent emails. They identify a letter, a
// story (for clicks) and an anonymous recipient id. No email address appears in
// a token or anywhere server-side; the recipient id is a keyed hash, so it
// can't be reversed or brute-forced without the secret.

export type TokenKind = "click" | "unsubscribe";

export interface TrackingPayload {
  kind: TokenKind;
  letterId: string;
  /** Story id for clicks; empty for unsubscribes. */
  storyId: string;
  recipient: string;
  /** True for test sends, which are excluded from analytics. */
  test: boolean;
}

const KIND_CODE: Record<TokenKind, string> = { click: "c", unsubscribe: "u" };
const CODE_KIND: Record<string, TokenKind> = { c: "click", u: "unsubscribe" };

export class Tracker {
  private readonly key: Buffer;

  constructor(secret: string) {
    if (secret.length < 32) throw new Error("Tracking secret must be at least 32 characters");
    // Derived so the tracking key differs from any key the secret is also used for.
    this.key = createHmac("sha256", secret).update("curator-tracking-v1").digest();
  }

  /** Anonymous, stable id for an address (same reader → same id across letters). */
  recipientId(email: string): string {
    return createHmac("sha256", this.key)
      .update(`recipient:${email.trim().toLowerCase()}`)
      .digest()
      .subarray(0, 16)
      .toString("base64url");
  }

  private sign(data: string): string {
    return createHmac("sha256", this.key)
      .update(data)
      .digest()
      .subarray(0, 16)
      .toString("base64url");
  }

  createToken(p: TrackingPayload): string {
    if (p.storyId.includes("|") || p.letterId.includes("|")) throw new Error("Invalid id");
    const data = [
      "1",
      KIND_CODE[p.kind],
      p.letterId,
      p.storyId,
      p.recipient,
      p.test ? "1" : "0",
    ].join("|");
    const body = Buffer.from(data).toString("base64url");
    return `${body}.${this.sign(body)}`;
  }

  /** Returns the payload, or null if the token is malformed or not signed by us. */
  verifyToken(token: string, expected?: TokenKind): TrackingPayload | null {
    if (token.length > 400) return null;
    const [body, sig, extra] = token.split(".");
    if (!body || !sig || extra !== undefined) return null;
    const a = Buffer.from(sig);
    const b = Buffer.from(this.sign(body));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    const parts = Buffer.from(body, "base64url").toString().split("|");
    if (parts.length !== 6 || parts[0] !== "1") return null;
    const [, code, letterId, storyId, recipient, test] = parts as [
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    const kind = CODE_KIND[code];
    if (!kind || (expected && kind !== expected)) return null;
    if (!/^[0-9a-f]{24}$/.test(letterId) || !recipient) return null;
    if (kind === "click" && !storyId) return null;
    return { kind, letterId, storyId, recipient, test: test === "1" };
  }
}
