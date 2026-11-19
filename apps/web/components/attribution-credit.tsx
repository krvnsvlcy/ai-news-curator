import type { Attribution } from "@/lib/attribution";

/** Subtle "Built by …" credit. Renders nothing without an attribution. */
export function AttributionCredit({
  attribution,
  className = "",
}: {
  attribution: Attribution | null | undefined;
  className?: string;
}) {
  if (!attribution) return null;
  return (
    <p className={`text-[12px] text-muted/70 ${className}`}>
      Built by{" "}
      {attribution.url ? (
        <a
          href={attribution.url}
          target="_blank"
          rel="noopener"
          className="underline decoration-muted/30 underline-offset-2 transition-colors hover:text-ink hover:decoration-ink/40"
        >
          {attribution.name}
        </a>
      ) : (
        attribution.name
      )}
    </p>
  );
}
