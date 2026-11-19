import { describe, expect, it } from "vitest";
import { removeLegacySubscriptionLinks } from "./personalize.js";
import { renderLetterHtml } from "./render.js";

// The footer exactly as template v1 archived it.
const V1_FOOTER = `<p style="margin:0 0 6px 0;">You're receiving this because you subscribed to P.</p>
              <p style="margin:0;">
                <a href="{{manage_url}}" target="_blank" rel="noopener" style="color:#6b6b6b;text-decoration:underline;">Manage subscription</a>
                &nbsp;·&nbsp;
                <a href="{{unsubscribe_url}}" target="_blank" rel="noopener" style="color:#6b6b6b;text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>`;

describe("removeLegacySubscriptionLinks", () => {
  it("drops the v1 subscription links and keeps the rest", () => {
    const out = removeLegacySubscriptionLinks(`<table><tr><td>${V1_FOOTER}</tr></table>`);
    expect(out).not.toContain("{{");
    expect(out).not.toContain("Unsubscribe");
    expect(out).toContain("You're receiving this because you subscribed to P.");
    expect(out).toContain("</td></tr></table>");
  });

  it("leaves current letters unchanged", () => {
    const html = renderLetterHtml(
      { headline: "H", date: "2026-11-19", briefing: "B", stories: [] },
      { publicationName: "P" },
    );
    expect(removeLegacySubscriptionLinks(html)).toBe(html);
  });
});
