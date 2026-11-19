import { type Article, type CuratedArticle, curate } from "@curator/core";
import { requireSession } from "@/lib/auth/session";

// Placeholder data until the worker persists articles to MongoDB.
const sample: Article[] = [
  {
    id: "1",
    sourceId: "news.ycombinator.com",
    title: "Open source LLM agent sets new benchmark",
    url: "https://example.com/1",
    summary:
      "A small team released an agent framework that tops a widely used coding benchmark, and published every eval transcript alongside it.",
    publishedAt: "2026-11-19T09:00:00Z",
  },
  {
    id: "2",
    sourceId: "example.com",
    title: "Faster inference for small models",
    url: "https://example.com/2",
    summary:
      "A look at quantization, speculative decoding and the AI accelerators shipping this year.",
    publishedAt: "2026-11-18T12:00:00Z",
  },
];

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export default async function Home() {
  await requireSession();
  const items = curate(sample);

  return (
    <main className="mx-auto max-w-[680px] px-4 pt-12 pb-24 sm:px-6">
      <p className="text-[13px] font-medium tracking-wide text-muted uppercase">Today’s picks</p>
      <h1 className="mt-2 font-serif text-[32px] leading-tight font-bold tracking-tight sm:text-[42px]">
        What’s worth reading in AI
      </h1>

      {items.length === 0 ? (
        <p className="mt-16 font-serif text-xl text-muted">
          Nothing curated yet. Run the worker to pull in articles.
        </p>
      ) : (
        <ol className="mt-10 divide-y divide-rule border-t border-rule">
          {items.map((a) => (
            <ArticleRow key={a.id} article={a} />
          ))}
        </ol>
      )}
    </main>
  );
}

function ArticleRow({ article: a }: { article: CuratedArticle }) {
  return (
    <li className="py-8">
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <span className="font-medium text-ink">{a.sourceId}</span>
        <span aria-hidden>·</span>
        <time dateTime={a.publishedAt}>{dateFmt.format(new Date(a.publishedAt))}</time>
      </div>

      <a href={a.url} target="_blank" rel="noreferrer" className="group mt-2 block">
        <h2 className="font-serif text-[22px] leading-snug font-bold tracking-tight group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4 sm:text-2xl">
          {a.title}
        </h2>
        {a.summary && (
          <p className="mt-2 line-clamp-3 font-serif text-[17px] leading-relaxed text-muted sm:text-lg">
            {a.summary}
          </p>
        )}
      </a>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {a.tags.map((t) => (
          <span key={t} className="rounded-full bg-chip px-3 py-1 text-[13px] text-ink">
            {t}
          </span>
        ))}
        <span className="ml-auto text-[13px] text-muted tabular-nums" title="Relevance score">
          {Math.round(a.score * 100)}% match
        </span>
      </div>
    </li>
  );
}
