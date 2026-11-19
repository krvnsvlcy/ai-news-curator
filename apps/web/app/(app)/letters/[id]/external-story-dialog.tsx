"use client";

import { type FormEvent, useState } from "react";
import { buttonClass } from "@/components/button-styles";
import { Modal } from "@/components/modal";
import type { EditorStory } from "@/lib/letters";
import { inputClass, labelClass } from "./fields";

const EMPTY = { url: "", title: "", sourceName: "", headline: "", description: "" };

export function ExternalStoryDialog({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (story: Omit<EditorStory, "id">) => void;
}) {
  const [v, setV] = useState(EMPTY);
  const [error, setError] = useState<string>();
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) =>
    setV((prev) => ({ ...prev, [k]: e.target.value }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!/^https?:\/\/\S+\.\S+/.test(v.url.trim()))
      return setError("Enter the article's full http(s) URL.");
    if (!v.title.trim()) return setError("Enter the original headline.");
    if (!v.sourceName.trim()) return setError("Enter the publisher.");
    onAdd({
      articleId: null,
      headline: v.headline.trim(),
      description: v.description.trim(),
      original: { url: v.url.trim(), title: v.title.trim(), sourceName: v.sourceName.trim() },
    });
    setV(EMPTY);
    setError(undefined);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Add an external story">
      <form onSubmit={submit} className="space-y-4 p-5" noValidate>
        <p className="text-[13px] text-muted">
          For stories that aren't in the feed. The original headline and publisher are shown to
          readers as attribution.
        </p>
        <label className="block">
          <span className={labelClass}>Article URL</span>
          <input
            type="url"
            value={v.url}
            onChange={set("url")}
            placeholder="https://…"
            className={`${inputClass} mt-1`}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_160px]">
          <label className="block">
            <span className={labelClass}>Original headline</span>
            <input
              value={v.title}
              onChange={set("title")}
              maxLength={500}
              className={`${inputClass} mt-1`}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Publisher</span>
            <input
              value={v.sourceName}
              onChange={set("sourceName")}
              maxLength={120}
              placeholder="e.g. BBC News"
              className={`${inputClass} mt-1`}
            />
          </label>
        </div>
        <label className="block">
          <span className={labelClass}>
            Our headline <span className="font-normal text-muted">optional</span>
          </span>
          <input
            value={v.headline}
            onChange={set("headline")}
            maxLength={300}
            className={`${inputClass} mt-1`}
          />
        </label>
        <label className="block">
          <span className={labelClass}>
            Description <span className="font-normal text-muted">optional</span>
          </span>
          <textarea
            value={v.description}
            onChange={set("description")}
            maxLength={1000}
            className={`${inputClass} mt-1 h-32 resize-none`}
          />
        </label>
        {error && (
          <p role="alert" className="text-[12.5px] text-red-600">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className={buttonClass("quiet")}>
            Cancel
          </button>
          <button type="submit" className={buttonClass("primary")}>
            Add story
          </button>
        </div>
      </form>
    </Modal>
  );
}
