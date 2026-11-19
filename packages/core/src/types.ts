export interface Source {
  id: string;
  name: string;
  feedUrl: string;
}

export interface Article {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  summary?: string;
  publishedAt: string; // ISO 8601
}

export interface CuratedArticle extends Article {
  score: number; // 0..1, higher is more relevant
  tags: string[];
}
