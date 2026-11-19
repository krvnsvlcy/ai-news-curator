import { collections } from "./client.js";
import { type SourceInput, sourceInputSchema } from "./schema.js";

export const DEFAULT_SOURCES: SourceInput[] = [
  {
    slug: "sky-news-uk",
    name: "Sky News",
    description: "Broad UK headlines.",
    fetchIntervalMinutes: 15,
    config: { kind: "feed", url: "https://feeds.skynews.com/feeds/rss/uk.xml" },
  },
  {
    slug: "guardian",
    name: "The Guardian",
    description: "Structured political, economic and social news via the Content API.",
    fetchIntervalMinutes: 30,
    config: {
      kind: "guardian",
      section: "politics|uk-news|business|society",
      pageSize: 50,
    },
  },
  {
    slug: "gov-uk",
    name: "GOV.UK",
    description: "Official government news and announcements.",
    fetchIntervalMinutes: 30,
    config: { kind: "feed", url: "https://www.gov.uk/search/news-and-communications.atom" },
  },
  {
    slug: "uk-parliament-bills",
    name: "UK Parliament",
    description: "Recent bills and their progress through Parliament.",
    fetchIntervalMinutes: 60,
    config: { kind: "feed", url: "https://bills.parliament.uk/rss/allbills.rss" },
  },
];

/**
 * Inserts any default source whose slug doesn't exist yet. Never overwrites
 * a source someone has edited. Returns the slugs that were added.
 */
export async function seedDefaultSources(): Promise<string[]> {
  const { sources } = await collections();
  const now = new Date();
  const added: string[] = [];
  for (const input of DEFAULT_SOURCES) {
    const data = sourceInputSchema.parse(input);
    const res = await sources.updateOne(
      { slug: data.slug },
      { $setOnInsert: { ...data, createdAt: now, updatedAt: now } },
      { upsert: true },
    );
    if (res.upsertedCount > 0) added.push(data.slug);
  }
  return added;
}
