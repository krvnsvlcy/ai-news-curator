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
