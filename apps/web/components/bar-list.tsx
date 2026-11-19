import Link from "next/link";
import type { ReactNode } from "react";

export interface BarListRow {
  key: string;
  label: ReactNode;
  /** Plain-text name for the accessible label and tooltip. */
  name: string;
  meta?: ReactNode;
  href?: string;
  value: number;
  /** Shown after the value, e.g. "3 readers". */
  secondary?: string;
}

/**
 * One series of magnitudes as aligned horizontal bars: a name, a bar and a figure
 * per row. Thin 8px bars, rounded at the data end and square at the baseline; the
 * figure is always printed, so the bar is never the only way to read the value.
 */
export function BarList({
  rows,
  unit,
}: {
  rows: BarListRow[];
  unit: [singular: string, plural: string];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="divide-y divide-rule">
      {rows.map((r) => {
        const tip = `${r.name}: ${r.value.toLocaleString("en-GB")} ${r.value === 1 ? unit[0] : unit[1]}${r.secondary ? `, ${r.secondary}` : ""}`;
        const body = (
          <>
            <div className="flex items-baseline justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium">{r.label}</p>
                {r.meta && <p className="truncate text-[12.5px] text-muted">{r.meta}</p>}
              </div>
              <p className="shrink-0 text-right text-[13px] tabular-nums">
                <span className="font-semibold">{r.value.toLocaleString("en-GB")}</span>
                {r.secondary && <span className="text-muted"> · {r.secondary}</span>}
              </p>
            </div>
            <div className="mt-2 h-2 w-full" aria-hidden>
              {r.value > 0 && (
                <div
                  className="h-2 rounded-r-[4px] bg-series-1"
                  style={{ width: `${Math.max(1, (r.value / max) * 100)}%` }}
                />
              )}
            </div>
          </>
        );
        return (
          <li key={r.key} title={tip}>
            {r.href ? (
              <Link
                href={r.href}
                aria-label={tip}
                className="block px-4 py-3 hover:bg-hover/60 focus-visible:bg-hover/60 sm:px-5"
              >
                {body}
              </Link>
            ) : (
              <div className="px-4 py-3 sm:px-5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
