// Newsroom is UK-based; show times in UK local time regardless of server TZ.
const TZ = "Europe/London";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: TZ });
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TZ,
});
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function formatDate(d: Date): string {
  return dateFmt.format(d);
}

export function formatDateTime(d: Date): string {
  return dateTimeFmt.format(d);
}

/** "5 min ago", "3 hours ago", falling back to a date after a week. */
export function timeAgo(d: Date, now = new Date()): string {
  const s = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return "just now";
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(s / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(s / 86400), "day");
  return formatDate(d);
}

export function formatInterval(minutes: number): string {
  if (minutes < 60) return `every ${minutes} min`;
  if (minutes === 60) return "hourly";
  if (minutes < 1440) return `every ${minutes / 60} hours`;
  return "daily";
}
