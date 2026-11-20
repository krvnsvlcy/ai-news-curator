/**
 * Google Fonts for next/og images, subset to the text drawn. Fetched when the
 * image is generated (at build time for static images). Returns null on failure
 * so the image still renders, in the default sans.
 */
async function googleFont(family: string, weight: 400 | 700, text: string) {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}&text=${encodeURIComponent(text)}`,
    ).then((r) => r.text());
    const src = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    if (!src) return null;
    const data = await fetch(src).then((r) => r.arrayBuffer());
    return { name: family, data, weight, style: "normal" as const };
  } catch {
    return null;
  }
}

type Font = NonNullable<Awaited<ReturnType<typeof googleFont>>>;

/** Inter for UI text, Source Serif 4 Bold for the wordmark and headlines (as in the app). */
export async function ogFonts({ sans = "", serif = "" }: { sans?: string; serif?: string }) {
  const fonts = await Promise.all([
    sans ? googleFont("Inter", 400, sans) : null,
    sans ? googleFont("Inter", 700, sans) : null,
    serif ? googleFont("Source Serif 4", 700, serif) : null,
  ]);
  return fonts.filter((f): f is Font => f !== null);
}
