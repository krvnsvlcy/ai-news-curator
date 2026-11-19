"use client";

import { type ReactNode, useEffect, useRef } from "react";
import { CloseIcon } from "./icons";

/** Native <dialog> modal: focus trapping, Escape and backdrop come from the browser. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  /** md: forms and confirmations; lg: lists; xl: multi-step flows. */
  size?: "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: backdrop click only; Escape is handled natively by <dialog>
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={`m-auto max-h-[85dvh] w-[calc(100%-2rem)] ${{ md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size]} overflow-hidden rounded-xl border border-rule bg-paper p-0 text-ink shadow-2xl backdrop:bg-black/40`}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between border-b border-rule px-5 py-3">
            <h2 className="text-[15px] font-semibold">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink"
            >
              <CloseIcon className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
          {footer && <div className="border-t border-rule bg-canvas px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
