import { ImageResponse } from "next/og";
import { ogFonts } from "@/lib/og-font";
import { SITE } from "@/lib/site";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Home-screen icon: iOS rounds the corners itself, so the square is full-bleed.
export default async function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: SITE.colors.navy,
        color: "#ffffff",
        fontFamily: "Source Serif 4",
        fontSize: 120,
        fontWeight: 700,
      }}
    >
      C
    </div>,
    { ...size, fonts: await ogFonts({ serif: "C" }) },
  );
}
