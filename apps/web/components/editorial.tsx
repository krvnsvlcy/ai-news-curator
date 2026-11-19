import Link from "next/link";

// Editorial look for pages outside the dashboard: serif type, paper page,
// underline inputs, ink pill buttons. Uses the shared color tokens.

export function EditorialWordmark({
  name = "Curator",
  href = "/",
  className = "",
}: {
  name?: string;
  href?: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`font-serif text-2xl font-bold tracking-tight text-ink ${className}`}
    >
      {name}
    </Link>
  );
}

/** Bottom line only: no box, radius, shadow or focus ring; the line darkens on focus. */
export const editorialInput =
  "block w-full appearance-none rounded-none border-0 border-b border-ink/30 bg-transparent px-0 py-3 text-xl text-ink shadow-none outline-none ring-0 transition-colors placeholder:text-muted/50 focus:border-ink focus:ring-0 focus:outline-none aria-[invalid=true]:border-danger [&:-webkit-autofill]:[-webkit-text-fill-color:var(--color-ink)] [&:-webkit-autofill]:[transition:background-color_9999s]";

/** Large pill that sizes to its label. */
export const editorialButton =
  "inline-flex w-fit items-center justify-center rounded-full bg-primary px-8 py-3.5 font-sans text-base font-medium text-paper transition-colors hover:bg-primary-hover disabled:opacity-50";
