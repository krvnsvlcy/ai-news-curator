export function percent(part: number, whole: number): string {
  if (whole <= 0) return "–";
  const p = (part / whole) * 100;
  return `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)}%`;
}

export function count(n: number): string {
  return n.toLocaleString("en-GB");
}
