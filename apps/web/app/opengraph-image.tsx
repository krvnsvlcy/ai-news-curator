import { ImageResponse } from "next/og";
import { ogFonts } from "@/lib/og-font";
import { SITE } from "@/lib/site";

export const alt = `${SITE.name}: ${SITE.description}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const HEADLINE = "The day's news, curated.";

export default async function OpengraphImage() {
  const { navy, blue, canvas, ink, muted } = SITE.colors;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        padding: 48,
        background: canvas,
        fontFamily: "Inter",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "#ffffff",
          borderRadius: 28,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 16,
              background: navy,
              color: "#ffffff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 42,
              fontWeight: 700,
              fontFamily: "Source Serif 4",
            }}
          >
            C
          </div>
          <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: 4, color: navy }}>
            {SITE.shortName.toUpperCase()}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 76,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -2,
              color: ink,
              fontFamily: "Source Serif 4",
            }}
          >
            {HEADLINE}
          </div>
          <div style={{ fontSize: 30, lineHeight: 1.4, color: muted, maxWidth: 860 }}>
            {SITE.description}
          </div>
        </div>
        <div
          style={{ display: "flex", height: 6, width: 120, borderRadius: 3, background: blue }}
        />
      </div>
    </div>,
    {
      ...size,
      fonts: await ogFonts({
        sans: SITE.shortName.toUpperCase() + SITE.description,
        serif: `C${HEADLINE}`,
      }),
    },
  );
}
