import type { ArticleDoc, LetterDoc } from "@curator/db";
import type { EditorLetter, PickerArticle } from "./letters";

export function serializeLetter(l: LetterDoc): EditorLetter {
  return {
    id: l._id.toHexString(),
    status: l.status,
    revision: l.revision,
    headline: l.headline,
    date: l.date,
    briefing: l.briefing,
    tone: l.tone,
    updatedAt: l.updatedAt.toISOString(),
    ...(l.publishedAt ? { publishedAt: l.publishedAt.toISOString() } : {}),
    sends: (l.sends ?? []).map((x) => ({ ...x, at: x.at.toISOString() })),
    stories: l.stories.map((s) => ({
      id: s.id,
      articleId: s.articleId ? s.articleId.toHexString() : null,
      headline: s.headline,
      description: s.description,
      original: {
        title: s.original.title,
        url: s.original.url,
        sourceName: s.original.sourceName,
        ...(s.original.publishedAt ? { publishedAt: s.original.publishedAt.toISOString() } : {}),
        ...(s.original.summary ? { summary: s.original.summary } : {}),
      },
    })),
  };
}

export function serializeArticle(a: ArticleDoc): PickerArticle {
  return {
    id: a._id.toHexString(),
    title: a.title,
    url: a.url,
    ...(a.summary ? { summary: a.summary } : {}),
    sourceName: a.sourceName,
    sourceSlug: a.sourceSlug,
    ...(a.section ? { section: a.section } : {}),
    publishedAt: a.publishedAt.toISOString(),
  };
}
