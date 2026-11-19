import { renderLetterHtml } from "@curator/newsletter";
import { describe, expect, it } from "vitest";
import { addOpenPixel, rewriteStoryLinks } from "./links.js";
import { Tracker } from "./tokens.js";

const tracker = new Tracker("s".repeat(32));
const letterId = "65a000000000000000000001";

describe("Tracker", () => {
  it("round-trips signed tokens", () => {
    const recipient = tracker.recipientId("Reader@Example.test");
    const token = tracker.createToken({
      kind: "click",
      letterId,
      storyId: "story-1",
      recipient,
      test: false,
    });
    expect(tracker.verifyToken(token, "click")).toEqual({
      kind: "click",
      letterId,
      storyId: "story-1",
      recipient,
      test: false,
    });
    expect(token).not.toContain("reader");
  });

  it("gives a stable, case-insensitive, secret-dependent recipient id", () => {
    expect(tracker.recipientId("a@b.test")).toBe(tracker.recipientId(" A@B.test "));
    expect(tracker.recipientId("a@b.test")).not.toBe(tracker.recipientId("c@b.test"));
    expect(new Tracker("t".repeat(32)).recipientId("a@b.test")).not.toBe(
      tracker.recipientId("a@b.test"),
    );
  });

  it("rejects tampered, foreign, or wrong-kind tokens", () => {
    const token = tracker.createToken({
      kind: "open",
      letterId,
      storyId: "",
      recipient: "r",
      test: false,
    });
    expect(tracker.verifyToken(token, "click")).toBeNull();
    expect(tracker.verifyToken(token, "open")?.kind).toBe("open");

    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      Buffer.from(body as string, "base64url")
        .toString()
        .replace(letterId, "65a000000000000000000002"),
    ).toString("base64url");
    expect(tracker.verifyToken(`${forged}.${sig}`)).toBeNull();
    expect(new Tracker("x".repeat(32)).verifyToken(token)).toBeNull();
    expect(tracker.verifyToken("garbage")).toBeNull();
    expect(tracker.verifyToken(`${body}.${sig}.x`)).toBeNull();
  });
});

describe("rewriteStoryLinks", () => {
  it("rewrites only story links, matching the renderer's escaping", () => {
    const stories = [
      { id: "s1", url: "https://a.test/x?y=1&z=2" },
      { id: "s2", url: "https://b.test/" },
    ];
    const html = renderLetterHtml(
      {
        headline: "H",
        date: "2026-11-19",
        briefing: "",
        stories: stories.map((s) => ({
          headline: s.id,
          originalTitle: s.id,
          sourceName: "S",
          url: s.url,
        })),
      },
      { publicationName: "P" },
    );
    const out = rewriteStoryLinks(html, stories, (id) => `https://app.test/r/${id}?a=1&b=2`);
    expect(out).not.toContain("https://a.test/x");
    expect(out).not.toContain("https://b.test/");
    expect(out.match(/https:\/\/app\.test\/r\/s1\?a=1&amp;b=2/g)).toHaveLength(2); // headline + attribution
    const footer = html.slice(html.lastIndexOf('<table role="presentation" class="container"'));
    expect(out.endsWith(footer)).toBe(true); // footer untouched
  });
});

describe("addOpenPixel", () => {
  it("inserts an escaped 1×1 image before </body>", () => {
    const out = addOpenPixel("<html><body><p>Hi</p></body></html>", "https://app.test/o/a?b=1&c=2");
    expect(out).toBe(
      '<html><body><p>Hi</p><img src="https://app.test/o/a?b=1&amp;c=2" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;" /></body></html>',
    );
  });
  it("appends when there is no </body>", () => {
    expect(addOpenPixel("<p>x</p>", "https://a.test/o")).toMatch(/^<p>x<\/p><img /);
  });
});
