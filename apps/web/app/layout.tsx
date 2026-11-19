import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "AI News Curator",
  description: "A curated feed of AI news.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          maxWidth: 720,
          margin: "2rem auto",
          padding: "0 1rem",
        }}
      >
        {children}
      </body>
    </html>
  );
}
