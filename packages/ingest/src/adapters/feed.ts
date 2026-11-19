import type { ArticleInput } from "@curator/db";
import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../http.js";
import { decodeEntities, htmlToText, parseDate } from "../text.js";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true, // "a10:updated" -> "updated", "dc:date" -> "date"
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => ["item", "entry", "link", "category", "author"].includes(name),
});

type Node = Record<string, unknown>;

function text(v: unknown): string | undefined {
  if (v == null) return undefined;
  if (typeof v === "string" || typeof v === "number") return String(v).trim() || undefined;
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object" && "#text" in v) return text((v as Node)["#text"]);
  return undefined;
}

function list(v: unknown): Node[] {
  if (v == null) return [];
  return (Array.isArray(v) ? v : [v]) as Node[];
}

function rssItem(i: Node): ArticleInput | null {
  const title = text(i.title);
  const url = text(i.link) ?? (text(i.guid)?.startsWith("http") ? text(i.guid) : undefined);
  if (!title || !url) return null;
  return {
    externalId: text(i.guid) ?? url,
    url,
    title: decodeEntities(title),
    summary: htmlToText(text(i.description) ?? text(i.encoded)),
    author: text(i.creator) ?? text(i.author),
    section: text(i.category),
    publishedAt:
      parseDate(text(i.pubDate) ?? text(i.date) ?? text(i.updated) ?? text(i.published)) ??
      new Date(),
  };
}

function atomEntry(e: Node): ArticleInput | null {
  const links = list(e.link);
  const link = links.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") ?? links[0];
  const url = link ? text(link["@_href"]) : undefined;
  const title = text(e.title);
  if (!title || !url) return null;
  return {
    externalId: text(e.id) ?? url,
    url,
    title: decodeEntities(title),
    summary: htmlToText(text(e.summary) ?? text(e.content)),
    author: text(list(e.author)[0]?.name),
    section: text(list(e.category)[0]?.["@_term"]),
    publishedAt: parseDate(text(e.published) ?? text(e.updated)) ?? new Date(),
  };
}

/** Parses an RSS 2.0 or Atom document. Throws if it is neither. */
export function parseFeed(xml: string): ArticleInput[] {
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch (err) {
    throw new Error(`Invalid XML: ${(err as Error).message}`);
  }
  const channel = (doc.rss as Node | undefined)?.channel as Node | undefined;
  const items = channel
    ? list(channel.item).map(rssItem)
    : doc.feed
      ? list((doc.feed as Node).entry).map(atomEntry)
      : null;
  if (!items) throw new Error("Not an RSS or Atom feed");
  return items.filter((i): i is ArticleInput => i !== null);
}

export async function fetchFeed(url: string, fetchImpl?: typeof fetch): Promise<ArticleInput[]> {
  const xml = await fetchText(url, {
    accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, */*;q=0.8",
    fetchImpl,
  });
  return parseFeed(xml);
}
