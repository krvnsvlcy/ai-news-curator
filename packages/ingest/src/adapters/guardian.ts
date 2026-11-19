import type { ArticleInput, SourceConfig } from "@curator/db";
import { fetchText } from "../http.js";
import { decodeEntities, htmlToText, parseDate } from "../text.js";

type GuardianConfig = Extract<SourceConfig, { kind: "guardian" }>;

const ENDPOINT = "https://content.guardianapis.com/search";

interface GuardianResult {
  id: string;
  sectionName?: string;
  webPublicationDate: string;
  webTitle: string;
  webUrl: string;
  fields?: { trailText?: string; byline?: string };
}

interface GuardianResponse {
  response?: { status?: string; message?: string; results?: GuardianResult[] };
  message?: string;
}

export function buildGuardianUrl(config: GuardianConfig, apiKey: string): string {
  const url = new URL(ENDPOINT);
  url.searchParams.set("api-key", apiKey);
  url.searchParams.set("order-by", "newest");
  url.searchParams.set("page-size", String(config.pageSize));
  url.searchParams.set("show-fields", "trailText,byline");
  if (config.section) url.searchParams.set("section", config.section);
  if (config.query) url.searchParams.set("q", config.query);
  return url.toString();
}

export function parseGuardian(json: string): ArticleInput[] {
  const body = JSON.parse(json) as GuardianResponse;
  const r = body.response;
  if (r?.status !== "ok") {
    throw new Error(`Guardian API error: ${r?.message ?? body.message ?? "unexpected response"}`);
  }
  return (r.results ?? []).map((a) => ({
    externalId: a.id,
    url: a.webUrl,
    title: decodeEntities(a.webTitle),
    summary: htmlToText(a.fields?.trailText),
    author: a.fields?.byline || undefined,
    section: a.sectionName,
    publishedAt: parseDate(a.webPublicationDate) ?? new Date(),
  }));
}

export async function fetchGuardian(
  config: GuardianConfig,
  env: NodeJS.ProcessEnv = process.env,
  fetchImpl?: typeof fetch,
): Promise<ArticleInput[]> {
  const apiKey = env.GUARDIAN_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GUARDIAN_API_KEY is not set. Get a key at https://open-platform.theguardian.com/access/",
    );
  }
  try {
    return parseGuardian(
      await fetchText(buildGuardianUrl(config, apiKey), { accept: "application/json", fetchImpl }),
    );
  } catch (err) {
    // Never let the API key leak into stored error messages.
    throw new Error((err as Error).message.replaceAll(apiKey, "***"));
  }
}
