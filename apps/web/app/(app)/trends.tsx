import { dayKey, getDailyStats } from "@curator/db";
import Link from "next/link";
import { LineChart, type LinePoint } from "@/components/line-chart";
import { Panel } from "@/components/page";
import { count, formatValue } from "@/lib/metrics";

export const RANGES = [7, 30, 90] as const;
export type Range = (typeof RANGES)[number];
/** Rates use a trailing window so opens/clicks that land days after a send still count. */
const WINDOW = 7;

export function parseRange(v: unknown): Range {
  const n = Number(v);
  return (RANGES as readonly number[]).includes(n) ? (n as Range) : 30;
}

function addDays(day: string, n: number) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return dayKey(d);
}

const pct = (v: number) => formatValue(v, "percent");

export function RangePicker({
  range,
  keep = {},
}: {
  range: Range;
  /** Other query params of the page to keep in the links. */
  keep?: Record<string, string>;
}) {
  const hrefFor = (r: Range) => {
    const p = new URLSearchParams(keep);
    if (r !== 30) p.set("range", String(r));
    const q = p.toString();
    return q ? `/?${q}` : "/";
  };
  return (
    <nav aria-label="Date range" className="flex gap-1.5">
      {RANGES.map((r) => (
        <Link
          key={r}
          href={hrefFor(r)}
          scroll={false}
          aria-current={r === range ? "page" : undefined}
          className="rounded-md border border-rule bg-paper px-2.5 py-1 text-[13px] text-muted transition-colors hover:text-ink aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-paper"
        >
          {r} days
        </Link>
      ))}
    </nav>
  );
}

/**
 * Subscriber count, open rate and click rate over time, from the daily counters
 * (one document per day, no aggregation).
 */
export async function Trends({ range }: { range: Range }) {
  const to = dayKey();
  const from = addDays(to, -(range - 1));
  // Fetch WINDOW−1 extra days so the first point's trailing window is complete.
  const days = await getDailyStats(addDays(from, -(WINDOW - 1)), to);
  const shown = days.slice(WINDOW - 1);

  // Each shown day plus its trailing-window rates.
  const rows = shown.map((d, i) => {
    const win = days.slice(i, i + WINDOW);
    const delivered = win.reduce((n, w) => n + w.delivered, 0);
    const opens = win.reduce((n, w) => n + w.uniqueOpens, 0);
    const clicks = win.reduce((n, w) => n + w.uniqueClicks, 0);
    return {
      ...d,
      // No email delivered in the window: no rate (a gap, not 0%).
      openRate: delivered ? Math.min(1, opens / delivered) : null,
      clickRate: delivered ? Math.min(1, clicks / delivered) : null,
    };
  });

  const series = {
    subscribers: rows.map((r): LinePoint => ({ day: r.day, value: r.subscribers })),
    open: rows.map((r): LinePoint => ({ day: r.day, value: r.openRate })),
    click: rows.map((r): LinePoint => ({ day: r.day, value: r.clickRate })),
  };
  const last = <T,>(xs: T[]) => xs[xs.length - 1];
  const latest = (pts: LinePoint[]) => [...pts].reverse().find((p) => p.value !== null)?.value;
  const subsNow = last(rows)?.subscribers ?? null;
  // Change across the range, from the total the day before it starts; if
  // tracking began inside the range, from the first known day instead.
  const before = days[WINDOW - 2]?.subscribers ?? null;
  const firstKnown = rows.find((r) => r.subscribers !== null);
  const base = before ?? firstKnown?.subscribers ?? null;
  const since =
    before !== null || !firstKnown
      ? `in ${range} days`
      : `since ${new Date(`${firstKnown.day}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`;
  const subsChange = subsNow !== null && base !== null ? subsNow - base : null;

  const cards = [
    {
      key: "subscribers",
      title: "Subscribers",
      value: subsNow === null ? "–" : count(subsNow),
      detail:
        subsChange === null
          ? "Tracking starts with the next change"
          : `${subsChange >= 0 ? "+" : "−"}${count(Math.abs(subsChange))} ${since}`,
      points: series.subscribers,
      format: "count" as const,
      minTop: 5,
    },
    {
      key: "open",
      title: "Open rate",
      value: latest(series.open) !== undefined ? pct(latest(series.open) as number) : "–",
      detail: `Unique opens ÷ delivered, trailing ${WINDOW} days`,
      points: series.open,
      format: "percent" as const,
      minTop: 0.1,
    },
    {
      key: "click",
      title: "Click rate",
      value: latest(series.click) !== undefined ? pct(latest(series.click) as number) : "–",
      detail: `Unique clicks ÷ delivered, trailing ${WINDOW} days`,
      points: series.click,
      format: "percent" as const,
      minTop: 0.1,
    },
  ];

  return (
    <section aria-labelledby="trends" className="space-y-3">
      <h2 id="trends" className="sr-only">
        Trends
      </h2>
      <div className="grid gap-3 xl:grid-cols-3">
        {cards.map((c) => (
          <Panel key={c.key}>
            <div className="px-4 pt-3.5 pb-2">
              <p className="text-[12.5px] text-muted">{c.title}</p>
              <p className="text-[22px] font-semibold tracking-tight tabular-nums">{c.value}</p>
              <p className="text-[12px] text-muted">{c.detail}</p>
            </div>
            <div className="px-2 pb-2">
              <LineChart
                points={c.points}
                format={c.format}
                minTop={c.minTop}
                label={`${c.title}, last ${range} days`}
              />
            </div>
          </Panel>
        ))}
      </div>
      <p className="text-[12px] text-muted">
        Days are UTC. Opens come from an image in each email, so they're approximate: some mail apps
        block images, and some (like Apple Mail) load them without the reader opening the email.
        Test sends are never counted.
      </p>
    </section>
  );
}
