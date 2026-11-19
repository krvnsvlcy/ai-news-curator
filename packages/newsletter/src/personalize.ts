// Letters published with template v1 were archived with a footer of
// subscription links as merge tags ({{manage_url}}, {{unsubscribe_url}}).
// Subscribers are now managed by the editor only, so re-sends drop that footer.

const LEGACY_LINKS =
  /\s*<p\b[^>]*>\s*<a href="\{\{manage_url\}\}"[\s\S]*?\{\{unsubscribe_url\}\}[\s\S]*?<\/p>/g;

/** Removes v1 subscription links from archived HTML; anything else is returned as-is. */
export function removeLegacySubscriptionLinks(html: string): string {
  return html.replace(LEGACY_LINKS, "");
}
