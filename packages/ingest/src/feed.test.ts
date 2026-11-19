import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseFeed } from "./adapters/feed.js";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

describe("parseFeed", () => {
  it("parses Sky News RSS and decodes entities", () => {
    const items = parseFeed(fixture("sky-rss.xml"));
    expect(items).toHaveLength(2);
    const [first] = items;
    expect(first?.url).toMatch(/^https:\/\/news\.sky\.com\//);
    expect(first?.externalId).toBe(first?.url);
    expect(first?.title).not.toMatch(/&apos;|&quot;/);
    expect(first?.summary).toBeTruthy();
    expect(first?.publishedAt.getUTCFullYear()).toBeGreaterThan(2000);
  });

  it("parses GOV.UK Atom", () => {
    const items = parseFeed(fixture("govuk-atom.xml"));
    expect(items).toHaveLength(2);
    expect(items[0]?.externalId).toMatch(/^tag:www\.gov\.uk/);
    expect(items[0]?.url).toMatch(/^https:\/\/www\.gov\.uk\//);
    expect(items[0]?.summary).toBeTruthy();
  });

  it("parses Parliament bills RSS using a10:updated for the date", () => {
    const items = parseFeed(fixture("parliament-bills-rss.xml"));
    expect(items).toHaveLength(2);
    expect(items[0]?.externalId).toMatch(/^https:\/\/bills\.parliament\.uk\/bills\/\d+$/);
    expect(items[0]?.section).toBeTruthy();
    // Date comes from the feed, not the fallback "now".
    expect(Date.now() - (items[0]?.publishedAt.getTime() ?? 0)).toBeGreaterThan(1000);
  });

  it("rejects non-feeds", () => {
    expect(() => parseFeed("<html><body>Just a moment...</body></html>")).toThrow(
      "Not an RSS or Atom feed",
    );
  });
});
