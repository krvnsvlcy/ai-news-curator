import type { countLettersByStatus, LetterSort, LetterStatus, listLetters } from "@curator/db";
import Link from "next/link";
import { buttonClass } from "@/components/button-styles";
import { CopyIcon } from "@/components/icons";
import { LetterStatusBadge } from "@/components/letter-status";
import { Panel } from "@/components/page";
import { formatDateTime, formatShortCalendarDate, timeAgo } from "@/lib/format";
import { duplicateLetterAction } from "./actions";
import { DeleteLetterButton } from "./delete-letter-button";
import { NewLetterButton } from "./new-letter-dialog";

export { NewLetterButton };

type LetterRow = Awaited<ReturnType<typeof listLetters>>[number];
type LetterCounts = Awaited<ReturnType<typeof countLettersByStatus>>;

export const STATUSES: (LetterStatus | "all")[] = ["all", "draft", "ready", "published"];
export const SORTS: { value: LetterSort; label: string }[] = [
  { value: "date-desc", label: "Newest edition" },
  { value: "date-asc", label: "Oldest edition" },
  { value: "updated-desc", label: "Recently edited" },
];

/** Reads ?status= and ?sort=, falling back to all / newest edition. */
export function parseLetterQuery(sp: { status?: string; sort?: string }): {
  status?: LetterStatus;
  sort: LetterSort;
} {
  const status =
    (STATUSES as string[]).includes(sp.status ?? "") && sp.status !== "all"
      ? (sp.status as LetterStatus)
      : undefined;
  const sort = SORTS.some((x) => x.value === sp.sort) ? (sp.sort as LetterSort) : "date-desc";
  return { status, sort };
}

/** Link to `basePath` with this status/sort, keeping the page's other params (e.g. ?range=). */
function href(basePath: string, status: string, sort: string, keep: Record<string, string>) {
  const p = new URLSearchParams(keep);
  if (status !== "all") p.set("status", status);
  if (sort !== "date-desc") p.set("sort", sort);
  const q = p.toString();
  return q ? `${basePath}?${q}` : basePath;
}

/** Status filters (with counts) and sort, then the list: the Letters page and the Overview. */
export function LettersBrowser({
  letters,
  counts,
  status,
  sort,
  basePath,
  keep = {},
}: {
  letters: LetterRow[];
  counts: LetterCounts;
  status?: LetterStatus;
  sort: LetterSort;
  basePath: string;
  /** Other query params of the page to keep in filter/sort links. */
  keep?: Record<string, string>;
}) {
  const total = counts.draft + counts.ready + counts.published;
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => {
            const active = (status ?? "all") === s;
            const n = s === "all" ? total : counts[s];
            return (
              <Link
                key={s}
                href={href(basePath, s, sort, keep)}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className="rounded-md border border-rule bg-paper px-2.5 py-1 text-[13px] text-muted capitalize transition-colors hover:text-ink aria-[current=page]:border-ink aria-[current=page]:bg-ink aria-[current=page]:text-paper"
              >
                {s} <span className="tabular-nums opacity-70">{n}</span>
              </Link>
            );
          })}
        </nav>
        <nav aria-label="Sort" className="flex items-center gap-1 text-[13px]">
          <span className="mr-1 text-muted">Sort</span>
          {SORTS.map((x) => (
            <Link
              key={x.value}
              href={href(basePath, status ?? "all", x.value, keep)}
              scroll={false}
              aria-current={sort === x.value ? "true" : undefined}
              className="rounded-md px-2 py-1 text-muted hover:bg-hover hover:text-ink aria-[current=true]:bg-hover aria-[current=true]:font-medium aria-[current=true]:text-ink"
            >
              {x.label}
            </Link>
          ))}
        </nav>
      </div>
      <LetterList
        letters={letters}
        emptyTitle={status ? `No ${status} letters` : "No letters yet"}
        {...(status ? { emptyHint: "Try another filter.", showCreate: false } : {})}
      />
    </>
  );
}

const COLS =
  "md:grid md:grid-cols-[minmax(0,1fr)_150px_110px_70px_120px_84px] md:items-center md:gap-4";

/** The letters table, shared by the Letters page and the Overview. */
export function LetterList({
  letters,
  emptyTitle = "No letters yet",
  emptyHint = "Create a letter, then add stories from the feed and polish them with AI.",
  showCreate = true,
}: {
  letters: LetterRow[];
  emptyTitle?: string;
  emptyHint?: string;
  /** Offer "New letter" in the empty state. */
  showCreate?: boolean;
}) {
  return (
    <Panel>
      {letters.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-[14px] font-medium">{emptyTitle}</p>
          <p className="mt-1 text-[13px] text-muted">{emptyHint}</p>
          {showCreate && (
            <div className="mt-4 flex justify-center">
              <NewLetterButton variant="secondary" />
            </div>
          )}
        </div>
      ) : (
        <>
          <div
            className={`hidden border-b border-rule bg-canvas px-5 py-2 text-[12px] font-medium text-muted ${COLS}`}
          >
            <span>Headline</span>
            <span>Edition date</span>
            <span>Status</span>
            <span className="text-right">Stories</span>
            <span>Updated</span>
            <span />
          </div>
          <ul className="divide-y divide-rule">
            {letters.map((l) => {
              const id = l._id.toHexString();
              const label = l.headline || "Untitled letter";
              return (
                <li
                  key={id}
                  className="relative px-4 py-3 transition-colors hover:bg-hover/50 sm:px-5"
                >
                  <div className={`space-y-1.5 md:space-y-0 ${COLS}`}>
                    <Link
                      href={`/letters/${id}`}
                      className={`block truncate text-[14.5px] font-medium after:absolute after:inset-0 ${l.headline ? "" : "text-muted italic"}`}
                    >
                      {label}
                    </Link>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] md:contents">
                      <span className="whitespace-nowrap">{formatShortCalendarDate(l.date)}</span>
                      <span>
                        <LetterStatusBadge status={l.status} />
                      </span>
                      <span className="tabular-nums text-muted md:text-right md:text-ink">
                        {l.storyCount}
                        <span className="md:hidden">
                          {" "}
                          {l.storyCount === 1 ? "story" : "stories"}
                        </span>
                      </span>
                      <span className="text-muted" title={formatDateTime(l.updatedAt)}>
                        {timeAgo(l.updatedAt)}
                      </span>
                    </div>
                    {/* Actions sit above the row link. */}
                    <div className="relative z-10 flex items-center gap-0.5 md:justify-end">
                      <form action={duplicateLetterAction.bind(null, id)}>
                        <button
                          type="submit"
                          title="Duplicate"
                          aria-label={`Duplicate ${label}`}
                          className={`${buttonClass("quiet")} px-2`}
                        >
                          <CopyIcon className="size-4" />
                        </button>
                      </form>
                      {l.status === "draft" && <DeleteLetterButton id={id} label={label} compact />}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Panel>
  );
}
