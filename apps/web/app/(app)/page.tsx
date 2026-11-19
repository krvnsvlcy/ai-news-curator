import { type ArticleDoc, listArticles, listSources } from "@curator/db";
import Link from "next/link";
import { buttonClass } from "@/components/button-styles";
import { PageBody, PageHeader, Panel } from "@/components/page";
import { requireSession } from "@/lib/auth/session";
import { formatDateTime, timeAgo } from "@/lib/format";

export const metadata = { title: "Feed · AI News Curator" };

const PAGE_SIZE = 50;

export default async function FeedPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; before?: string }>;
}) {
  await requireSession();
  const { source, before } = await searchParams;
  const beforeDate = before ? new Date(before) : undefined;
  const validBefore = beforeDate && !Number.isNaN(beforeDate.getTime()) ? beforeDate : undefined;

  const [sources, articles] = await Promise.all([
    listSources(),
    listArticles({ sourceSlug: source, limit: PAGE_SIZE, before: validBefore }),
  ]);
  const active = sources.find((s) => s.slug === source);
  const last = articles.at(-1);
  const olderHref =
    articles.length === PAGE_SIZE && last
      ? `/?${new URLSearchParams({ ...(source ? { source } : {}), before: last.publishedAt.toISOString() })}`
      : null;

  return (
    <>
      <PageHeader
        title="Feed"
        description={
          active
            ? `Latest stories from ${active.name}`
            : `Latest stories from ${sources.length} ${sources.length === 1 ? "source" : "sources"}`
        }
        actions={
          <Link href="/sources" className={buttonClass("secondary")}>
            Manage sources
          </Link>
        }
      />
      <PageBody>
        {sources.length > 0 && (
          <nav aria-label="Filter by source" className="mb-4 flex flex-wrap gap-1.5">
            <FilterTab href="/" active={!source}>
              All
            </FilterTab>
            {sources.map((s) => (
              <FilterTab key={s.slug} href={`/?source=${s.slug}`} active={s.slug === source}>
                {s.name}
              </FilterTab>
            ))}
          </nav>
        )}

        <Panel>
          {articles.length === 0 ? (
            <EmptyState hasSources={sources.length > 0} filtered={Boolean(source || before)} />
          ) : (
            <ol className="divide-y divide-rule">
              {articles.map((a) => (
                <ArticleRow key={a._id.toHexString()} article={a} showSource={!source} />
              ))}
            </ol>
          )}
        </Panel>

        {(olderHref || before) && (
          <div className="mt-4 flex items-center justify-between">
            {before ? (
              <Link href={source ? `/?source=${source}` : "/"} className={buttonClass("quiet")}>
                ← Latest
              </Link>
            ) : (
              <span />
            )}
            {olderHref && (
              <Link href={olderHref} className={buttonClass("secondary")}>
                Older →
              </Link>
            )}
          </div>
        )}
      </PageBody>
    </>
  );
}

function FilterTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="rounded-md border border-rule bg-paper px-2.5 py-1 text-[13px] text-muted transition-colors hover:text-ink aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-paper"
    >
      {children}
    </Link>
  );
}

function ArticleRow({ article: a, showSource }: { article: ArticleDoc; showSource: boolean }) {
  return (
    <li className="group relative flex gap-4 px-4 py-3 transition-colors hover:bg-hover/60 sm:px-5">
      <div className="min-w-0 flex-1">
        <a
          href={a.url}
          target="_blank"
          rel="noreferrer"
          className="text-[14.5px] leading-snug font-medium after:absolute after:inset-0"
        >
          {a.title}
        </a>
        {a.summary && <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{a.summary}</p>}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted sm:hidden">
          {showSource && <span className="font-medium text-ink">{a.sourceName}</span>}
          <Time date={a.publishedAt} />
        </div>
      </div>
      <div className="hidden w-48 shrink-0 flex-col items-end gap-1 text-right sm:flex">
        {showSource && (
          <span className="max-w-full truncate rounded bg-chip px-1.5 py-0.5 text-[12px] font-medium">
            {a.sourceName}
          </span>
        )}
        <span className="max-w-full truncate text-[12px] text-muted">
          {a.section && <>{a.section} · </>}
          <Time date={a.publishedAt} />
        </span>
      </div>
    </li>
  );
}

function Time({ date }: { date: Date }) {
  return (
    <time dateTime={date.toISOString()} title={formatDateTime(date)}>
      {timeAgo(date)}
    </time>
  );
}

function EmptyState({ hasSources, filtered }: { hasSources: boolean; filtered: boolean }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-[14px] font-medium">
        {filtered ? "No stories here yet" : hasSources ? "No stories yet" : "No sources configured"}
      </p>
      <p className="mt-1 text-[13px] text-muted">
        {filtered
          ? "Try another source or come back after the next fetch."
          : hasSources
            ? "Fetch a source to pull in the latest news."
            : "Add sources to start pulling in news."}
      </p>
      {!filtered && (
        <Link href="/sources" className={`${buttonClass("secondary")} mt-4`}>
          Go to sources
        </Link>
      )}
    </div>
  );
}
