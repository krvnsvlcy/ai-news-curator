"use client";

import { type NewsletterOptions, renderLetterHtml } from "@curator/newsletter";
import { useDeferredValue, useMemo, useState } from "react";
import { type EditorLetterContent, toNewsletterLetter } from "@/lib/letters";

/**
 * Renders the same HTML the email will use, inside a sandboxed iframe
 * (no scripts; links open in a new tab).
 */
export function LetterPreview({
  letter,
  newsletter,
  publishedHtml,
}: {
  letter: EditorLetterContent;
  newsletter: NewsletterOptions;
  publishedHtml?: string;
}) {
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const deferred = useDeferredValue(letter);
  const html = useMemo(
    () =>
      publishedHtml ??
      renderLetterHtml(toNewsletterLetter(deferred), {
        ...newsletter,
        manageUrl: "#",
        unsubscribeUrl: "#",
      }),
    [deferred, newsletter, publishedHtml],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-lg border border-rule bg-paper">
      <div className="flex items-center justify-between gap-3 border-b border-rule px-3 py-2">
        <div className="min-w-0">
          <p className="text-[12.5px] font-medium">Email preview</p>
          <p className="truncate text-[11.5px] text-muted">
            {publishedHtml ? "Exactly as published" : "Live: same HTML subscribers will receive"}
          </p>
        </div>
        <fieldset className="flex rounded-md border border-rule p-0.5">
          <legend className="sr-only">Preview width</legend>
          {(["desktop", "mobile"] as const).map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={device === d}
              onClick={() => setDevice(d)}
              className="rounded px-2 py-0.5 text-[12px] text-muted capitalize aria-pressed:bg-ink aria-pressed:text-paper"
            >
              {d}
            </button>
          ))}
        </fieldset>
      </div>
      <div className="flex min-h-0 flex-1 justify-center overflow-hidden bg-[#e9e7e1] dark:bg-[#0d0d0d]">
        <iframe
          title="Email preview"
          srcDoc={html}
          sandbox="allow-popups allow-popups-to-escape-sandbox"
          className={`h-full border-0 bg-white transition-[width] duration-200 ${device === "mobile" ? "my-3 w-[375px] rounded-[20px] shadow-xl ring-8 ring-black/80" : "w-full"}`}
        />
      </div>
    </div>
  );
}
