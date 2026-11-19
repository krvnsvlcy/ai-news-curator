import type { ObjectId } from "mongodb";
import { z } from "zod";

export const LETTER_STATUSES = ["draft", "ready", "published"] as const;
export type LetterStatus = (typeof LETTER_STATUSES)[number];

const httpUrl = z.url({ protocol: /^https?$/, error: "Enter a valid http(s) URL." }).trim();
const objectIdHex = z.string().regex(/^[0-9a-f]{24}$/, "Invalid article id.");

/** ISO calendar date (publication day), stored as a string so it never shifts with time zones. */
export const letterDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a YYYY-MM-DD date.")
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Invalid date.");

/**
 * What the story said at the time it was added. Copied into the letter so that
 * re-fetching or deleting the source article never changes a past edition.
 */
export const storyOriginalSchema = z.object({
  title: z.string().trim().min(1, "Original headline is required.").max(500),
  url: httpUrl,
  sourceName: z.string().trim().min(1, "Publisher is required.").max(120),
  publishedAt: z.iso.datetime().optional(),
  summary: z.string().trim().max(2000).optional(),
});

export const letterStorySchema = z.object({
  /** Stable per-letter id (also the drag-and-drop key). */
  id: z.string().min(1).max(64),
  /** The curated article this story came from; null for manually added external stories. */
  articleId: objectIdHex.nullable(),
  headline: z.string().trim().max(300).default(""),
  description: z.string().trim().max(1000).default(""),
  original: storyOriginalSchema,
});

export const letterContentSchema = z.object({
  headline: z.string().trim().max(200).default(""),
  date: letterDateSchema,
  briefing: z.string().trim().max(5000).default(""),
  /** Editorial tone used for AI assistance; kept so the next session picks it up. */
  tone: z.string().trim().max(300).default(""),
  stories: z.array(letterStorySchema).max(50, "A letter can hold at most 50 stories."),
});
export type LetterContentInput = z.input<typeof letterContentSchema>;
export type LetterContent = z.output<typeof letterContentSchema>;
export type LetterStoryInput = z.input<typeof letterStorySchema>;

export interface LetterStoryDoc {
  id: string;
  articleId: ObjectId | null;
  headline: string;
  description: string;
  original: {
    title: string;
    url: string;
    sourceName: string;
    publishedAt?: Date;
    summary?: string;
  };
}

/** A delivery attempt. Counts only: subscriber addresses are never stored server-side. */
export interface LetterSendRecord {
  at: Date;
  kind: "test" | "subscribers";
  recipients: number;
  delivered: number;
  failed: number;
}

export interface LetterDoc {
  _id: ObjectId;
  status: LetterStatus;
  headline: string;
  date: string;
  briefing: string;
  tone: string;
  stories: LetterStoryDoc[];
  /** Incremented on every content save; guards against lost updates. */
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  readyAt?: Date;
  publishedAt?: Date;
  /**
   * The exact HTML rendered at publication, so the edition stays reproducible
   * even if the email template changes later.
   */
  publishedHtml?: string;
  /** Delivery history, newest last (capped). */
  sends?: LetterSendRecord[];
  /** Letter this one was duplicated from, if any. */
  duplicatedFrom?: ObjectId;
}

export { readinessProblems } from "@curator/newsletter";
