"use client";

import {
  BRIEFING_WORDS,
  countWords,
  formatLetterDate,
  type NewsletterOptions,
  readinessProblems,
} from "@curator/newsletter";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { buttonClass } from "@/components/button-styles";
import { ArrowLeftIcon, PlusIcon, SendIcon } from "@/components/icons";
import { LetterStatusBadge } from "@/components/letter-status";
import { timeAgo } from "@/lib/format";
import {
  contentOf,
  type EditorLetter,
  type EditorLetterContent,
  type EditorStory,
  type LetterStatus,
  type PickerArticle,
} from "@/lib/letters";
import { TONE_PRESETS } from "@/lib/tones";
import {
  changeLetterStatusAction,
  duplicateLetterAction,
  saveLetterAction,
  suggestLetterHeadlinesAction,
  writeBriefingAction,
} from "../actions";
import { DeleteLetterButton } from "../delete-letter-button";
import { AiButton, AiError, Suggestions } from "./ai-suggestions";
import { ArticlePicker } from "./article-picker";
import { ExternalStoryDialog } from "./external-story-dialog";
import { inputClass, labelClass } from "./fields";
import { LetterPreview } from "./letter-preview";
import { SendDialog } from "./send-dialog";
import { StoryList, toSourceStory } from "./story-list";

const keyOf = (c: EditorLetterContent) => JSON.stringify(contentOf(c));

type Banner = { kind: "error" | "notice" | "success"; text: string; conflict?: boolean };

export function LetterEditor({
  initial,
  publishedHtml,
  sources,
  newsletter,
}: {
  initial: EditorLetter;
  publishedHtml?: string;
  sources: { slug: string; name: string }[];
  newsletter: NewsletterOptions;
}) {
  const [letter, setLetter] = useState(initial);
  const [savedKey, setSavedKey] = useState(() => keyOf(initial));
  const [banner, setBanner] = useState<Banner>();
  const [busy, startBusy] = useTransition();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [externalOpen, setExternalOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [sendOpen, setSendOpen] = useState(false);
  const router = useRouter();

  const locked = letter.status === "published";
  const dirty = !locked && keyOf(letter) !== savedKey;
  const problems = readinessProblems(letter);
  const articleIds = useMemo(
    () => new Set(letter.stories.flatMap((s) => (s.articleId ? [s.articleId] : []))),
    [letter.stories],
  );

  const update = (patch: Partial<EditorLetterContent>) => setLetter((l) => ({ ...l, ...patch }));
  const setStories = (stories: EditorStory[]) => update({ stories });

  /** Saves current content. Returns the new revision, or null on failure. */
  const save = useCallback(async (): Promise<number | null> => {
    const sent = contentOf(letter);
    const res = await saveLetterAction(letter.id, letter.revision, sent);
    if (!res.ok) {
      setBanner({ kind: "error", text: res.error, conflict: res.conflict });
      return null;
    }
    // Keep anything typed while the save was in flight; take server metadata.
    setLetter((l) => ({
      ...l,
      revision: res.letter.revision,
      status: res.letter.status,
      updatedAt: res.letter.updatedAt,
    }));
    setSavedKey(keyOf(sent));
    setBanner(
      res.notice ? { kind: "notice", text: res.notice } : { kind: "success", text: "Saved" },
    );
    return res.letter.revision;
  }, [letter]);

  const runSave = useCallback(() => startBusy(async () => void (await save())), [save]);

  function changeStatus(to: LetterStatus) {
    if (
      to === "published" &&
      !confirm("Mark this letter as published? It will be locked for editing.")
    ) {
      return;
    }
    startBusy(async () => {
      let revision: number | null = letter.revision;
      if (dirty) revision = await save();
      if (revision === null) return;
      const res = await changeLetterStatusAction(letter.id, revision, to);
      if (!res.ok) {
        setBanner({ kind: "error", text: res.error, conflict: res.conflict });
        return;
      }
      setLetter((l) => ({ ...l, ...res.letter, ...contentOf(l) }));
      setBanner({
        kind: "success",
        text:
          to === "ready"
            ? "Marked ready"
            : to === "published"
              ? "Marked published"
              : "Moved back to draft",
      });
    });
  }

  // Cmd/Ctrl+S saves; warn before leaving with unsaved edits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !busy) runSave();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [dirty, busy, runSave]);

  useEffect(() => {
    if (banner?.kind !== "success") return;
    const t = setTimeout(() => setBanner(undefined), 2500);
    return () => clearTimeout(t);
  }, [banner]);

  // Functional updates: several adds can happen before the next render.
  const appendStory = (story: EditorStory) =>
    setLetter((l) => ({ ...l, stories: [...l.stories, story] }));

  function addArticle(a: PickerArticle) {
    setLetter((l) => {
      if (l.stories.some((s) => s.articleId === a.id)) return l;
      return {
        ...l,
        stories: [
          ...l.stories,
          {
            id: crypto.randomUUID(),
            articleId: a.id,
            headline: "",
            description: "",
            original: {
              title: a.title,
              url: a.url,
              sourceName: a.sourceName,
              publishedAt: a.publishedAt,
              ...(a.summary ? { summary: a.summary } : {}),
            },
          },
        ],
      };
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Toolbar */}
      <header className="shrink-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
          <Link
            href="/letters"
            className={`${buttonClass("quiet")} -ml-2 px-2`}
            aria-label="Back to letters"
          >
            <ArrowLeftIcon className="size-4" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-[15px] font-semibold">
                {letter.headline.trim() || (
                  <span className="text-muted italic">Untitled letter</span>
                )}
              </h1>
              <LetterStatusBadge status={letter.status} />
            </div>
            <p className="text-[12px] text-muted">
              {formatLetterDate(letter.date)} ·{" "}
              {dirty ? (
                <span className="text-amber-700">Unsaved changes</span>
              ) : locked && letter.publishedAt ? (
                `Published ${timeAgo(new Date(letter.publishedAt))}`
              ) : (
                `Saved ${timeAgo(new Date(letter.updatedAt))}`
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {letter.status === "draft" && (
              <DeleteLetterButton
                id={letter.id}
                label={letter.headline || "Untitled letter"}
                compact
              />
            )}
            {letter.sends.some((x) => x.kind === "subscribers") && (
              <Link href={`/letters/${letter.id}/analytics`} className={buttonClass("quiet")}>
                Analytics
              </Link>
            )}
            <button
              type="button"
              onClick={() => setSendOpen(true)}
              disabled={busy}
              className={buttonClass("secondary")}
            >
              <SendIcon className="size-4" /> Send
            </button>
            {locked ? (
              <form action={duplicateLetterAction.bind(null, letter.id)}>
                <button type="submit" className={buttonClass("secondary")}>
                  Duplicate as new draft
                </button>
              </form>
            ) : (
              <>
                <button
                  type="button"
                  onClick={runSave}
                  disabled={!dirty || busy}
                  className={buttonClass("secondary")}
                >
                  {busy && dirty ? "Saving…" : "Save"}
                  <kbd className="hidden text-[11px] text-muted sm:inline">⌘S</kbd>
                </button>
                {letter.status === "draft" && (
                  <button
                    type="button"
                    onClick={() => changeStatus("ready")}
                    disabled={busy || problems.length > 0}
                    title={
                      problems.length ? problems.join(" ") : "Approve this letter for publication"
                    }
                    className={buttonClass("primary")}
                  >
                    Mark ready
                  </button>
                )}
                {letter.status === "ready" && (
                  <>
                    <button
                      type="button"
                      onClick={() => changeStatus("draft")}
                      disabled={busy}
                      className={buttonClass("secondary")}
                    >
                      Back to draft
                    </button>
                    <button
                      type="button"
                      onClick={() => changeStatus("published")}
                      disabled={busy || problems.length > 0}
                      className={buttonClass("primary")}
                    >
                      Mark published
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </div>
        {banner && (
          <div
            role={banner.kind === "error" ? "alert" : "status"}
            className={`mx-4 mb-3 rounded-md border px-3 py-2 text-[13px] sm:mx-6 ${
              banner.kind === "error"
                ? "border-red-600/20 bg-red-50 text-red-800"
                : banner.kind === "notice"
                  ? "border-amber-500/20 bg-amber-50 text-amber-900"
                  : "border-sea/25 bg-sea/10 text-sea"
            }`}
          >
            {banner.text}
            {banner.conflict && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="ml-2 font-medium underline"
              >
                Reload
              </button>
            )}
          </div>
        )}
        <div role="tablist" aria-label="View" className="flex px-4 sm:px-6 xl:hidden">
          {(["edit", "preview"] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="tab"
              aria-selected={mobileView === v}
              onClick={() => setMobileView(v)}
              className="flex-1 py-2 text-[13px] text-muted capitalize aria-selected:border-b-2 aria-selected:border-ink aria-selected:font-medium aria-selected:text-ink"
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Editor column */}
        <div
          className={`space-y-5 overflow-y-auto px-4 py-6 sm:px-6 ${mobileView === "edit" ? "" : "hidden xl:block"}`}
        >
          {locked && (
            <p className="rounded-md border border-sea/25 bg-sea/10 px-3 py-2 text-[13px] text-sea">
              This edition is published and locked so it stays exactly as sent. Duplicate it to
              start a new draft.
            </p>
          )}
          {!locked && problems.length > 0 && (
            <div className="rounded-md border border-rule bg-paper px-3 py-2.5">
              <p className="text-[12.5px] font-medium">Before it's ready</p>
              <ul className="mt-1 list-inside list-disc text-[12.5px] text-muted">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}

          <EditionSection letter={letter} locked={locked} onChange={update} />
          <BriefingSection
            letter={letter}
            locked={locked}
            onChange={(briefing) => update({ briefing })}
          />

          <section aria-labelledby="stories-heading">
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="stories-heading" className="text-[14px] font-semibold">
                  Stories{" "}
                  <span className="font-normal text-muted tabular-nums">
                    {letter.stories.length}
                  </span>
                </h2>
                {!locked && (
                  <p className="text-[12.5px] text-muted">
                    Drag to reorder. The first story leads the email.
                  </p>
                )}
              </div>
              {!locked && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setExternalOpen(true)}
                    className={buttonClass("quiet")}
                  >
                    Add external
                  </button>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className={buttonClass("secondary")}
                  >
                    <PlusIcon className="size-4" /> Add from feed
                  </button>
                </div>
              )}
            </div>
            {letter.stories.length === 0 ? (
              <div className="rounded-lg border border-dashed border-rule px-6 py-10 text-center">
                <p className="text-[13.5px] font-medium">No stories yet</p>
                <p className="mt-1 text-[12.5px] text-muted">
                  Pick articles from the feed to build this edition.
                </p>
                {!locked && (
                  <button
                    type="button"
                    onClick={() => setPickerOpen(true)}
                    className={`${buttonClass("secondary")} mt-3`}
                  >
                    Browse articles
                  </button>
                )}
              </div>
            ) : (
              <StoryList
                stories={letter.stories}
                tone={letter.tone}
                locked={locked}
                onChange={setStories}
              />
            )}
          </section>
        </div>

        {/* Preview column */}
        <div
          className={`px-4 py-6 sm:px-6 xl:pl-0 ${mobileView === "preview" ? "" : "hidden xl:block"}`}
        >
          <div className="h-full">
            <LetterPreview
              letter={letter}
              newsletter={newsletter}
              publishedHtml={locked ? publishedHtml : undefined}
            />
          </div>
        </div>
      </div>

      <ArticlePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        sources={sources}
        selectedArticleIds={articleIds}
        onAdd={addArticle}
      />
      <SendDialog
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        letterId={letter.id}
        status={letter.status}
        revision={letter.revision}
        sends={letter.sends}
        ensureSaved={async () => (dirty ? save() : letter.revision)}
        onSent={(send, published) => {
          setLetter((l) => ({ ...l, sends: [...l.sends, send] }));
          // Publishing changes status; reload server data so the editor locks and shows the archive.
          if (published) router.refresh();
        }}
      />
      <ExternalStoryDialog
        open={externalOpen}
        onClose={() => setExternalOpen(false)}
        onAdd={(s) => appendStory({ ...s, id: crypto.randomUUID() })}
      />
    </div>
  );
}

function Section({
  title,
  children,
  aside,
}: {
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-rule bg-paper p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function EditionSection({
  letter,
  locked,
  onChange,
}: {
  letter: EditorLetter;
  locked: boolean;
  onChange: (patch: Partial<EditorLetterContent>) => void;
}) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  function suggest() {
    setError(undefined);
    start(async () => {
      const res = await suggestLetterHeadlinesAction({
        stories: letter.stories.map(toSourceStory),
        tone: letter.tone,
        currentHeadline: letter.headline,
      });
      if (res.ok) setSuggestions(res.value);
      else setError(res.error);
    });
  }

  return (
    <Section title="Edition">
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="letter-headline" className={labelClass}>
              Headline
            </label>
            {!locked && (
              <AiButton
                pending={pending}
                onClick={suggest}
                disabled={letter.stories.length === 0}
                title={
                  letter.stories.length === 0
                    ? "Add stories first"
                    : "Suggest headlines from the selected stories"
                }
              >
                Suggest
              </AiButton>
            )}
          </div>
          <input
            id="letter-headline"
            value={letter.headline}
            onChange={(e) => onChange({ headline: e.target.value })}
            placeholder="The day in one line"
            maxLength={200}
            disabled={locked}
            className={`${inputClass} mt-1.5 text-[17px] font-semibold`}
          />
          <AiError message={error} />
          <Suggestions
            items={suggestions}
            onPick={(h) => onChange({ headline: h })}
            onDismiss={() => setSuggestions([])}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">
          <div>
            <label htmlFor="letter-date" className={labelClass}>
              Publication date
            </label>
            <input
              id="letter-date"
              type="date"
              value={letter.date}
              onChange={(e) => e.target.value && onChange({ date: e.target.value })}
              disabled={locked}
              required
              className={`${inputClass} mt-1.5`}
            />
          </div>
          <div>
            <label htmlFor="letter-tone" className={labelClass}>
              Editorial tone <span className="font-normal text-muted">for AI suggestions</span>
            </label>
            <input
              id="letter-tone"
              value={letter.tone}
              onChange={(e) => onChange({ tone: e.target.value })}
              placeholder="Dry, understated British wit"
              maxLength={300}
              disabled={locked}
              className={`${inputClass} mt-1.5`}
            />
            {!locked && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {TONE_PRESETS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onChange({ tone: t })}
                    aria-pressed={letter.tone === t}
                    className="rounded-sm border border-rule px-1.5 py-0.5 text-[11.5px] text-muted hover:text-ink aria-pressed:border-ink aria-pressed:text-ink"
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}

function BriefingSection({
  letter,
  locked,
  onChange,
}: {
  letter: EditorLetter;
  locked: boolean;
  onChange: (briefing: string) => void;
}) {
  const [draft, setDraft] = useState<string>();
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const words = countWords(letter.briefing);
  const inRange = words >= BRIEFING_WORDS.min && words <= BRIEFING_WORDS.max;
  const hasText = letter.briefing.trim().length > 0;

  function generate() {
    setError(undefined);
    start(async () => {
      const res = await writeBriefingAction({
        stories: letter.stories.map(toSourceStory),
        tone: letter.tone,
        date: letter.date,
        currentDraft: hasText ? letter.briefing : undefined,
        instruction: instruction || undefined,
      });
      if (res.ok) setDraft(res.value);
      else setError(res.error);
    });
  }

  return (
    <Section
      title="Daily briefing"
      aside={
        <span
          className={`text-[12px] tabular-nums ${words === 0 ? "text-muted" : inRange ? "text-sea" : "text-amber-700"}`}
        >
          {words} / {BRIEFING_WORDS.min}–{BRIEFING_WORDS.max} words
        </span>
      }
    >
      <textarea
        aria-label="Daily briefing"
        value={letter.briefing}
        onChange={(e) => onChange(e.target.value)}
        placeholder="A short editorial overview of the day's most important developments. Separate paragraphs with a blank line."
        rows={6}
        maxLength={5000}
        disabled={locked}
        className={`${inputClass} resize-y font-serif text-[15px] leading-relaxed`}
      />
      {!locked && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={
              hasText
                ? "Optional direction, e.g. “tighter”, “lead with the bills”"
                : "Optional direction"
            }
            maxLength={500}
            className={`${inputClass} h-7 py-0 text-[13px]`}
          />
          <AiButton
            pending={pending}
            onClick={generate}
            disabled={letter.stories.length === 0}
            title={
              letter.stories.length === 0
                ? "Add stories first"
                : "Uses only the selected stories as source material"
            }
          >
            {hasText ? "Revise with AI" : "Write with AI"}
          </AiButton>
        </div>
      )}
      <AiError message={error} />
      {draft && (
        <Suggestions
          items={[draft]}
          pickLabel="Replace briefing"
          onPick={(text) => {
            onChange(text);
            setDraft(undefined);
          }}
          onDismiss={() => setDraft(undefined)}
        />
      )}
    </Section>
  );
}
