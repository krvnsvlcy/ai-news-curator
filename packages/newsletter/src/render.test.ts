import { describe, expect, it } from "vitest";
import { readinessProblems } from "./readiness.js";
import { formatLetterDate, renderLetterHtml, renderLetterText, safeHref } from "./render.js";

const letter = {
  headline: "Westminster discovers the off switch",
  date: "2026-11-19",
  briefing: "First paragraph.\n\nSecond <b>paragraph</b>.",
  stories: [
    {
      headline: "Minister bravely reviews the review",
      description: "The review will report back in due course.",
      originalTitle: "Minister announces review",
      sourceName: "GOV.UK",
      url: "https://www.gov.uk/x",
    },
    {
      headline: "",
      originalTitle: "Fallback headline",
      sourceName: "Sky News",
      url: "javascript:alert(1)",
    },
  ],
};
const options = { publicationName: "Curator Daily" };

describe("renderLetterHtml", () => {
  const html = renderLetterHtml(letter, options);

  it("includes the masthead, date, headline and briefing paragraphs", () => {
    expect(html).toContain("Curator Daily");
    expect(html).toContain("Thursday 19 November 2026");
    expect(html).toContain("Westminster discovers the off switch");
    expect(html).toContain(">First paragraph.</p>");
    expect(html).toContain(">Second &lt;b&gt;paragraph&lt;/b&gt;.</p>");
  });

  it("renders stories in order with attribution and links", () => {
    expect(html.indexOf("Minister bravely")).toBeLessThan(html.indexOf("Fallback headline"));
    expect(html).toContain('href="https://www.gov.uk/x"');
    expect(html).toContain("GOV.UK");
    expect(html).toContain("01");
    expect(html).toContain("02");
  });

  it("neutralizes unsafe links and escapes text", () => {
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("<b>paragraph");
  });

  it("has no subscription links, only a note on why the reader gets it", () => {
    expect(html).not.toContain("{{");
    expect(html).not.toContain("Unsubscribe");
    expect(html).toContain("added you to the list");
  });

  it("omits empty sections", () => {
    const bare = renderLetterHtml({ ...letter, briefing: "", stories: [] }, options);
    expect(bare).not.toContain("The briefing");
    expect(bare).not.toContain("Today's stories");
  });
});

describe("helpers", () => {
  it("formats dates without time zone drift", () => {
    expect(formatLetterDate("2026-01-01")).toBe("Thursday 1 January 2026");
  });
  it("only allows http(s) links", () => {
    expect(safeHref("https://a.test/?q=1&b=2")).toBe("https://a.test/?q=1&amp;b=2");
    expect(safeHref("mailto:x@y")).toBe("#");
    expect(safeHref("{{unsubscribe_url}}")).toBe("#");
  });
  it("renders a plain-text part", () => {
    const text = renderLetterText(letter, options);
    expect(text).toContain("1. Minister bravely reviews the review");
    expect(text).toContain("2. Fallback headline");
  });
  it("lists readiness problems", () => {
    expect(readinessProblems({ headline: "", briefing: "", stories: [] })).toHaveLength(3);
    // Empty story headlines are allowed: the email uses the original headline.
    expect(
      readinessProblems({ headline: "h", briefing: "b", stories: [{ headline: "" }] }),
    ).toEqual([]);
    expect(readinessProblems(letter)).toEqual([]);
  });
});
