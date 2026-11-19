// Server-side pieces of the "New letter" walkthrough shared by its server
// actions and the streaming draft route. Not a "use server" file: nothing here
// should be callable from the browser.
import type { LetterDraft, SourceStory } from "@curator/ai";
import { type ArticleDoc, listArticlesForDay } from "@curator/db";
import { z } from "zod";

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const toneSchema = z.string().trim().max(300).default("");

/** Candidates sent to Claude; summaries trimmed to keep the prompt lean. */
const MAX_CANDIDATES = 150;
const SUMMARY_CHARS = 300;

/** The day's candidate stories, in the order Claude sees them (newest first). */
export function dayCandidates(date: string): Promise<ArticleDoc[]> {
  return listArticlesForDay(date, MAX_CANDIDATES);
}

export function toSourceStories(articles: ArticleDoc[]): SourceStory[] {
  return articles.map((a) => ({
    publisher: a.sourceName,
    originalHeadline: a.title,
    ...(a.summary ? { summary: a.summary.slice(0, SUMMARY_CHARS) } : {}),
  }));
}

export interface DraftHighlight {
  articleId: string;
  /** 1-based position among the day's candidates (display only). */
  storyIndex: number;
  headline: string;
  summary: string;
}
export interface DraftPreview {
  date: string;
  tone: string;
  headline: string;
  briefing: string;
  highlights: DraftHighlight[];
}

/** Ties a finished draft's picks back to the articles they came from. */
export function toPreview(
  draft: LetterDraft,
  articles: ArticleDoc[],
  date: string,
  tone: string,
): DraftPreview {
  return {
    date,
    tone,
    headline: draft.headline,
    briefing: draft.briefing,
    highlights: draft.highlights.flatMap((h) => {
      const a = articles[h.storyIndex];
      return a
        ? [
            {
              articleId: a._id.toHexString(),
              storyIndex: h.storyIndex + 1,
              headline: h.headline,
              summary: h.summary,
            },
          ]
        : [];
    }),
  };
}
