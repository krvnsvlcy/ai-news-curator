export type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";

/** Shared by server and client components, so it must not live in a "use client" file. */
export function buttonClass(variant: ButtonVariant): string {
  const base =
    "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[13px] font-medium whitespace-nowrap transition-colors disabled:cursor-wait disabled:opacity-50";
  switch (variant) {
    case "primary":
      return `${base} bg-primary text-paper hover:bg-primary-hover`;
    case "secondary":
      return `${base} border border-rule bg-paper text-ink hover:bg-hover`;
    case "quiet":
      return `${base} text-muted hover:bg-hover hover:text-ink`;
    case "danger":
      return `${base} border border-red-600/30 bg-paper text-red-700 hover:bg-red-50`;
  }
}
