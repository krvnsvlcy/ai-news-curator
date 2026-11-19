import type { ObjectId } from "mongodb";
import { z } from "zod";

export const SOURCE_KINDS = ["feed", "guardian"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

const httpUrl = z.url({ protocol: /^https?$/, error: "Enter a valid http(s) URL." }).trim();

export const feedConfigSchema = z.object({
  kind: z.literal("feed"),
  /** RSS 2.0 or Atom feed URL. */
  url: httpUrl,
});

export const guardianConfigSchema = z.object({
  kind: z.literal("guardian"),
  /** Guardian section ids; several are OR-ed, e.g. "politics|uk-news". */
  section: z.string().trim().max(200).optional(),
  /** Free-text search, Guardian query syntax (AND/OR/NOT). */
  query: z.string().trim().max(500).optional(),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const sourceConfigSchema = z.discriminatedUnion("kind", [
  feedConfigSchema,
  guardianConfigSchema,
]);
export type SourceConfig = z.infer<typeof sourceConfigSchema>;

export const sourceInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes.")
    .max(60),
  description: z.string().trim().max(500).optional(),
  enabled: z.boolean().default(true),
  fetchIntervalMinutes: z
    .number()
    .int()
    .min(5)
    .max(24 * 60)
    .default(30),
  config: sourceConfigSchema,
});
export type SourceInput = z.input<typeof sourceInputSchema>;
export type ValidSourceInput = z.output<typeof sourceInputSchema>;

export type FetchStatus = "ok" | "error";

export interface SourceDoc extends ValidSourceInput {
  _id: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  lastFetchedAt?: Date;
  lastStatus?: FetchStatus;
  lastError?: string;
  /** Items returned by the last successful fetch. */
  lastItemCount?: number;
  /** Items not seen before in the last successful fetch. */
  lastNewCount?: number;
}

export interface ArticleDoc {
  _id: ObjectId;
  sourceId: ObjectId;
  /** Denormalized for display and filtering without a join. */
  sourceSlug: string;
  sourceName: string;
  /** Stable id from the source (RSS guid, Atom id, Guardian id), falling back to URL. */
  externalId: string;
  url: string;
  title: string;
  summary?: string;
  author?: string;
  section?: string;
  publishedAt: Date;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

/** A normalized item produced by a source adapter, before it is stored. */
export interface ArticleInput {
  externalId: string;
  url: string;
  title: string;
  summary?: string;
  author?: string;
  section?: string;
  publishedAt: Date;
}
