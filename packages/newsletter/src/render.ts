// Renders a letter as email-safe HTML: table layout, inline styles, web-safe
// fonts, and one media query for small screens. Pure and dependency-free so the
// editor's live preview and (later) the delivery pipeline produce identical output.

export interface NewsletterStory {
  headline: string;
  description?: string;
  originalTitle: string;
  sourceName: string;
  url: string;
}

export interface NewsletterLetter {
  headline: string;
  /** YYYY-MM-DD */
  date: string;
  briefing: string;
  stories: NewsletterStory[];
}

export interface NewsletterOptions {
  publicationName: string;
  tagline?: string;
  /** Delivery fills these in per subscriber; defaults are ESP-style merge tags. */
  manageUrl?: string;
  unsubscribeUrl?: string;
  /** Shown in the footer as the reason the reader gets this email. */
  recipientNote?: string;
}

export const MERGE_TAGS = {
  manageUrl: "{{manage_url}}",
  unsubscribeUrl: "{{unsubscribe_url}}",
} as const;

/** Bump when the template changes in a way that alters published output. */
export const TEMPLATE_VERSION = 1;

const C = {
  page: "#f3f2ee",
  paper: "#ffffff",
  ink: "#1a1a1a",
  body: "#333333",
  muted: "#77736b",
  rule: "#e6e3dc",
  briefingBg: "#f8f7f3",
  accent: "#b3261e",
};
const SERIF = "Georgia, 'Times New Roman', Times, serif";
const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only http(s) links and merge tags survive; anything else becomes "#". */
export function safeHref(url: string | undefined): string {
  if (!url) return "#";
  const u = url.trim();
  if (/^\{\{[a-z_]+\}\}$/.test(u)) return u;
  return /^https?:\/\//i.test(u) ? escapeHtml(u) : "#";
}

export function formatLetterDate(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return isoDate;
  // Assemble from parts: ICU versions disagree on the comma after the weekday.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
}

function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function preheader(letter: NewsletterLetter): string {
  const src = letter.briefing.trim() || letter.stories[0]?.headline || "";
  return src.length > 140 ? `${src.slice(0, 139).trimEnd()}…` : src;
}

function storyBlock(story: NewsletterStory, index: number, last: boolean): string {
  const href = safeHref(story.url);
  const number = String(index + 1).padStart(2, "0");
  const headline = escapeHtml(story.headline.trim() || story.originalTitle);
  return `
          <tr>
            <td class="px" style="padding:28px 48px ${last ? "36px" : "28px"} 48px;${last ? "" : `border-bottom:1px solid ${C.rule};`}">
              <p style="margin:0 0 8px 0;font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:1.5px;color:${C.accent};">${number}</p>
              <h2 class="story-h" style="margin:0;font-family:${SERIF};font-size:24px;line-height:1.25;font-weight:700;color:${C.ink};">
                <a href="${href}" target="_blank" rel="noopener" style="color:${C.ink};text-decoration:none;">${headline}</a>
              </h2>
              ${
                story.description?.trim()
                  ? `<p style="margin:10px 0 0 0;font-family:${SERIF};font-size:17px;line-height:1.6;color:${C.body};">${escapeHtml(story.description.trim())}</p>`
                  : ""
              }
              <p style="margin:14px 0 0 0;font-family:${SANS};font-size:13px;line-height:1.5;color:${C.muted};">
                <span style="font-weight:600;color:${C.body};">${escapeHtml(story.sourceName)}</span>
                &nbsp;·&nbsp;
                <a href="${href}" target="_blank" rel="noopener" style="color:${C.muted};text-decoration:underline;">${escapeHtml(story.originalTitle)}</a>
              </p>
            </td>
          </tr>`;
}

export function renderLetterHtml(letter: NewsletterLetter, options: NewsletterOptions): string {
  const name = escapeHtml(options.publicationName);
  const headline = escapeHtml(letter.headline.trim() || "Untitled edition");
  const date = escapeHtml(formatLetterDate(letter.date));
  const manage = safeHref(options.manageUrl ?? MERGE_TAGS.manageUrl);
  const unsubscribe = safeHref(options.unsubscribeUrl ?? MERGE_TAGS.unsubscribeUrl);
  const briefing = paragraphs(letter.briefing)
    .map(
      (p) =>
        `<p style="margin:0 0 14px 0;font-family:${SERIF};font-size:18px;line-height:1.65;color:${C.body};">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${headline}</title>
<style>
  body { margin:0; padding:0; -webkit-text-size-adjust:100%; }
  a { color:${C.ink}; }
  @media (max-width: 620px) {
    .container { width:100% !important; }
    .px { padding-left:22px !important; padding-right:22px !important; }
    .h1 { font-size:30px !important; }
    .story-h { font-size:21px !important; }
    .outer { padding:0 !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader(letter))}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.page};">
    <tr>
      <td class="outer" align="center" style="padding:32px 12px;">
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${C.paper};">
          <tr>
            <td class="px" style="padding:36px 48px 0 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-family:${SANS};font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.ink};">${name}</td>
                  <td align="right" style="font-family:${SANS};font-size:12px;color:${C.muted};">${date}</td>
                </tr>
              </table>
              <div style="height:14px;border-bottom:2px solid ${C.ink};line-height:14px;font-size:0;">&nbsp;</div>
            </td>
          </tr>
          <tr>
            <td class="px" style="padding:28px 48px 8px 48px;">
              <h1 class="h1" style="margin:0;font-family:${SERIF};font-size:38px;line-height:1.15;font-weight:700;letter-spacing:-0.5px;color:${C.ink};">${headline}</h1>
              ${options.tagline ? `<p style="margin:10px 0 0 0;font-family:${SANS};font-size:13px;color:${C.muted};">${escapeHtml(options.tagline)}</p>` : ""}
            </td>
          </tr>
          ${
            briefing
              ? `<tr>
            <td class="px" style="padding:24px 48px 8px 48px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.briefingBg};border-left:3px solid ${C.ink};">
                <tr>
                  <td style="padding:20px 24px 8px 24px;">
                    <p style="margin:0 0 10px 0;font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.muted};">The briefing</p>
                    ${briefing}
                  </td>
                </tr>
              </table>
            </td>
          </tr>`
              : ""
          }
          ${
            letter.stories.length
              ? `<tr>
            <td class="px" style="padding:32px 48px 0 48px;">
              <p style="margin:0;padding-bottom:10px;border-bottom:1px solid ${C.rule};font-family:${SANS};font-size:11px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:${C.muted};">Today's stories</p>
            </td>
          </tr>${letter.stories.map((s, i) => storyBlock(s, i, i === letter.stories.length - 1)).join("")}`
              : ""
          }
        </table>
        <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">
          <tr>
            <td class="px" style="padding:24px 48px 8px 48px;font-family:${SANS};font-size:12px;line-height:1.6;color:${C.muted};text-align:center;">
              <p style="margin:0 0 6px 0;font-weight:700;color:${C.body};">${name}</p>
              <p style="margin:0 0 6px 0;">${escapeHtml(options.recipientNote ?? `You're receiving this because you subscribed to ${options.publicationName}.`)}</p>
              <p style="margin:0;">
                <a href="${manage}" target="_blank" rel="noopener" style="color:${C.muted};text-decoration:underline;">Manage subscription</a>
                &nbsp;·&nbsp;
                <a href="${unsubscribe}" target="_blank" rel="noopener" style="color:${C.muted};text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Plain-text alternative part for the same email. */
export function renderLetterText(letter: NewsletterLetter, options: NewsletterOptions): string {
  const lines: string[] = [
    options.publicationName.toUpperCase(),
    formatLetterDate(letter.date),
    "",
    letter.headline.trim() || "Untitled edition",
    "",
  ];
  if (letter.briefing.trim()) lines.push("THE BRIEFING", "", ...paragraphs(letter.briefing), "");
  letter.stories.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.headline.trim() || s.originalTitle}`);
    if (s.description?.trim()) lines.push(s.description.trim());
    lines.push(`${s.sourceName}: ${s.originalTitle}`, s.url, "");
  });
  lines.push(
    "—",
    `Manage subscription: ${options.manageUrl ?? MERGE_TAGS.manageUrl}`,
    `Unsubscribe: ${options.unsubscribeUrl ?? MERGE_TAGS.unsubscribeUrl}`,
  );
  return lines.join("\n");
}
