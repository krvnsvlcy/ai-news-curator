import { letterAnalytics } from "@curator/db";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarList } from "@/components/bar-list";
import { buttonClass } from "@/components/button-styles";
import { PageBody, PageHeader, Panel } from "@/components/page";
import { StatRow, StatTile } from "@/components/stat-tile";
import { requireSession } from "@/lib/auth/session";
import { formatShortCalendarDate } from "@/lib/format";
import { count, percent } from "@/lib/metrics";

export const metadata = { title: "Letter analytics · AI News Curator" };

export default async function LetterAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const data = await letterAnalytics(id);
  if (!data) notFound();
  const { row, stories } = data;

  return (
    <>
      <PageHeader
        title={row.headline || "Untitled letter"}
        description={
          <>
            <Link href="/analytics" className="hover:text-ink hover:underline">
              Analytics
            </Link>{" "}
            / {formatShortCalendarDate(row.date)}
          </>
        }
        actions={
          <Link href={`/letters/${id}`} className={buttonClass("secondary")}>
            Open letter
          </Link>
        }
      />
      <PageBody>
        <div className="space-y-6">
          {row.sends === 0 && (
            <p className="rounded-md border border-rule bg-paper px-3 py-2 text-[13px] text-muted">
              This letter hasn't been sent to subscribers yet. Test sends aren't counted.
            </p>
          )}
          <StatRow>
            <StatTile
              label="Emails submitted"
              value={count(row.submitted)}
              detail={`${count(row.delivered)} delivered${row.failed ? ` · ${count(row.failed)} failed` : ""}${row.sends > 1 ? ` · ${row.sends} sends` : ""}`}
            />
            <StatTile
              label="Unique clickers"
              value={count(row.uniqueClickers)}
              detail={`${percent(row.uniqueClickers, row.delivered)} click rate`}
            />
            <StatTile
              label="Total clicks"
              value={count(row.clicks)}
              detail={
                row.uniqueClickers
                  ? `${(row.clicks / row.uniqueClickers).toFixed(1)} per clicker`
                  : "No clicks yet"
              }
            />
            <StatTile
              label="Unsubscribes"
              value={count(row.unsubscribes)}
              detail={`${percent(row.unsubscribes, row.delivered)} of delivered`}
            />
          </StatRow>

          <section aria-labelledby="per-story">
            <h2 id="per-story" className="mb-2 text-[14px] font-semibold">
              Clicks per story <span className="font-normal text-muted">in letter order</span>
            </h2>
            <Panel>
              <BarList
                unit={["click", "clicks"]}
                rows={stories.map((s) => ({
                  key: s.storyId,
                  name: s.headline,
                  label: (
                    <>
                      <span className="mr-2 text-[12px] text-muted tabular-nums">
                        {String(s.position).padStart(2, "0")}
                      </span>
                      {s.headline}
                    </>
                  ),
                  meta: `${s.sourceName} · ${s.originalTitle}`,
                  value: s.clicks,
                  secondary: `${s.uniqueClickers} ${s.uniqueClickers === 1 ? "reader" : "readers"} · ${percent(s.uniqueClickers, row.delivered)}`,
                }))}
              />
            </Panel>
          </section>
        </div>
      </PageBody>
    </>
  );
}
