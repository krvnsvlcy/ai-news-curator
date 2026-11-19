"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { buttonClass } from "@/components/button-styles";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { type RefreshOutcome, refreshSourceAction } from "../letters/generate-actions";

type Source = { id: string; name: string };
type Run = { outcomes: Record<string, RefreshOutcome>; done: boolean };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Fetches every enabled source in parallel, with progress in a corner notification. */
export function RefreshFeedButton({ sources }: { sources: Source[] }) {
  const router = useRouter();
  const [run, setRun] = useState<Run>();
  const running = run !== undefined && !run.done;

  async function refresh() {
    setRun({ outcomes: {}, done: false });
    await Promise.all(
      sources.map(async (s) => {
        const outcome: RefreshOutcome = await refreshSourceAction(s.id).catch(() => ({
          status: "error" as const,
        }));
        setRun((r) => r && { ...r, outcomes: { ...r.outcomes, [s.id]: outcome } });
      }),
    );
    setRun((r) => r && { ...r, done: true });
    router.refresh();
  }

  // A clean result clears itself; failures stay until dismissed.
  const failed = sources.filter((s) => {
    const o = run?.outcomes[s.id];
    return o && o.status !== "ok";
  });
  useEffect(() => {
    if (!run?.done || failed.length > 0) return;
    const t = setTimeout(() => setRun(undefined), 4000);
    return () => clearTimeout(t);
  }, [run?.done, failed.length]);

  const finished = run ? Object.keys(run.outcomes).length : 0;
  const newCount = Object.values(run?.outcomes ?? {}).reduce(
    (n, o) => n + (o.status === "ok" ? o.newCount : 0),
    0,
  );

  return (
    <>
      <button
        type="button"
        onClick={refresh}
        disabled={running || sources.length === 0}
        title={sources.length === 0 ? "No enabled sources" : "Fetch every enabled source now"}
        className={buttonClass("primary")}
      >
        {running ? "Refreshing…" : "Refresh"}
      </button>

      {run &&
        createPortal(
          <div
            role="status"
            aria-live="polite"
            className="fixed right-4 bottom-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-rule bg-paper p-3.5 shadow-lg motion-safe:animate-[fadein_.2s_ease-out]"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${
                  running
                    ? "border-rule border-t-primary motion-safe:animate-spin"
                    : failed.length
                      ? "border-amber-500 text-amber-700"
                      : "border-sea bg-sea text-paper"
                }`}
              >
                {!running &&
                  (failed.length ? (
                    <span className="text-[11px] font-bold">!</span>
                  ) : (
                    <CheckIcon className="size-3.5" strokeWidth={2.5} />
                  ))}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium">
                  {running ? "Refreshing sources" : "Feed refreshed"}
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  {running
                    ? `${finished} of ${sources.length} done`
                    : newCount
                      ? `${plural(newCount, "new story", "new stories")}`
                      : "No new stories"}
                  {failed.length > 0 && (
                    <span className="text-amber-700">
                      {" · "}
                      {failed.map((s) => s.name).join(", ")} couldn't be reached
                    </span>
                  )}
                </p>
                {running && (
                  <div className="mt-2 h-1 overflow-hidden rounded-full bg-hover">
                    <div
                      className="h-full rounded-full bg-primary transition-[width] duration-300"
                      style={{ width: `${(finished / Math.max(1, sources.length)) * 100}%` }}
                    />
                  </div>
                )}
              </div>
              {!running && (
                <button
                  type="button"
                  onClick={() => setRun(undefined)}
                  aria-label="Dismiss"
                  className="-m-1 rounded-sm p-1 text-muted hover:bg-hover hover:text-ink"
                >
                  <CloseIcon className="size-4" />
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
