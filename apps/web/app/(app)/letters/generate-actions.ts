"use server";

import { MIN_DRAFT_STORIES } from "@curator/ai";
import {
  createLetter,
  getArticlesByIds,
  getSource,
  listSources,
  londonMidnight,
  saveLetterContent,
  todayInLondon,
} from "@curator/db";
import { ingestSource } from "@curator/ingest";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { dateSchema, dayCandidates, toneSchema } from "@/lib/letter-draft";

// "New letter" walkthrough: the dialog calls these in turn so its progress is
// real. 1) refresh sources and gather the day's news, 2) Claude drafts the
// edition (streamed: /api/letters/draft), 3) create it and open it in the editor.

/** A slow feed shouldn't hold up the walkthrough. */
const REFRESH_TIMEOUT_MS = 20_000;

export type StepResult<T> = { ok: true; value: T } | { ok: false; error: string };

function daysBetween(a: string, b: string) {
  return Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);
}

/**
 * Step 1a. Which sources to refresh first: every enabled one for today or
 * yesterday (feeds only list recent items, so older days use what's stored).
 */
export async function prepareGatherAction(
  rawDate: string,
): Promise<StepResult<{ refresh: { id: string; name: string }[] }>> {
  await requireSession();
  const parsed = dateSchema.safeParse(rawDate);
  if (!parsed.success) return { ok: false, error: "Pick a valid date." };
  const age = daysBetween(todayInLondon(), parsed.data);
  if (age < 0) return { ok: false, error: "That date is in the future: there's no news yet." };
  if (age > 1) return { ok: true, value: { refresh: [] } };
  const sources = (await listSources()).filter((s) => s.enabled);
  return {
    ok: true,
    value: { refresh: sources.map((s) => ({ id: s._id.toHexString(), name: s.name })) },
  };
}

export type RefreshOutcome =
  | { status: "ok"; newCount: number }
  | { status: "error" }
  | { status: "timeout" };

/** Step 1b. Refreshes one source; the dialog runs these in parallel, one chip each. */
export async function refreshSourceAction(id: string): Promise<RefreshOutcome> {
  await requireSession();
  const source = await getSource(String(id));
  if (!source?.enabled) return { status: "error" };
  const result = await Promise.race([
    ingestSource(source),
    new Promise<null>((r) => setTimeout(() => r(null), REFRESH_TIMEOUT_MS)),
  ]);
  if (!result) return { status: "timeout" };
  return result.status === "ok" ? { status: "ok", newCount: result.newCount } : { status: "error" };
}

export interface DayNews {
  stories: number;
  /** How many of the stories were borrowed from earlier days to make up a thin day. */
  earlier: number;
  bySource: { name: string; count: number }[];
  /** Every candidate, in the order Claude sees them (for the live "reading" view). */
  candidates: { title: string; sourceName: string }[];
}

/** Step 1c. The day's stories: counts per publisher, and the candidates themselves. */
export async function dayNewsAction(rawDate: string): Promise<StepResult<DayNews>> {
  await requireSession();
  const parsed = dateSchema.safeParse(rawDate);
  if (!parsed.success) return { ok: false, error: "Pick a valid date." };
  const articles = await dayCandidates(parsed.data);
  if (articles.length < MIN_DRAFT_STORIES) {
    return {
      ok: false,
      error:
        articles.length === 0
          ? "No stories were found. Check your sources in Settings, or pick another date."
          : `Only ${articles.length} ${articles.length === 1 ? "story is" : "stories are"} stored, on that day or before it; a letter needs at least ${MIN_DRAFT_STORIES}. Pick another date.`,
    };
  }
  const counts = new Map<string, number>();
  for (const a of articles) counts.set(a.sourceName, (counts.get(a.sourceName) ?? 0) + 1);
  return {
    ok: true,
    value: {
      stories: articles.length,
      earlier: articles.filter((a) => a.publishedAt < londonMidnight(parsed.data)).length,
      bySource: [...counts]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
      candidates: articles.map((a) => ({ title: a.title, sourceName: a.sourceName })),
    },
  };
}

// Step 2 (Claude writing the draft) streams, so it's a route: /api/letters/draft.

const createSchema = z.object({
  date: dateSchema,
  tone: toneSchema,
  headline: z.string().trim().min(1).max(200),
  briefing: z.string().trim().min(1).max(5000),
  highlights: z
    .array(
      z.object({
        articleId: z.string().regex(/^[0-9a-f]{24}$/),
        headline: z.string().trim().min(1).max(300),
        summary: z.string().trim().min(1).max(1000),
      }),
    )
    .min(1)
    .max(5),
});

/**
 * Step 3. Creates the letter and opens it in the editor. Story sources are read
 * from the database, never taken from the browser.
 */
export async function createDraftedLetterAction(input: {
  date: string;
  tone: string;
  headline: string;
  briefing: string;
  highlights: { articleId: string; headline: string; summary: string }[];
}): Promise<StepResult<never> | undefined> {
  await requireSession();
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The draft is incomplete. Regenerate it." };
  const d = parsed.data;
  const byId = new Map(
    (await getArticlesByIds(d.highlights.map((h) => h.articleId))).map((a) => [
      a._id.toHexString(),
      a,
    ]),
  );
  const stories = d.highlights.flatMap((h) => {
    const a = byId.get(h.articleId);
    if (!a) return [];
    return [
      {
        id: crypto.randomUUID(),
        articleId: h.articleId,
        headline: h.headline,
        description: h.summary,
        original: {
          title: a.title,
          url: a.url,
          sourceName: a.sourceName,
          publishedAt: a.publishedAt.toISOString(),
          ...(a.summary ? { summary: a.summary.slice(0, 2000) } : {}),
        },
      },
    ];
  });
  if (stories.length === 0) {
    return {
      ok: false,
      error: "The stories in this draft are no longer available. Regenerate it.",
    };
  }

  const letter = await createLetter(d.date);
  await saveLetterContent(letter._id, letter.revision, {
    headline: d.headline,
    date: d.date,
    briefing: d.briefing,
    tone: d.tone,
    stories,
  });
  revalidatePath("/letters");
  revalidatePath("/");
  redirect(`/letters/${letter._id.toHexString()}`);
}
