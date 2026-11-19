import { describe, expect, it } from "vitest";
import { personalizeHtml, personalizeText } from "./personalize.js";
import { renderLetterHtml, renderLetterText } from "./render.js";

const letter = { headline: "H", date: "2026-11-19", briefing: "B", stories: [] };
const links = {
  manageUrl: "https://app.test/subscribe",
  unsubscribeUrl: "https://app.test/unsubscribe?email=a%2Bb%40x.test&x=1",
};

describe("personalize", () => {
  it("replaces merge tags in HTML with escaped URLs", () => {
    const html = personalizeHtml(renderLetterHtml(letter, { publicationName: "P" }), links);
    expect(html).not.toContain("{{");
    expect(html).toContain('href="https://app.test/unsubscribe?email=a%2Bb%40x.test&amp;x=1"');
    expect(html).toContain('href="https://app.test/subscribe"');
  });

  it("replaces merge tags in text", () => {
    const text = personalizeText(renderLetterText(letter, { publicationName: "P" }), links);
    expect(text).toContain(`Unsubscribe: ${links.unsubscribeUrl}`);
  });

  it("rejects non-http links", () => {
    expect(() => personalizeHtml("", { ...links, unsubscribeUrl: "javascript:x" })).toThrow();
  });
});
