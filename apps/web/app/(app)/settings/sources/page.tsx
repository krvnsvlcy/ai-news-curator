import { countArticlesBySource, listSources, type SourceDoc } from "@curator/db";
import Link from "next/link";
import { buttonClass } from "@/components/button-styles";
import { PlusIcon } from "@/components/icons";
import { PageBody, PageHeader, Panel } from "@/components/page";
import { SubmitButton } from "@/components/submit-button";
import { requireSession } from "@/lib/auth/session";
import { formatDateTime, formatInterval, timeAgo } from "@/lib/format";
import { fetchSourceNowAction, seedDefaultsAction, toggleSourceAction } from "./actions";

export const metadata = { title: "Sources · AI News Curator" };

const COLS = "md:grid md:grid-cols-[minmax(0,1fr)_170px_80px_110px_auto] md:items-center md:gap-4";

export default async function SourcesPage() {
  await requireSession();
  const [sources, counts] = await Promise.all([listSources(), countArticlesBySource()]);
  const failing = sources.filter((s) => s.enabled && s.lastStatus === "error").length;

  return (
    <>
      <PageHeader
        title="Sources"
        description={
          <>
            <Link href="/settings" className="hover:text-ink hover:underline">
              Settings
            </Link>{" "}
            /{" "}
            {sources.length === 0
              ? "Where stories come from."
              : `${sources.filter((s) => s.enabled).length} active of ${sources.length}${failing ? ` · ${failing} failing` : ""}`}
          </>
        }
        actions={
          <Link href="/settings/sources/new" className={buttonClass("primary")}>
            <PlusIcon className="size-4" /> New source
          </Link>
        }
      />
      <PageBody>
        <Panel>
          {sources.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-[14px] font-medium">No sources yet</p>
              <p className="mt-1 text-[13px] text-muted">
                Start with the defaults: Sky News, The Guardian, GOV.UK and UK Parliament.
              </p>
              <form action={seedDefaultsAction} className="mt-4">
                <SubmitButton variant="secondary" pendingText="Adding…">
                  Add default sources
                </SubmitButton>
              </form>
            </div>
          ) : (
            <>
              <div
                className={`hidden border-b border-rule bg-canvas px-5 py-2 text-[12px] font-medium text-muted ${COLS}`}
              >
                <span>Source</span>
                <span>Last fetch</span>
                <span className="text-right">Stories</span>
                <span>Schedule</span>
                <span className="w-[164px]" />
              </div>
              <ul className="divide-y divide-rule">
                {sources.map((s) => (
                  <SourceRow
                    key={s._id.toHexString()}
                    source={s}
                    articleCount={counts.get(s._id.toHexString()) ?? 0}
                  />
                ))}
              </ul>
            </>
          )}
        </Panel>
      </PageBody>
    </>
  );
}

function endpoint(s: SourceDoc): string {
  if (s.config.kind === "feed") return s.config.url;
  const parts = ["Guardian API", s.config.section, s.config.query && `“${s.config.query}”`];
  return parts.filter(Boolean).join(" · ");
}

function SourceRow({ source: s, articleCount }: { source: SourceDoc; articleCount: number }) {
  const id = s._id.toHexString();
  return (
    <li className="px-4 py-3.5 sm:px-5">
      <div className={`space-y-2 md:space-y-0 ${COLS}`}>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              href={`/settings/sources/${id}`}
              className="truncate text-[14.5px] font-medium hover:underline"
            >
              {s.name}
            </Link>
            <span className="rounded-sm bg-chip px-1.5 py-0.5 text-[11px] font-medium text-muted uppercase">
              {s.config.kind === "feed" ? "RSS" : "API"}
            </span>
            {!s.enabled && (
              <span className="rounded-sm border border-rule px-1.5 py-0.5 text-[11px] text-muted">
                Paused
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-[12.5px] text-muted">{endpoint(s)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 md:contents">
          <div className="text-[13px]">
            <Status source={s} />
          </div>

          <div className="text-[13px] md:text-right">
            <Link href={`/feed?source=${s.slug}`} className="tabular-nums hover:underline">
              {articleCount.toLocaleString("en-GB")}
              <span className="text-muted md:hidden"> stories</span>
            </Link>
          </div>

          <div className="text-[13px] text-muted">{formatInterval(s.fetchIntervalMinutes)}</div>
        </div>

        <div className="flex items-center gap-1.5 pt-1 md:justify-end md:pt-0">
          <form action={fetchSourceNowAction.bind(null, id)}>
            <SubmitButton variant="secondary" pendingText="Fetching…" className="w-[84px]">
              Fetch now
            </SubmitButton>
          </form>
          <form action={toggleSourceAction.bind(null, id, !s.enabled)}>
            <SubmitButton variant="secondary" className="w-[72px]">
              {s.enabled ? "Pause" : "Resume"}
            </SubmitButton>
          </form>
        </div>
      </div>

      {s.lastStatus === "error" && s.lastError && (
        <p className="mt-2.5 rounded-md border border-red-600/20 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          {s.lastError}
        </p>
      )}
    </li>
  );
}

function Status({ source: s }: { source: SourceDoc }) {
  if (!s.lastFetchedAt) {
    return (
      <span className="inline-flex items-center gap-1.5 text-muted">
        <Dot className="bg-muted/50" /> Never fetched
      </span>
    );
  }
  const when = (
    <time dateTime={s.lastFetchedAt.toISOString()} title={formatDateTime(s.lastFetchedAt)}>
      {timeAgo(s.lastFetchedAt)}
    </time>
  );
  if (s.lastStatus === "error") {
    return (
      <span className="inline-flex items-center gap-1.5 text-red-700">
        <Dot className="bg-red-600" />
        <span>Failed {when}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <Dot className="bg-accent" />
      <span>
        {when}
        {s.lastNewCount !== undefined && (
          <span className="text-muted"> · {s.lastNewCount} new</span>
        )}
      </span>
    </span>
  );
}

function Dot({ className }: { className: string }) {
  return <span aria-hidden className={`inline-block size-2 shrink-0 rounded-full ${className}`} />;
}
