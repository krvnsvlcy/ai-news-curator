import { analyticsOverview, listLetterAnalytics, topStories } from "@curator/db";
import Link from "next/link";
import { BarList } from "@/components/bar-list";
import { PageBody, PageHeader, Panel } from "@/components/page";
import { StatRow, StatTile } from "@/components/stat-tile";
import { requireSession } from "@/lib/auth/session";
import { formatShortCalendarDate } from "@/lib/format";
import { count, percent } from "@/lib/metrics";

export const metadata = { title: "Analytics · AI News Curator" };

const COLS = "md:grid md:grid-cols-[minmax(0,1fr)_repeat(6,84px)] md:items-center md:gap-3";

export default async function AnalyticsPage() {
  await requireSession();
  const [overview, rows, top] = await Promise.all([
    analyticsOverview(),
    listLetterAnalytics(),
    topStories(10),
  ]);
  const perLetterUnique = rows.reduce((n, r) => n + r.uniqueClickers, 0);

  return (
    <>
      <PageHeader
        title="Analytics"
        description={
          overview.letters
            ? `${overview.letters} ${overview.letters === 1 ? "letter" : "letters"} sent to subscribers · test sends excluded`
            : "Engagement with letters sent to subscribers"
        }
      />
      <PageBody>
        {overview.letters === 0 ? (
          <Panel>
            <div className="px-6 py-16 text-center">
              <p className="text-[14px] font-medium">No letters sent yet</p>
              <p className="mt-1 text-[13px] text-muted">
                Send a ready letter to subscribers and clicks and unsubscribes will show up here.
              </p>
              <Link href="/letters" className="mt-3 inline-block text-[13px] underline">
                Go to letters
              </Link>
            </div>
          </Panel>
        ) : (
          <div className="space-y-6">
            <StatRow>
              <StatTile
                label="Emails submitted"
                value={count(overview.submitted)}
                detail={`${count(overview.delivered)} delivered${overview.failed ? ` · ${count(overview.failed)} failed` : ""}`}
              />
              <StatTile
                label="Unique clickers"
                value={count(overview.uniqueClickers)}
                detail={`${percent(perLetterUnique, overview.delivered)} click rate`}
              />
              <StatTile
                label="Total clicks"
                value={count(overview.clicks)}
                detail={
                  overview.uniqueClickers
                    ? `${(overview.clicks / overview.uniqueClickers).toFixed(1)} per clicker`
                    : "No clicks yet"
                }
              />
              <StatTile
                label="Unsubscribes"
                value={count(overview.unsubscribes)}
                detail={`${percent(overview.unsubscribes, overview.delivered)} of delivered`}
              />
            </StatRow>

            <section aria-labelledby="top-stories">
              <h2 id="top-stories" className="mb-2 text-[14px] font-semibold">
                Most-clicked stories
              </h2>
              <Panel>
                {top.length === 0 ? (
                  <p className="px-5 py-10 text-center text-[13px] text-muted">No clicks yet.</p>
                ) : (
                  <BarList
                    unit={["click", "clicks"]}
                    rows={top.map((s) => ({
                      key: `${s.letterId.toHexString()}:${s.storyId}`,
                      name: s.headline,
                      label: s.headline,
                      meta: `${s.sourceName} · story ${s.position} in “${s.letterHeadline || "Untitled"}”, ${formatShortCalendarDate(s.letterDate)}`,
                      href: `/analytics/${s.letterId.toHexString()}`,
                      value: s.clicks,
                      secondary: `${s.uniqueClickers} ${s.uniqueClickers === 1 ? "reader" : "readers"}`,
                    }))}
                  />
                )}
              </Panel>
            </section>

            <section aria-labelledby="by-letter">
              <h2 id="by-letter" className="mb-2 text-[14px] font-semibold">
                By letter
              </h2>
              <Panel>
                <div
                  className={`hidden border-b border-rule bg-canvas px-5 py-2 text-[12px] font-medium text-muted ${COLS}`}
                >
                  <span>Letter</span>
                  <span className="text-right">Submitted</span>
                  <span className="text-right">Delivered</span>
                  <span className="text-right">Clickers</span>
                  <span className="text-right">Click rate</span>
                  <span className="text-right">Clicks</span>
                  <span className="text-right">Unsubs</span>
                </div>
                <ul className="divide-y divide-rule">
                  {rows.map((r) => (
                    <li
                      key={r.letterId.toHexString()}
                      className="relative px-4 py-3 hover:bg-hover/50 sm:px-5"
                    >
                      <div className={COLS}>
                        <div className="min-w-0">
                          <Link
                            href={`/analytics/${r.letterId.toHexString()}`}
                            className="block truncate text-[14px] font-medium after:absolute after:inset-0"
                          >
                            {r.headline || "Untitled letter"}
                          </Link>
                          <p className="text-[12.5px] text-muted">
                            {formatShortCalendarDate(r.date)}
                          </p>
                        </div>
                        <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1 text-[13px] tabular-nums md:contents">
                          <Metric label="Submitted" value={count(r.submitted)} />
                          <Metric label="Delivered" value={count(r.delivered)} />
                          <Metric label="Clickers" value={count(r.uniqueClickers)} />
                          <Metric
                            label="Click rate"
                            value={percent(r.uniqueClickers, r.delivered)}
                          />
                          <Metric label="Clicks" value={count(r.clicks)} />
                          <Metric label="Unsubs" value={count(r.unsubscribes)} />
                        </dl>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            </section>

            <p className="text-[12px] text-muted">
              Readers are counted by an anonymous id; no addresses are stored. Some mail providers
              open links automatically to scan them, which can add clicks.
            </p>
          </div>
        )}
      </PageBody>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="md:text-right">
      <dt className="text-[11.5px] text-muted md:sr-only">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
