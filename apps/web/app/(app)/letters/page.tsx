import { countLettersByStatus, type LetterSort, type LetterStatus, listLetters } from "@curator/db";
import Link from "next/link";
import { buttonClass } from "@/components/button-styles";
import { CopyIcon, PlusIcon } from "@/components/icons";
import { LetterStatusBadge } from "@/components/letter-status";
import { PageBody, PageHeader, Panel } from "@/components/page";
import { SubmitButton } from "@/components/submit-button";
import { requireSession } from "@/lib/auth/session";
import { formatDateTime, formatShortCalendarDate, timeAgo } from "@/lib/format";
import { createLetterAction, duplicateLetterAction } from "./actions";
import { DeleteLetterButton } from "./delete-letter-button";

export const metadata = { title: "Letters · AI News Curator" };

const STATUSES: (LetterStatus | "all")[] = ["all", "draft", "ready", "published"];
const SORTS: { value: LetterSort; label: string }[] = [
  { value: "date-desc", label: "Newest edition" },
  { value: "date-asc", label: "Oldest edition" },
  { value: "updated-desc", label: "Recently edited" },
];
const COLS =
  "md:grid md:grid-cols-[minmax(0,1fr)_150px_110px_70px_120px_84px] md:items-center md:gap-4";

function href(status: string, sort: string) {
  const p = new URLSearchParams();
  if (status !== "all") p.set("status", status);
  if (sort !== "date-desc") p.set("sort", sort);
  const q = p.toString();
  return q ? `/letters?${q}` : "/letters";
}

export default async function LettersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string }>;
}) {
  await requireSession();
  const sp = await searchParams;
  const status = (STATUSES as string[]).includes(sp.status ?? "")
    ? (sp.status as LetterStatus)
    : undefined;
  const sort = SORTS.some((s) => s.value === sp.sort) ? (sp.sort as LetterSort) : "date-desc";

  const [letters, counts] = await Promise.all([
    listLetters({ status, sort }),
    countLettersByStatus(),
  ]);
  const total = counts.draft + counts.ready + counts.published;

  return (
    <>
      <PageHeader
        title="Letters"
        description={`${total} ${total === 1 ? "edition" : "editions"} · ${counts.draft} draft · ${counts.ready} ready · ${counts.published} published`}
        actions={
          <form action={createLetterAction}>
            <SubmitButton pendingText="Creating…">
              <PlusIcon className="size-4" /> New letter
            </SubmitButton>
          </form>
        }
      />
      <PageBody>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Filter by status" className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => {
              const active = (status ?? "all") === s;
              const n = s === "all" ? total : counts[s];
              return (
                <Link
                  key={s}
                  href={href(s, sort)}
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
            {SORTS.map((s) => (
              <Link
                key={s.value}
                href={href(status ?? "all", s.value)}
                aria-current={sort === s.value ? "true" : undefined}
                className="rounded-md px-2 py-1 text-muted hover:bg-hover hover:text-ink aria-[current=true]:bg-hover aria-[current=true]:font-medium aria-[current=true]:text-ink"
              >
                {s.label}
              </Link>
            ))}
          </nav>
        </div>

        <Panel>
          {letters.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-[14px] font-medium">
                {status ? `No ${status} letters` : "No letters yet"}
              </p>
              <p className="mt-1 text-[13px] text-muted">
                {status
                  ? "Try another filter."
                  : "Create a letter, then add stories from the feed and polish them with AI."}
              </p>
              {!status && (
                <form action={createLetterAction} className="mt-4">
                  <SubmitButton variant="secondary" pendingText="Creating…">
                    New letter
                  </SubmitButton>
                </form>
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
                          <span className="whitespace-nowrap">
                            {formatShortCalendarDate(l.date)}
                          </span>
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
                          {l.status === "draft" && (
                            <DeleteLetterButton id={id} label={label} compact />
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Panel>
      </PageBody>
    </>
  );
}
