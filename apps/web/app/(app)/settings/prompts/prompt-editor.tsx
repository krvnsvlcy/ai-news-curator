"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/button-styles";
import { timeAgo } from "@/lib/format";
import { resetPromptAction, savePromptAction } from "./actions";

export function PromptEditor({
  promptKey,
  title,
  description,
  variables,
  defaultText,
  initialText,
  initialUpdatedAt,
  tall,
}: {
  promptKey: string;
  title: string;
  description: string;
  variables: [name: string, meaning: string][];
  defaultText: string;
  initialText: string;
  initialUpdatedAt?: string;
  tall: boolean;
}) {
  const [saved, setSaved] = useState({ text: initialText, updatedAt: initialUpdatedAt });
  const [text, setText] = useState(initialText);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string }>();
  const [pending, start] = useTransition();

  const dirty = text !== saved.text;
  const customized = saved.text !== defaultText;
  const missing = variables.filter(([name]) => !text.includes(`{{${name}}}`)).map(([n]) => n);
  const fieldId = `prompt-${promptKey}`;

  function apply(action: () => ReturnType<typeof savePromptAction>, done: string) {
    setMessage(undefined);
    start(async () => {
      const res = await action();
      if (!res.ok) {
        setMessage({ kind: "error", text: res.error });
        return;
      }
      setSaved({ text: res.text, updatedAt: res.updatedAt });
      setText(res.text);
      setMessage({ kind: "ok", text: done });
    });
  }

  return (
    <section
      aria-labelledby={`${fieldId}-title`}
      className="overflow-hidden rounded-lg border border-rule bg-paper"
    >
      <div className="px-4 pt-3.5 pb-3 sm:px-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 id={`${fieldId}-title`} className="text-[14px] font-semibold">
            {title}
          </h2>
          {customized ? (
            <span className="rounded-sm bg-blue/10 px-1.5 py-0.5 text-[11.5px] font-medium text-blue">
              Customized
              {saved.updatedAt && (
                <span className="font-normal"> · {timeAgo(new Date(saved.updatedAt))}</span>
              )}
            </span>
          ) : (
            <span className="rounded-sm bg-chip px-1.5 py-0.5 text-[11.5px] text-muted">
              Default
            </span>
          )}
        </div>
        <p className="mt-0.5 text-[12.5px] text-muted">{description}</p>
        {variables.length > 0 && (
          <p className="mt-1.5 text-[12px] text-muted">
            Placeholders:{" "}
            {variables.map(([name, meaning], i) => (
              <span key={name}>
                {i > 0 && ", "}
                <code className="rounded-sm bg-chip px-1 font-mono text-[11.5px] text-ink">{`{{${name}}}`}</code>{" "}
                {meaning}
              </span>
            ))}
          </p>
        )}
      </div>

      <textarea
        id={fieldId}
        aria-labelledby={`${fieldId}-title`}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setMessage(undefined);
        }}
        spellCheck={false}
        maxLength={20_000}
        className={`block w-full resize-none border-0 border-y border-rule bg-transparent px-4 py-3 font-mono text-[12.5px] leading-relaxed text-ink outline-none transition-colors focus:bg-hover/40 sm:px-5 ${tall ? "h-96" : "h-40"}`}
      />

      <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 sm:px-5">
        <div className="min-w-0 flex-1 text-[12.5px]">
          {message ? (
            <span
              role={message.kind === "error" ? "alert" : "status"}
              className={message.kind === "error" ? "text-danger" : "text-blue"}
            >
              {message.text}
            </span>
          ) : missing.length > 0 ? (
            <span className="text-amber-700">
              Doesn't use {missing.map((n) => `{{${n}}}`).join(", ")}
            </span>
          ) : dirty ? (
            <span className="text-muted">Unsaved changes</span>
          ) : null}
        </div>
        {dirty && (
          <button
            type="button"
            onClick={() => {
              setText(saved.text);
              setMessage(undefined);
            }}
            disabled={pending}
            className={buttonClass("quiet")}
          >
            Discard
          </button>
        )}
        {customized && !dirty && (
          <button
            type="button"
            onClick={() => {
              if (confirm(`Reset “${title}” to the default prompt?`)) {
                apply(() => resetPromptAction(promptKey), "Reset to default");
              }
            }}
            disabled={pending}
            className={buttonClass("quiet")}
          >
            Reset to default
          </button>
        )}
        <button
          type="button"
          onClick={() => apply(() => savePromptAction(promptKey, text), "Saved")}
          disabled={!dirty || pending || !text.trim()}
          className={buttonClass("primary")}
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </section>
  );
}
