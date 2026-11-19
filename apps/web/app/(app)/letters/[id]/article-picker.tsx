"use client";

import { useEffect, useState, useTransition } from "react";
import { buttonClass } from "@/components/button-styles";
import { Modal } from "@/components/modal";
import { formatDateTime, timeAgo } from "@/lib/format";
import type { PickerArticle } from "@/lib/letters";
import { searchArticlesAction } from "../actions";
import { inputClass } from "./fields";

export function ArticlePicker({
  open,
  onClose,
  sources,
  selectedArticleIds,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  sources: { slug: string; name: string }[];
  selectedArticleIds: Set<string>;
  onAdd: (article: PickerArticle) => void;
}) {
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [results, setResults] = useState<PickerArticle[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      startTransition(async () => {
        setResults(await searchArticlesAction({ query, sourceSlug: source || undefined }));
        setLoaded(true);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [open, query, source]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add stories from the feed"
      size="lg"
      footer={
        <div className="flex items-center justify-between">
          <span className="text-[12.5px] text-muted">{selectedArticleIds.size} in this letter</span>
          <button type="button" onClick={onClose} className={buttonClass("primary")}>
            Done
          </button>
        </div>
      }
    >
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b border-rule bg-paper px-5 py-3 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search headlines and summaries…"
          aria-label="Search articles"
          className={inputClass}
          // biome-ignore lint/a11y/noAutofocus: primary control of a just-opened dialog
          autoFocus
        />
        <select
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label="Filter by source"
          className={`${inputClass} sm:w-48`}
        >
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s.slug} value={s.slug}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div aria-busy={pending} className={pending ? "opacity-60 transition-opacity" : ""}>
        {loaded && results.length === 0 ? (
          <p className="px-5 py-12 text-center text-[13px] text-muted">
            {query
              ? "No articles match that search."
              : "No articles yet. Fetch some sources first."}
          </p>
        ) : (
          <ul className="divide-y divide-rule">
            {results.map((a) => {
              const added = selectedArticleIds.has(a.id);
              return (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <a
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[14px] leading-snug font-medium hover:underline"
                    >
                      {a.title}
                    </a>
                    {a.summary && (
                      <p className="mt-0.5 line-clamp-2 text-[12.5px] text-muted">{a.summary}</p>
                    )}
                    <p className="mt-1 text-[12px] text-muted">
                      <span className="font-medium text-ink">{a.sourceName}</span>
                      {a.section && <> · {a.section}</>} ·{" "}
                      <time
                        dateTime={a.publishedAt}
                        title={formatDateTime(new Date(a.publishedAt))}
                      >
                        {timeAgo(new Date(a.publishedAt))}
                      </time>
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={added}
                    onClick={() => onAdd(a)}
                    className={`${buttonClass(added ? "quiet" : "secondary")} w-20 shrink-0`}
                  >
                    {added ? "Added" : "Add"}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
