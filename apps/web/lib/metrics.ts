export function percent(part: number, whole: number): string {
  if (whole <= 0) return "–";
  const p = (part / whole) * 100;
  return `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)}%`;
}

export function count(n: number): string {
  return n.toLocaleString("en-GB");
}

/** Value formats by name, so a server component can tell a client chart how to format. */
export type ValueFormat = "count" | "percent";

/** "percent" takes a 0–1 ratio. */
export function formatValue(v: number, format: ValueFormat): string {
  if (format === "percent") {
    // One decimal under 10% (4.5%), but never a bare ".0" (5%, not 5.0%).
    return `${(v * 100).toFixed(v > 0 && v < 0.1 ? 1 : 0).replace(/\.0$/, "")}%`;
  }
  return count(v);
}
