"use client";

import { SparkleIcon } from "@/components/icons";

export function AiButton({
  pending,
  onClick,
  children,
  disabled,
  title,
}: {
  pending: boolean;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || disabled}
      title={title}
      className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-violet-500/30 whitespace-nowrap bg-violet-50 px-2.5 text-[12.5px] font-medium text-violet-800 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <SparkleIcon className={`size-3.5 ${pending ? "animate-pulse" : ""}`} />
      {pending ? "Thinking…" : children}
    </button>
  );
}

export function AiError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-2 text-[12.5px] text-red-600">
      {message}
    </p>
  );
}

/** Generated options the editor can apply. Nothing is applied automatically. */
export function Suggestions({
  items,
  onPick,
  onDismiss,
  pickLabel = "Use",
}: {
  items: string[];
  onPick: (item: string) => void;
  onDismiss: () => void;
  pickLabel?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className="mt-2 rounded-md border border-violet-500/25 bg-violet-50/60 p-1.5">
      <div className="flex items-center justify-between px-1.5 pt-0.5 pb-1">
        <span className="text-[11.5px] font-medium tracking-wide text-violet-800 uppercase">
          Suggestions
        </span>
        <button type="button" onClick={onDismiss} className="text-[12px] text-muted hover:text-ink">
          Dismiss
        </button>
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item}>
            <button
              type="button"
              onClick={() => onPick(item)}
              className="group flex w-full items-start gap-3 rounded-sm px-2 py-1.5 text-left text-[13.5px] hover:bg-paper"
            >
              <span className="flex-1 whitespace-pre-line">{item}</span>
              <span className="shrink-0 text-[12px] font-medium text-violet-700 opacity-60 group-hover:opacity-100">
                {pickLabel}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
