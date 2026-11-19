"use client";

import type { PartialLetterDraft } from "@curator/ai";
import { type FormEvent, type ReactNode, useEffect, useRef, useState, useTransition } from "react";
import type { DraftEvent } from "@/app/api/letters/draft/route";
import { type ButtonVariant, buttonClass } from "@/components/button-styles";
import { CheckIcon, PlusIcon, SparkleIcon } from "@/components/icons";
import { Modal } from "@/components/modal";
import type { DraftPreview } from "@/lib/letter-draft";
import { TONE_PRESETS } from "@/lib/tones";
import { inputClass, labelClass } from "./[id]/fields";
import { createLetterAction } from "./actions";
import {
  createDraftedLetterAction,
  type DayNews,
  dayNewsAction,
  prepareGatherAction,
  type RefreshOutcome,
  refreshSourceAction,
} from "./generate-actions";

type StepState = "pending" | "active" | "done" | "error";
type StepId = "sources" | "news" | "write" | "create";
type SourceChip = { id: string; name: string; outcome?: RefreshOutcome };

interface Run {
  steps: Record<StepId, StepState>;
  /** Null: a past day, nothing to refresh. */
  sources: SourceChip[] | null;
  news?: DayNews;
  partial?: PartialLetterDraft;
  error?: string;
  failedAt?: StepId;
  startedAt: number;
}

const freshRun = (): Run => ({
  steps: { sources: "pending", news: "pending", write: "pending", create: "pending" },
  sources: [],
  startedAt: Date.now(),
});

function todayInLondon() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(new Date());
}

function longDate(day: string) {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Opens the AI walkthrough that drafts a whole letter for a day. */
export function NewLetterButton({ variant = "primary" }: { variant?: ButtonVariant }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass(variant)}>
        <PlusIcon className="size-4" /> New letter
      </button>
      {open && <NewLetterDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function NewLetterDialog({ onClose }: { onClose: () => void }) {
  const today = todayInLondon();
  const [date, setDate] = useState(today);
  const [tone, setTone] = useState("");
  const [view, setView] = useState<"setup" | "working">("setup");
  const [run, setRun] = useState<Run>(freshRun);
  const [, startNavigation] = useTransition();
  // Each run gets an id; anything from an abandoned run is ignored (and its stream aborted).
  const runId = useRef(0);
  const abort = useRef<AbortController>(undefined);
  // Kept so a failed step can be retried without redoing the earlier ones.
  const draft = useRef<DraftPreview>(undefined);

  function cancel() {
    runId.current++;
    abort.current?.abort();
  }
  function close() {
    cancel();
    onClose();
  }

  async function generate(from: StepId = "sources") {
    cancel();
    const id = runId.current;
    const live = () => runId.current === id;
    const set = (patch: Partial<Run> | ((r: Run) => Partial<Run>)) => {
      if (live()) setRun((r) => ({ ...r, ...(typeof patch === "function" ? patch(r) : patch) }));
    };
    const step = (s: StepId, state: StepState) =>
      set((r) => ({ steps: { ...r.steps, [s]: state } }));
    const fail = (s: StepId, error: string) => {
      step(s, "error");
      set({ error, failedAt: s });
    };
    setView("working");
    if (from === "sources") set(freshRun());
    else set({ error: undefined, failedAt: undefined });

    // 1. Refresh sources in parallel, a chip each, so you see each one come back.
    if (from === "sources") {
      step("sources", "active");
      const prep = await prepareGatherAction(date);
      if (!live()) return;
      if (!prep.ok) return fail("sources", prep.error);
      const chips = prep.value.refresh;
      set({ sources: chips.length ? chips : null });
      await Promise.all(
        chips.map(async (c) => {
          const outcome = await refreshSourceAction(c.id).catch(
            (): RefreshOutcome => ({ status: "error" }),
          );
          set((r) => ({
            sources: r.sources?.map((x) => (x.id === c.id ? { ...x, outcome } : x)) ?? null,
          }));
        }),
      );
      if (!live()) return;
      step("sources", "done");
    }

    // 2. Gather the day's stories.
    if (from === "sources" || from === "news") {
      step("news", "active");
      const n = await dayNewsAction(date);
      if (!live()) return;
      if (!n.ok) return fail("news", n.error);
      set({ news: n.value });
      step("news", "done");
    }

    // 3. Claude writes it, streamed so the letter appears as it's written.
    if (from !== "create") {
      draft.current = undefined;
      step("write", "active");
      set({ partial: undefined });
      const controller = new AbortController();
      abort.current = controller;
      try {
        const res = await fetch("/api/letters/draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, tone }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = "";
        let failed = false;
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += value;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as DraftEvent;
            if (event.type === "partial") set({ partial: event.draft });
            else if (event.type === "error") {
              failed = true;
              fail("write", event.error);
            } else {
              draft.current = event.draft;
              set({
                partial: {
                  highlights: event.draft.highlights.map((h) => ({
                    storyIndex: h.storyIndex,
                    headline: h.headline,
                    summary: h.summary,
                  })),
                  headline: event.draft.headline,
                  briefing: event.draft.briefing,
                },
              });
            }
          }
        }
        if (!live() || failed) return;
        if (!draft.current)
          return fail("write", "The connection dropped while writing. Try again.");
      } catch {
        if (live()) fail("write", "Couldn't reach the server while writing. Try again.");
        return;
      }
      step("write", "done");
    }

    // 4. Create it and open it in the editor; everything stays editable there.
    const value = draft.current;
    if (!value) return fail("write", "The draft went missing. Try again.");
    step("create", "active");
    startNavigation(async () => {
      const res = await createDraftedLetterAction({
        date: value.date,
        tone: value.tone,
        headline: value.headline,
        briefing: value.briefing,
        highlights: value.highlights.map(({ articleId, headline, summary }) => ({
          articleId,
          headline,
          summary,
        })),
      });
      // On success the action redirects to the editor; a result means it didn't.
      if (res && !res.ok) fail("create", res.error);
    });
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void generate("sources");
  }

  const footer =
    view === "setup" ? (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <form action={createLetterAction}>
          <button type="submit" className={buttonClass("quiet")}>
            Start blank instead
          </button>
        </form>
        <button type="submit" form="new-letter-form" className={buttonClass("primary")}>
          <SparkleIcon className="size-4" /> Generate letter
        </button>
      </div>
    ) : (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            cancel();
            setView("setup");
          }}
          disabled={run.steps.create === "active"}
          className={buttonClass("quiet")}
        >
          {run.failedAt ? "Back" : "Cancel"}
        </button>
        {run.failedAt && (
          <button
            type="button"
            onClick={() => void generate(run.failedAt)}
            className={buttonClass("primary")}
          >
            Try again
          </button>
        )}
      </div>
    );

  return (
    <Modal open onClose={close} title="New letter" size="xl" footer={footer}>
      {view === "setup" ? (
        <SetupForm
          today={today}
          date={date}
          setDate={setDate}
          tone={tone}
          setTone={setTone}
          onSubmit={onSubmit}
        />
      ) : (
        <Working date={date} today={today} run={run} />
      )}
    </Modal>
  );
}

function SetupForm({
  today,
  date,
  setDate,
  tone,
  setTone,
  onSubmit,
}: {
  today: string;
  date: string;
  setDate: (v: string) => void;
  tone: string;
  setTone: (v: string) => void;
  onSubmit: (e: FormEvent) => void;
}) {
  return (
    <form id="new-letter-form" onSubmit={onSubmit} className="space-y-6 p-6">
      <div>
        <p className="text-[15px] font-medium">Draft a whole letter with AI</p>
        <p className="mt-1 text-[13px] text-muted">
          Claude reads the day's news from your sources, picks the 3 to 5 most important stories,
          and writes the headline, briefing and a summary of each. The letter opens in the editor as
          a draft, so you can change anything.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-[200px_minmax(0,1fr)]">
        <div>
          <label htmlFor="new-letter-date" className={labelClass}>
            Edition date
          </label>
          <input
            id="new-letter-date"
            type="date"
            required
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${inputClass} mt-1.5`}
          />
        </div>
        <div>
          <label htmlFor="new-letter-tone" className={labelClass}>
            Tone <span className="font-normal text-muted">optional</span>
          </label>
          <input
            id="new-letter-tone"
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            maxLength={300}
            placeholder="Dry, understated British wit"
            className={`${inputClass} mt-1.5`}
          />
          <div className="mt-2 flex flex-wrap gap-1">
            {TONE_PRESETS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTone(t)}
                aria-pressed={tone === t}
                className="rounded-sm border border-rule px-1.5 py-0.5 text-[11.5px] text-muted hover:text-ink aria-pressed:border-ink aria-pressed:text-ink"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    </form>
  );
}

/** What Claude is doing right now, read off the streamed draft. */
function writingPhase(run: Run): string {
  const p = run.partial;
  const picked = (p?.highlights ?? []).filter((h) => h?.headline);
  if (p?.briefing) return "Writing the briefing";
  if (p?.headline) return "Writing the edition headline";
  if (picked.length) return `Writing up story ${picked.length}`;
  return `Reading ${plural(run.news?.stories ?? 0, "story", "stories")}`;
}

function Working({ date, today, run }: { date: string; today: string; run: Run }) {
  const { steps } = run;
  const chips = run.sources ?? [];
  const failed = chips.filter((s) => s.outcome && s.outcome.status !== "ok").length;
  const busy = Object.values(steps).includes("active");
  const pastDay = Date.parse(today) - Date.parse(date) > 86_400_000;

  return (
    // A fixed height on wider screens, so the dialog doesn't jump as the draft grows.
    <div className="grid md:h-[min(600px,70dvh)] md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="border-rule p-6 md:overflow-y-auto md:border-r">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[15px] font-medium">Drafting {longDate(date)}</p>
          <Elapsed since={run.startedAt} running={busy} />
        </div>
        <ol className="mt-5 space-y-5">
          <Step
            state={steps.sources}
            title={
              run.sources === null
                ? "Using the stories already collected"
                : steps.sources === "done"
                  ? failed
                    ? `Sources refreshed, ${failed} couldn't be reached`
                    : "Sources refreshed"
                  : "Checking your sources for news"
            }
          >
            {run.sources && run.sources.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {run.sources.map((s) => (
                  <SourceChipView key={s.id} chip={s} />
                ))}
              </ul>
            )}
            {run.sources === null && pastDay && (
              <p className="text-[12.5px] text-muted">
                Feeds only list recent stories, so past days use what's stored.
              </p>
            )}
          </Step>
          <Step
            state={steps.news}
            title={
              run.news
                ? `Found ${plural(run.news.stories, "story", "stories")} from ${plural(run.news.bySource.length, "source")}`
                : "Gathering the day's news"
            }
          >
            {run.news && (
              <p className="mt-0.5 text-[12.5px] text-muted">
                {run.news.bySource.map((s) => `${s.name} ${s.count}`).join(" · ")}
              </p>
            )}
          </Step>
          <Step
            state={steps.write}
            title={
              steps.write === "done"
                ? `Picked ${plural(run.partial?.highlights?.length ?? 0, "story", "stories")} and wrote the letter`
                : steps.write === "active"
                  ? writingPhase(run)
                  : "Picking the top stories and writing"
            }
          />
          <Step
            state={steps.create}
            title={steps.create === "active" ? "Opening it in the editor" : "Creating the letter"}
          />
        </ol>
        {run.error && (
          <p
            role="alert"
            className="mt-6 rounded-md border border-danger/20 bg-red-50 px-3 py-2 text-[13px] text-danger"
          >
            {run.error}
          </p>
        )}
      </div>
      <LivePreview date={date} run={run} />
    </div>
  );
}

function SourceChipView({ chip }: { chip: SourceChip }) {
  const o = chip.outcome;
  const label = !o
    ? "checking"
    : o.status === "ok"
      ? o.newCount
        ? `+${o.newCount} new`
        : "up to date"
      : o.status === "timeout"
        ? "slow, skipped"
        : "couldn't fetch";
  return (
    <li
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] ${
        !o
          ? "border-rule text-muted"
          : o.status === "ok"
            ? "border-blue/30 bg-blue/5 text-ink"
            : "border-amber-500/30 bg-amber-50 text-amber-900"
      }`}
    >
      {!o ? (
        <span
          aria-hidden
          className="size-2.5 rounded-full border border-rule border-t-primary motion-safe:animate-spin"
        />
      ) : o.status === "ok" ? (
        <CheckIcon className="size-3 text-blue" strokeWidth={3} />
      ) : (
        <span aria-hidden className="text-[10px] font-bold">
          !
        </span>
      )}
      {chip.name}
      <span className="text-muted">{label}</span>
    </li>
  );
}

/** The letter as Claude writes it; before the first words, the stories it's reading. */
function LivePreview({ date, run }: { date: string; run: Run }) {
  const p = run.partial;
  const writing = run.steps.write === "active";
  const candidates = run.news?.candidates ?? [];
  const highlights = (p?.highlights ?? []).filter((h) => h && (h.headline || h.summary));
  const started = highlights.length > 0 || !!p?.headline;
  // Follow the writing: keep the newest words in view as they stream in.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el && writing && p) el.scrollTop = el.scrollHeight;
  }, [p, writing]);

  if (!run.news) {
    return (
      <div className="hidden h-full place-items-center bg-canvas/50 p-8 text-center md:grid">
        <p className="max-w-56 text-[13px] text-muted">
          The letter will appear here as Claude writes it.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={scroller}
      className="bg-canvas/50 p-6 md:overflow-y-auto"
      aria-live="polite"
      aria-busy={writing}
    >
      {!started ? (
        <ReadingTicker candidates={candidates} active={writing} />
      ) : (
        <article className="space-y-5">
          <section aria-label="Highlights">
            <p className="border-b border-rule pb-1.5 text-[11.5px] font-medium tracking-wide text-muted uppercase">
              {writing && !p?.headline ? "Picking the top stories" : "Top stories"}
              <span className="ml-1.5 tabular-nums">{highlights.length}</span>
            </p>
            <ol className="divide-y divide-rule">
              {highlights.map((h, i) => {
                const src =
                  typeof h?.storyIndex === "number" ? candidates[h.storyIndex - 1] : undefined;
                const last = i === highlights.length - 1;
                return (
                  <li
                    // biome-ignore lint/suspicious/noArrayIndexKey: picks only ever append while streaming
                    key={i}
                    className="flex gap-3 py-3 motion-safe:animate-[fadein_.35s_ease-out]"
                  >
                    <span className="w-5 shrink-0 pt-0.5 text-[12px] font-semibold text-muted tabular-nums">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] leading-snug font-semibold">{h?.headline}</p>
                      {h?.summary && (
                        <p className="mt-0.5 text-[13px] leading-relaxed text-ink/80">
                          {h.summary}
                          {writing && last && !p?.headline && <Caret />}
                        </p>
                      )}
                      {src && (
                        <p className="mt-1 truncate text-[12px] text-muted">
                          {src.sourceName}: {src.title}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
          {(p?.headline || p?.briefing) && (
            <header className="border-t border-rule pt-4">
              <p className="text-[11.5px] font-medium tracking-wide text-muted uppercase">
                {longDate(date)}
              </p>
              <h3 className="mt-1 font-serif text-[22px] leading-tight font-bold tracking-tight">
                {p.headline}
                {writing && !p.briefing && <Caret />}
              </h3>
              {p.briefing && (
                <div className="mt-3 space-y-2">
                  {p.briefing.split(/\n\s*\n/).map((para, i, all) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs only append while streaming
                    <p key={i} className="font-serif text-[15px] leading-relaxed">
                      {para}
                      {writing && i === all.length - 1 && <Caret />}
                    </p>
                  ))}
                </div>
              )}
            </header>
          )}
        </article>
      )}
    </div>
  );
}

/** Cycles through the day's real headlines while Claude reads them. */
function ReadingTicker({
  candidates,
  active,
}: {
  candidates: { title: string; sourceName: string }[];
  active: boolean;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!active || candidates.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % candidates.length), 450);
    return () => clearInterval(t);
  }, [active, candidates.length]);
  const at = (d: number) => candidates[(i + d + candidates.length) % candidates.length];
  const c = at(0);

  return (
    <div className="flex h-full flex-col justify-center">
      <p className="text-[11.5px] font-medium tracking-wide text-muted uppercase">
        {active ? "Reading the day's news" : "Ready to write"}
      </p>
      {/* A few headlines either side, fading out, like a pile being sifted. */}
      <div className="mt-4 space-y-2" aria-hidden>
        <p className="truncate text-[13px] text-muted/40">{at(-2)?.title}</p>
        <p className="truncate text-[13px] text-muted/70">{at(-1)?.title}</p>
        <div className="rounded-md border border-rule bg-paper px-3 py-2.5 shadow-sm">
          <p className="text-[11.5px] text-muted">{c?.sourceName}</p>
          <p className="line-clamp-2 text-[14px] font-medium">{c?.title}</p>
        </div>
        <p className="truncate text-[13px] text-muted/70">{at(1)?.title}</p>
        <p className="truncate text-[13px] text-muted/40">{at(2)?.title}</p>
      </div>
      <p className="mt-4 text-[12.5px] text-muted">
        Claude is weighing {plural(candidates.length, "story", "stories")} to find the 3 to 5 that
        matter most.
      </p>
    </div>
  );
}

function Caret() {
  return (
    <span
      aria-hidden
      className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] bg-primary motion-safe:animate-pulse"
    />
  );
}

function Elapsed({ since, running }: { since: number; running: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  const s = Math.max(0, Math.floor((now - since) / 1000));
  return (
    <span className="text-[12px] text-muted tabular-nums" title="Elapsed">
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

function Step({
  state,
  title,
  children,
}: {
  state: StepState;
  title: string;
  children?: ReactNode;
}) {
  return (
    <li className="flex gap-3" aria-current={state === "active" ? "step" : undefined}>
      <span
        aria-hidden
        className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${
          state === "done"
            ? "border-blue bg-blue text-paper"
            : state === "error"
              ? "border-danger text-danger"
              : state === "active"
                ? "border-rule border-t-primary motion-safe:animate-spin"
                : "border-rule"
        }`}
      >
        {state === "done" && <CheckIcon className="size-3.5" strokeWidth={2.5} />}
        {state === "error" && <span className="text-[11px] font-bold">!</span>}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[14px] ${state === "pending" ? "text-muted" : "font-medium"}`}>
          {title}
          <span className="sr-only">
            {state === "done" ? " (done)" : state === "error" ? " (failed)" : ""}
          </span>
        </p>
        {children}
      </div>
    </li>
  );
}
