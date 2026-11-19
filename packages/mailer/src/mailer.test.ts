import { createTransport } from "nodemailer";
import { describe, expect, it } from "vitest";
import { getMailerConfig, Mailer } from "./mailer.js";

describe("getMailerConfig", () => {
  it("needs both SMTP_URL and SMTP_FROM", () => {
    expect(getMailerConfig({})).toBeNull();
    expect(getMailerConfig({ SMTP_URL: "smtp://localhost:1025" })).toBeNull();
    expect(getMailerConfig({ SMTP_URL: "smtp://localhost:1025", SMTP_FROM: "a@b.test" })).toEqual({
      url: "smtp://localhost:1025",
      from: "a@b.test",
    });
    expect(() => getMailerConfig({ SMTP_URL: "http://x", SMTP_FROM: "a@b.test" })).toThrow();
  });
});

describe("Mailer", () => {
  it("builds a multipart message with a List-Unsubscribe header", async () => {
    const sent: string[] = [];
    const transport = createTransport({ streamTransport: true, buffer: true, newline: "unix" });
    const original = transport.sendMail.bind(transport);
    transport.sendMail = (async (opts: Parameters<typeof original>[0]) => {
      const info = await original(opts);
      sent.push(String((info as unknown as { message: Buffer }).message));
      return info;
    }) as typeof transport.sendMail;

    const mailer = new Mailer(transport, "Curator Daily <letters@example.test>");
    await mailer.send({
      to: "reader@example.test",
      subject: "Hello",
      html: "<p>Hi</p>",
      text: "Hi",
      unsubscribeUrl: "https://app.test/unsubscribe?email=reader%40example.test",
    });
    // Unfold RFC 5322 continuation lines before matching headers.
    const raw = (sent[0] ?? "").replace(/\n[ \t]+/g, " ");
    expect(raw).toContain("To: reader@example.test");
    expect(raw).toContain(
      "List-Unsubscribe: <https://app.test/unsubscribe?email=reader%40example.test>",
    );
    expect(raw).toContain("text/html");
    expect(raw).toContain("text/plain");
  });

  it("keeps going when individual recipients fail", async () => {
    const transport = createTransport({ jsonTransport: true });
    transport.sendMail = (async (opts: { to?: unknown }) => {
      if (String(opts.to).startsWith("bad")) throw new Error("550 mailbox unavailable");
      return {};
    }) as unknown as typeof transport.sendMail;
    const mailer = new Mailer(transport, "x@y.test");
    const email = (to: string) => ({ to, subject: "s", html: "h", text: "t" });
    const res = await mailer.sendBatch(
      [email("a@x.test"), email("bad@x.test"), email("c@x.test")],
      2,
    );
    expect(res.delivered.sort()).toEqual(["a@x.test", "c@x.test"]);
    expect(res.failed).toEqual([{ to: "bad@x.test", error: "550 mailbox unavailable" }]);
  });
});
