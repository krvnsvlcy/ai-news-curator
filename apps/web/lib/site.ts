/** Site identity shared by metadata, icons, the social image and the manifest. */
export const SITE = {
  name: "News Curator",
  shortName: "Curator",
  description:
    "Curate the day's news into a polished newsletter: gather sources, shape the stories, and send.",
  // Mirrors the theme tokens in app/globals.css.
  colors: { navy: "#1e3b7a", blue: "#3366cc", canvas: "#f2f1f6", ink: "#000000", muted: "#5c5b66" },
};

/** Absolute base for canonical URLs and social images. */
export function siteUrl(): URL {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return new URL(explicit);
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercel) return new URL(`https://${vercel}`);
  return new URL(`http://localhost:${process.env.PORT ?? 3000}`);
}
