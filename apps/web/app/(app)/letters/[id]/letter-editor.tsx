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
import { ConfirmDialog } from "@/components/confirm-dialog";
import { PlusIcon } from "@/components/icons";
import { LetterStatusBadge } from "@/components/letter-status";
import { PageHeader } from "@/components/page";
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
import { publishLetterAction } from "../send-actions";
import { AiButton, AiError, Suggestions } from "./ai-suggestions";
import { ArticlePicker } from "./article-picker";
import { ExternalStoryDialog } from "./external-story-dialog";
import { inputClass, labelClass } from "./fields";
import { LetterPreview } from "./letter-preview";
import { StoryList, toSourceStory } from "./story-list";

const keyOf = (c: EditorLetterContent) => JSON.stringify(contentOf(c));

type Banner = { kind: "error" | "notice" | "success"; text: string; conflict?: boolean };

export function LetterEditor({
  initial,
  publishedHtml,
  sources,
  newsletter,
  analytics,
  initialView = "content",
}: {
  initial: EditorLetter;
  publishedHtml?: string;
  sources: { slug: string; name: string }[];
  newsletter: NewsletterOptions;
  /** Rendered stats for a published letter; enables the Content / Analytics switch. */
  analytics?: React.ReactNode;
  initialView?: "content" | "analytics";
}) {
  const [letter, setLetter] = useState(initial);
  const [savedKey, setSavedKey] = useState(() => keyOf(initial));
  const [banner, setBanner] = useState<Banner>();
  const [busy, startBusy] = useTransition();
  const [saving, setSaving] = useState(false);
  /** The content that last failed to save; not retried until it changes (or ever, on a conflict). */
  const [saveError, setSaveError] = useState<{ key: string; conflict?: boolean }>();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [externalOpen, setExternalOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"edit" | "preview">("edit");
  const [tab, setTab] = useState<"edition" | "stories">("edition");
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishError, setPublishError] = useState<string>();
  const [view, setViewState] = useState(initialView);
  const showAnalytics = analytics !== undefined && view === "analytics";
  function setView(v: "content" | "analytics") {
    setViewState(v);
    // Keep the view in the URL so it survives reloads and can be linked.
    const url = new URL(window.location.href);
    if (v === "analytics") url.searchParams.set("view", "analytics");
    else url.searchParams.delete("view");
    window.history.replaceState(null, "", url);
  }
  const router = useRouter();

  const locked = letter.status === "published";
  const currentKey = keyOf(letter);
  const dirty = !locked && currentKey !== savedKey;
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
    setSaving(true);
    const res = await saveLetterAction(letter.id, letter.revision, sent).finally(() =>
      setSaving(false),
    );
    if (!res.ok) {
      setSaveError({ key: keyOf(sent), conflict: res.conflict });
      setBanner({ kind: "error", text: res.error, conflict: res.conflict });
      return null;
    }
    setSaveError(undefined);
    // Keep anything typed while the save was in flight; take server metadata.
    setLetter((l) => ({
      ...l,
      revision: res.letter.revision,
      status: res.letter.status,
      updatedAt: res.letter.updatedAt,
    }));
    setSavedKey(keyOf(sent));
    if (res.notice) setBanner({ kind: "notice", text: res.notice });
    else setBanner((b) => (b?.kind === "error" ? undefined : b));
    return res.letter.revision;
  }, [letter]);

  // Autosave shortly after edits stop. `save` changes with every edit, which
  // restarts the timer. One save at a time; status changes save for themselves.
  const saveBlocked = saveError?.conflict || saveError?.key === currentKey;
  useEffect(() => {
    if (!dirty || saving || busy || saveBlocked) return;
    const t = setTimeout(() => void save(), 800);
    return () => clearTimeout(t);
  }, [dirty, saving, busy, saveBlocked, save]);

  function changeStatus(to: Exclude<LetterStatus, "published">) {
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
        text: to === "ready" ? "Marked ready" : "Moved back to draft",
      });
    });
  }

  function publish() {
    setPublishError(undefined);
    startBusy(async () => {
      let revision: number | null = letter.revision;
      if (dirty) revision = await save();
      if (revision === null) {
        setPublishError("Couldn't save your latest changes, so nothing was published.");
        return;
      }
      const res = await publishLetterAction({ id: letter.id, revision });
      if (!res.ok) {
        setPublishError(res.error);
        if (res.conflict) setBanner({ kind: "error", text: res.error, conflict: true });
        return;
      }
      setPublishOpen(false);
      const failed = res.failed.length;
      setLetter((l) => ({ ...l, ...res.letter, ...contentOf(l) }));
      setBanner({
        kind: failed ? "notice" : "success",
        text:
          res.delivered === 0
            ? "Published"
            : `Published and sent to ${res.delivered} ${res.delivered === 1 ? "subscriber" : "subscribers"}${failed ? ` · ${failed} failed` : ""}`,
      });
      // Reload server data so the editor shows the archived edition.
      router.refresh();
    });
  }

  // Cmd/Ctrl+S saves now; warn before leaving with unsaved edits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving && !busy) void save();
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
  }, [dirty, saving, busy, save]);

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
      <PageHeader
        title={letter.headline.trim() || <span className="text-muted italic">Untitled letter</span>}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-1.5">
            <Link href="/letters" className="hover:text-ink hover:underline">
              Letters
            </Link>
            <span>/</span>
            <LetterStatusBadge status={letter.status} />
            <span>·</span>
            <span>{formatLetterDate(letter.date)}</span>
            <span>·</span>
            {saveBlocked && dirty ? (
              <span className="text-danger">Not saved</span>
            ) : saving || dirty ? (
              <span>Saving…</span>
            ) : locked && letter.publishedAt ? (
              <span>Published {timeAgo(new Date(letter.publishedAt))}</span>
            ) : (
              <span>Saved {timeAgo(new Date(letter.updatedAt))}</span>
            )}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {letter.status === "draft" && (
              <DeleteLetterButton
                id={letter.id}
                label={letter.headline || "Untitled letter"}
                compact
                stay={false}
              />
            )}
            {analytics !== undefined && (
              <fieldset className="flex rounded-md border border-rule p-0.5">
                <legend className="sr-only">View</legend>
                {(["content", "analytics"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className="rounded-sm px-2.5 py-0.5 text-[12.5px] text-muted capitalize aria-pressed:bg-ink aria-pressed:text-paper"
                  >
                    {v}
                  </button>
                ))}
              </fieldset>
            )}
            {locked ? (
              <form action={duplicateLetterAction.bind(null, letter.id)}>
                <button type="submit" className={buttonClass("secondary")}>
                  Duplicate as new draft
                </button>
              </form>
            ) : (
              <>
                {letter.status === "draft" && (
                  <button
                    type="button"
                    onClick={() => changeStatus("ready")}
                    disabled={busy || saving || problems.length > 0}
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
                      disabled={busy || saving}
                      className={buttonClass("secondary")}
                    >
                      Back to draft
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPublishError(undefined);
                        setPublishOpen(true);
                      }}
                      disabled={busy || saving || problems.length > 0}
                      className={buttonClass("primary")}
                    >
                      Publish
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        }
      />

      <div className="shrink-0">
        {banner && (
          <div
            role={banner.kind === "error" ? "alert" : "status"}
            className={`mx-4 mb-3 rounded-md border px-3 py-2 text-[13px] sm:mx-8 ${
              banner.kind === "error"
                ? "border-danger/20 bg-red-50 text-danger"
                : banner.kind === "notice"
                  ? "border-amber-500/20 bg-amber-50 text-amber-900"
                  : "border-blue/25 bg-blue/10 text-blue"
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
        <div
          role="tablist"
          aria-label="View"
          className={`flex px-4 sm:px-8 xl:hidden ${showAnalytics ? "hidden" : ""}`}
        >
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
      </div>

      {showAnalytics && (
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-2 pb-8 sm:px-8">{analytics}</main>
      )}

      <div
        className={`grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] ${showAnalytics ? "hidden" : ""}`}
      >
        {/* Editor column */}
        <div
          className={`min-h-0 px-4 py-6 sm:px-8 ${mobileView === "edit" ? "" : "hidden xl:block"}`}
        >
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3 pb-3">
              <div
                role="tablist"
                aria-label="Letter sections"
                className="flex rounded-md border border-rule p-0.5"
              >
                {(
                  [
                    ["edition", "Edition"],
                    ["stories", "Stories"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    id={`tab-${id}`}
                    aria-controls={`panel-${id}`}
                    aria-selected={tab === id}
                    onClick={() => setTab(id)}
                    className="rounded-sm px-2.5 py-0.5 text-[12.5px] text-muted aria-selected:bg-ink aria-selected:text-paper"
                  >
                    {label}
                    {id === "stories" && (
                      <span className="ml-1 tabular-nums opacity-70">{letter.stories.length}</span>
                    )}
                  </button>
                ))}
              </div>
              {tab === "stories" && !locked && (
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

            <div
              role="tabpanel"
              id={`panel-${tab}`}
              aria-labelledby={`tab-${tab}`}
              className="-mx-1 min-h-0 flex-1 space-y-5 overflow-y-auto px-1 pt-4 pb-1"
            >
              {locked && (
                <p className="rounded-md border border-blue/25 bg-blue/10 px-3 py-2 text-[13px] text-blue">
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

              {tab === "edition" ? (
                <>
                  <EditionSection letter={letter} locked={locked} onChange={update} />
                  <div className="border-t border-rule pt-5">
                    <BriefingSection
                      letter={letter}
                      locked={locked}
                      onChange={(briefing) => update({ briefing })}
                    />
                  </div>
                </>
              ) : letter.stories.length === 0 ? (
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
                <div>
                  {!locked && (
                    <p className="mb-2 text-[12.5px] text-muted">
                      Drag to reorder. The first story leads the email.
                    </p>
                  )}
                  <StoryList
                    stories={letter.stories}
                    tone={letter.tone}
                    locked={locked}
                    onChange={setStories}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Preview column */}
        <div
          className={`px-4 py-6 sm:px-8 xl:pl-0 ${mobileView === "preview" ? "" : "hidden xl:block"}`}
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
      <ConfirmDialog
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        onConfirm={publish}
        title="Publish this letter?"
        confirmLabel="Publish"
        pendingLabel="Publishing…"
        pending={busy}
        error={publishError}
      >
        <p>
          <span className="font-medium">{letter.headline.trim() || "Untitled letter"}</span> goes
          out to everyone on your subscriber list.
        </p>
        <p className="text-muted">
          Once published, the letter is locked so it stays exactly as sent. You can still duplicate
          it as a new draft.
        </p>
      </ConfirmDialog>
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
    <section>
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
            <div className="group relative mt-1.5">
              <input
                id="letter-tone"
                value={letter.tone}
                onChange={(e) => onChange({ tone: e.target.value })}
                onKeyDown={(e) => e.key === "Escape" && e.currentTarget.blur()}
                placeholder="Dry, understated British wit"
                maxLength={300}
                disabled={locked}
                autoComplete="off"
                className={inputClass}
              />
              {!locked && (
                <fieldset className="absolute inset-x-0 top-full z-20 mt-1 hidden flex-wrap gap-1 rounded-md border border-rule bg-paper p-2 shadow-lg group-focus-within:flex">
                  <legend className="sr-only">Tone presets</legend>
                  {TONE_PRESETS.map((t) => (
                    <button
                      key={t}
                      type="button"
                      // Keep focus in the input so the popper stays open until a pick.
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        onChange({ tone: t });
                        (document.activeElement as HTMLElement | null)?.blur();
                      }}
                      aria-pressed={letter.tone === t}
                      className="rounded-sm border border-rule px-1.5 py-0.5 text-[11.5px] text-muted hover:text-ink aria-pressed:border-ink aria-pressed:text-ink"
                    >
                      {t}
                    </button>
                  ))}
                </fieldset>
              )}
            </div>
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
          className={`text-[12px] tabular-nums ${words === 0 ? "text-muted" : inRange ? "text-blue" : "text-amber-700"}`}
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
        maxLength={5000}
        disabled={locked}
        className={`${inputClass} h-80 resize-none font-serif text-[15px] leading-relaxed`}
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
