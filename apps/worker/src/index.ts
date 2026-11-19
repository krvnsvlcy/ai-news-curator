import { curate } from "@curator/core";
import { fetchFeed } from "./feeds.js";

const feedUrls = (process.env.FEED_URLS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

async function main() {
  if (feedUrls.length === 0) {
    console.error("FEED_URLS is empty. Copy .env.example to .env and add feeds.");
    process.exitCode = 1;
    return;
  }

  const results = await Promise.allSettled(feedUrls.map((url) => fetchFeed(url)));
  const articles = results.flatMap((r, i) => {
    if (r.status === "fulfilled") return r.value;
    console.warn(`Failed to fetch ${feedUrls[i]}:`, r.reason);
    return [];
  });

  const curated = curate(articles);
  console.log(`Fetched ${articles.length} articles, kept ${curated.length}.`);
  for (const a of curated.slice(0, 20)) {
    console.log(`${a.score.toFixed(2)}  ${a.title}  [${a.tags.join(", ")}]`);
  }
}

await main();
