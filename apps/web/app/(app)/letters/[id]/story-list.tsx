"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, useState, useTransition } from "react";
import { ExternalIcon, GripIcon, SparkleIcon, TrashIcon } from "@/components/icons";
import type { EditorStory } from "@/lib/letters";
import { suggestStoryHeadlinesAction } from "../actions";
import { AiButton, AiError, Suggestions } from "./ai-suggestions";
import { inputClass } from "./fields";

export function toSourceStory(s: EditorStory) {
  return {
    publisher: s.original.sourceName,
    originalHeadline: s.original.title,
    ...(s.original.summary ? { summary: s.original.summary } : {}),
    ...(s.headline.trim() ? { headline: s.headline } : {}),
    ...(s.description.trim() ? { description: s.description } : {}),
  };
}

export function StoryList({
  stories,
  tone,
  locked,
  onChange,
}: {
  stories: EditorStory[];
  tone: string;
  locked: boolean;
  onChange: (stories: EditorStory[]) => void;
}) {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = stories.findIndex((s) => s.id === active.id);
    const to = stories.findIndex((s) => s.id === over.id);
    if (from >= 0 && to >= 0) onChange(arrayMove(stories, from, to));
  }

  const update = (id: string, patch: Partial<EditorStory>) =>
    onChange(stories.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const remove = (id: string) => onChange(stories.filter((s) => s.id !== id));

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={stories.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ol className="space-y-3">
          {stories.map((story, i) => (
            <StoryCard
              key={story.id}
              story={story}
              index={i}
              tone={tone}
              locked={locked}
              otherHeadlines={stories.filter((s) => s.id !== story.id).map((s) => s.headline)}
              onUpdate={(patch) => update(story.id, patch)}
              onRemove={() => remove(story.id)}
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function StoryCard({
  story,
  index,
  tone,
  locked,
  otherHeadlines,
  onUpdate,
  onRemove,
}: {
  story: EditorStory;
  index: number;
  tone: string;
  locked: boolean;
  otherHeadlines: string[];
  onUpdate: (patch: Partial<EditorStory>) => void;
  onRemove: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: story.id, disabled: locked });
  const [aiOpen, setAiOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const n = String(index + 1).padStart(2, "0");

  function generate() {
    setError(undefined);
    startTransition(async () => {
      const res = await suggestStoryHeadlinesAction({
        story: toSourceStory(story),
        tone,
        instruction,
        otherHeadlines,
      });
      if (res.ok) setSuggestions(res.value);
      else setError(res.error);
    });
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`rounded-lg border bg-paper ${isDragging ? "relative z-10 border-ink shadow-lg" : "border-rule"}`}
    >
      <div className="flex gap-2 p-3 sm:p-4">
        <div className="flex flex-col items-center gap-1 pt-1">
          {!locked && (
            <button
              type="button"
              ref={setActivatorNodeRef}
              {...attributes}
              {...listeners}
              aria-label={`Reorder story ${index + 1}. Press space to pick up, arrows to move.`}
              className="cursor-grab touch-none rounded p-0.5 text-muted hover:bg-hover hover:text-ink active:cursor-grabbing"
            >
              <GripIcon className="size-4" />
            </button>
          )}
          <span className="text-[11px] font-semibold text-muted tabular-nums">{n}</span>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <input
            aria-label={`Headline for story ${index + 1}`}
            value={story.headline}
            onChange={(e) => onUpdate({ headline: e.target.value })}
            placeholder={story.original.title}
            title="Leave empty to use the original headline"
            disabled={locked}
            maxLength={300}
            className={`${inputClass} text-[15px] font-semibold`}
          />
          <textarea
            aria-label={`Description for story ${index + 1}`}
            value={story.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
            placeholder="Optional context (one or two sentences)"
            disabled={locked}
            rows={2}
            maxLength={1000}
            className={`${inputClass} resize-y text-[13.5px]`}
          />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
            <span className="font-medium text-ink">{story.original.sourceName}</span>
            {!story.articleId && (
              <span className="rounded border border-rule px-1 text-[11px]">External</span>
            )}
            <a
              href={story.original.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-1 hover:text-ink hover:underline"
              title="Open original article"
            >
              <span className="truncate">{story.original.title}</span>
              <ExternalIcon className="size-3.5 shrink-0" />
            </a>
          </div>

          {!locked && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => setAiOpen((o) => !o)}
                aria-expanded={aiOpen}
                className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12.5px] text-violet-700 hover:bg-violet-50 dark:text-violet-300 dark:hover:bg-violet-950/40"
              >
                <SparkleIcon className="size-3.5" />
                {story.headline.trim() ? "Rewrite headline" : "Suggest headline"}
              </button>
              {story.headline !== story.original.title && (
                <button
                  type="button"
                  onClick={() => onUpdate({ headline: story.original.title })}
                  className="h-7 rounded-md px-2 text-[12.5px] text-muted hover:bg-hover hover:text-ink"
                >
                  Use original
                </button>
              )}
              <button
                type="button"
                onClick={onRemove}
                className="ml-auto inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12.5px] text-muted hover:bg-red-50 hover:text-red-700 dark:hover:bg-red-950/30"
                aria-label={`Remove story ${index + 1} from letter`}
              >
                <TrashIcon className="size-3.5" /> Remove
              </button>
            </div>
          )}

          {aiOpen && !locked && (
            <div className="rounded-md border border-rule bg-canvas p-2.5">
              <div className="flex gap-2">
                <input
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      generate();
                    }
                  }}
                  placeholder="Optional direction, e.g. “punchier”, “less pun-heavy”"
                  maxLength={500}
                  className={`${inputClass} h-7 py-0 text-[13px]`}
                />
                <AiButton pending={pending} onClick={generate}>
                  Generate
                </AiButton>
              </div>
              <AiError message={error} />
              <Suggestions
                items={suggestions}
                onPick={(h) => onUpdate({ headline: h })}
                onDismiss={() => setSuggestions([])}
              />
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
