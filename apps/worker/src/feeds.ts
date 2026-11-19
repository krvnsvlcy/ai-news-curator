import { createHash } from "node:crypto";
import type { Article } from "@curator/core";
import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

type Node = Record<string, unknown>;

function text(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as Node)) return String((v as Node)["#text"]);
  return undefined;
}

function asArray<T>(v: T | T[] | undefined): T[] {
  return v == null ? [] : Array.isArray(v) ? v : [v];
}

/** Fetches an RSS 2.0 or Atom feed and normalizes it to Articles. */
export async function fetchFeed(feedUrl: string): Promise<Article[]> {
  const res = await fetch(feedUrl, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = parser.parse(await res.text()) as Node;
  const sourceId = new URL(feedUrl).hostname;

  const rss = (doc.rss as Node | undefined)?.channel as Node | undefined;
  const atom = doc.feed as Node | undefined;

  const items = rss
    ? asArray(rss.item as Node[]).map((i) => ({
        title: text(i.title),
        url: text(i.link),
        summary: text(i.description),
        date: text(i.pubDate),
      }))
    : asArray(atom?.entry as Node[]).map((e) => {
        const links = asArray(e.link as Node[]);
        const link = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
        return {
          title: text(e.title),
          url: link ? String(link["@_href"]) : undefined,
          summary: text(e.summary) ?? text(e.content),
          date: text(e.published) ?? text(e.updated),
        };
      });

  return items.flatMap(({ title, url, summary, date }) => {
    if (!title || !url) return [];
    const parsed = date ? new Date(date) : new Date();
    return [
      {
        id: createHash("sha256").update(url).digest("hex").slice(0, 16),
        sourceId,
        title,
        url,
        summary,
        publishedAt: (Number.isNaN(parsed.getTime()) ? new Date() : parsed).toISOString(),
      },
    ];
  });
}
