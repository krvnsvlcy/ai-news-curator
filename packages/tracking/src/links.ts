import { escapeHtmlAttr } from "./escape.js";

/**
 * Points each story's links in rendered letter HTML at a tracking URL.
 * Works on any rendered or archived letter: story links are exactly
 * href="<escaped story url>". If two stories share a URL, the first one wins.
 */
export function rewriteStoryLinks(
  html: string,
  stories: { id: string; url: string }[],
  linkFor: (storyId: string) => string,
): string {
  const seen = new Set<string>();
  let out = html;
  for (const s of stories) {
    const href = `href="${escapeHtmlAttr(s.url)}"`;
    if (seen.has(href)) continue;
    seen.add(href);
    out = out.replaceAll(href, `href="${escapeHtmlAttr(linkFor(s.id))}"`);
  }
  return out;
}

/**
 * Adds a 1×1 open-tracking image just before </body> (or at the end). Opens are
 * approximate: some clients block images, and some (e.g. Apple Mail Privacy
 * Protection) fetch them without the reader opening the email.
 */
export function addOpenPixel(html: string, pixelUrl: string): string {
  const img = `<img src="${escapeHtmlAttr(pixelUrl)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;opacity:0;" />`;
  const i = html.lastIndexOf("</body>");
  return i === -1 ? html + img : html.slice(0, i) + img + html.slice(i);
}
