import { escapeHtml, MERGE_TAGS } from "./render.js";

export interface RecipientLinks {
  manageUrl: string;
  unsubscribeUrl: string;
}

function assertHttp(url: string) {
  if (!/^https?:\/\//i.test(url)) throw new Error(`Recipient links must be http(s) URLs: ${url}`);
}

/** Fills the subscription merge tags in rendered HTML (values are attribute-escaped). */
export function personalizeHtml(html: string, links: RecipientLinks): string {
  assertHttp(links.manageUrl);
  assertHttp(links.unsubscribeUrl);
  return html
    .replaceAll(MERGE_TAGS.manageUrl, escapeHtml(links.manageUrl))
    .replaceAll(MERGE_TAGS.unsubscribeUrl, escapeHtml(links.unsubscribeUrl));
}

/** Fills the subscription merge tags in the plain-text part. */
export function personalizeText(text: string, links: RecipientLinks): string {
  return text
    .replaceAll(MERGE_TAGS.manageUrl, links.manageUrl)
    .replaceAll(MERGE_TAGS.unsubscribeUrl, links.unsubscribeUrl);
}
