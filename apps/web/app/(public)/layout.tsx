import type { ReactNode } from "react";
import { newsletterOptions } from "@/lib/newsletter-config";

// Reader-facing pages, styled like the email rather than the dashboard.
export default function PublicLayout({ children }: { children: ReactNode }) {
  const { publicationName, tagline } = newsletterOptions();
  return (
    <div className="min-h-dvh bg-[#f3f2ee] px-4 py-10 text-[#1a1a1a] sm:py-16">
      <main className="mx-auto w-full max-w-[560px] bg-white px-6 py-10 sm:px-12">
        <header className="flex items-center justify-between border-b-2 border-[#1a1a1a] pb-3">
          <span className="text-[12px] font-bold tracking-[2px] uppercase">{publicationName}</span>
          {tagline && <span className="text-[12px] text-[#77736b]">{tagline}</span>}
        </header>
        {children}
      </main>
    </div>
  );
}
