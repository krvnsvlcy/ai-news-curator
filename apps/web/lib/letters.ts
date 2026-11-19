// Serializable letter shapes shared by server actions and client components.
// Client code must import only from here or @curator/newsletter, never @curator/db.
import type { NewsletterLetter } from "@curator/newsletter";

export type LetterStatus = "draft" | "ready" | "published";

export interface EditorStory {
  id: string;
  articleId: string | null;
  headline: string;
  description: string;
  original: {
    title: string;
    url: string;
    sourceName: string;
    publishedAt?: string;
    summary?: string;
  };
}

export interface EditorLetterContent {
  headline: string;
  date: string;
  briefing: string;
  tone: string;
  stories: EditorStory[];
}

export interface EditorSend {
  at: string;
  kind: "test" | "subscribers";
  recipients: number;
  delivered: number;
  failed: number;
}

export interface EditorLetter extends EditorLetterContent {
  id: string;
  status: LetterStatus;
  revision: number;
  updatedAt: string;
  publishedAt?: string;
  sends: EditorSend[];
}

export interface PickerArticle {
  id: string;
  title: string;
  url: string;
  summary?: string;
  sourceName: string;
  sourceSlug: string;
  section?: string;
  publishedAt: string;
}

export function contentOf(l: EditorLetterContent): EditorLetterContent {
  return {
    headline: l.headline,
    date: l.date,
    briefing: l.briefing,
    tone: l.tone,
    stories: l.stories,
  };
}

export function toNewsletterLetter(l: {
  headline: string;
  date: string;
  briefing: string;
  stories: {
    headline: string;
    description: string;
    original: { title: string; url: string; sourceName: string };
  }[];
}): NewsletterLetter {
  return {
    headline: l.headline,
    date: l.date,
    briefing: l.briefing,
    stories: l.stories.map((s) => ({
      headline: s.headline,
      description: s.description,
      originalTitle: s.original.title,
      sourceName: s.original.sourceName,
      url: s.original.url,
    })),
  };
}

export const STATUS_LABEL: Record<LetterStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  published: "Published",
};
