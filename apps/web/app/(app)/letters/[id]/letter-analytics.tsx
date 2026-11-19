import type { letterAnalytics } from "@curator/db";
import { BarList } from "@/components/bar-list";
import { Panel } from "@/components/page";
import { StatRow, StatTile } from "@/components/stat-tile";
import { count, percent } from "@/lib/metrics";

type Data = NonNullable<Awaited<ReturnType<typeof letterAnalytics>>>;

/** Delivery and click stats for a published letter (shown in the editor's Analytics view). */
export function LetterAnalytics({ data: { row, stories } }: { data: Data }) {
  return (
    <div className="space-y-6">
      {row.sends === 0 && (
        <p className="rounded-md border border-rule bg-paper px-3 py-2 text-[13px] text-muted">
          This letter wasn't emailed to any subscribers, so there's nothing to measure yet.
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
  );
}
