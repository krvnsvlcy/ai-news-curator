"use client";

import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import { formatValue, type ValueFormat } from "@/lib/metrics";

export interface LinePoint {
  /** YYYY-MM-DD */
  day: string;
  /** null leaves a gap (no data for that day). */
  value: number | null;
}

const HEIGHT = 168;
const PAD = { top: 12, right: 12, bottom: 24, left: 44 };

function formatDay(day: string, long = false) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(long ? { weekday: "short" } : {}),
    timeZone: "UTC",
  });
}

/** Round tick step: 1, 2 or 5 × 10^n, giving about `count` intervals. */
function niceTicks(max: number, count = 3): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  let t = 0;
  for (; t <= max + step * 1e-9; t += step) ticks.push(Number(t.toPrecision(12)));
  if (t - step < max) ticks.push(Number(t.toPrecision(12)));
  return ticks;
}

/**
 * Single-series line chart over days: 2px line, end dot, hairline grid, and a
 * crosshair tooltip on hover or arrow keys. The title (outside) names the series.
 */
export function LineChart({
  points,
  format,
  label,
  minTop = 0,
}: {
  points: LinePoint[];
  format: ValueFormat;
  /** Accessible name, e.g. "Open rate, last 30 days". */
  label: string;
  /** Lowest the y-axis top may be, so tiny values don't fill the plot (e.g. 0.1 for rates). */
  minTop?: number;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => entry && setWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const values = points.map((p) => p.value).filter((v): v is number => v !== null);
  const dataMax = values.length ? Math.max(...values) : 0;
  const ticks = niceTicks(Math.max(dataMax, minTop));
  const top = ticks[ticks.length - 1] ?? 1;
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) =>
    PAD.left + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (top ? (v / top) * innerH : 0);

  // Path with gaps at nulls.
  let d = "";
  let pen = false;
  points.forEach((p, i) => {
    if (p.value === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
    pen = true;
  });
  const lastIdx = points.findLastIndex((p) => p.value !== null);
  const xLabels = points.length
    ? [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])]
    : [];

  function onMove(e: PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const t = (e.clientX - r.left) / Math.max(1, r.width);
    setActive(Math.round(Math.min(1, Math.max(0, t)) * (points.length - 1)));
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setActive((a) => {
      const cur = a ?? points.length - 1;
      return Math.min(points.length - 1, Math.max(0, cur + (e.key === "ArrowRight" ? 1 : -1)));
    });
  }

  const a = active !== null ? points[active] : null;
  // The dot marks the hovered day, or the latest value when idle.
  const dotIdx = active ?? lastIdx;
  const dotValue = points[dotIdx]?.value ?? null;

  return (
    // Arrow keys step through days, so the chart is exposed as a slider over them.
    <div
      ref={wrap}
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={Math.max(0, points.length - 1)}
      aria-valuenow={dotIdx}
      aria-valuetext={
        points[dotIdx]
          ? `${formatDay(points[dotIdx].day, true)}: ${dotValue === null ? "no data" : formatValue(dotValue, format)}`
          : "No data"
      }
      tabIndex={0}
      onKeyDown={onKey}
      onBlur={() => setActive(null)}
      className="relative w-full rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      style={{ height: HEIGHT }}
    >
      {width > 0 && (
        <svg width={width} height={HEIGHT} aria-hidden="true" className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={width - PAD.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-rule)"
                strokeWidth={1}
                shapeRendering="crispEdges"
              />
              <text
                x={PAD.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                className="fill-muted text-[11px] tabular-nums"
              >
                {formatValue(t, format)}
              </text>
            </g>
          ))}
          {xLabels.map((i) => (
            <text
              key={i}
              x={x(i)}
              y={HEIGHT - 6}
              textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"}
              className="fill-muted text-[11px]"
            >
              {formatDay(points[i]?.day ?? "")}
            </text>
          ))}
          {active !== null && (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PAD.top}
              y2={PAD.top + innerH}
              stroke="var(--color-muted)"
              strokeOpacity={0.5}
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          )}
          <path
            d={d}
            fill="none"
            stroke="var(--color-series-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {dotValue !== null && (
            <circle
              cx={x(dotIdx)}
              cy={y(dotValue)}
              r={4}
              fill="var(--color-series-1)"
              stroke="var(--color-paper)"
              strokeWidth={2}
            />
          )}
          {/* Hit layer: the whole plot finds the nearest day. */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            onPointerMove={onMove}
            onPointerLeave={() => setActive(null)}
          />
        </svg>
      )}
      {a && (
        <div
          className="pointer-events-none absolute top-0 z-10 rounded-md border border-rule bg-paper px-2.5 py-1.5 text-[12px] shadow-sm"
          style={{
            left: Math.min(Math.max(x(active ?? 0) - 60, 0), Math.max(0, width - 120)),
          }}
        >
          <p className="text-[13px] font-semibold tabular-nums text-ink">
            {a.value === null ? "No data" : formatValue(a.value, format)}
          </p>
          <p className="text-muted">{formatDay(a.day, true)}</p>
        </div>
      )}
    </div>
  );
}
