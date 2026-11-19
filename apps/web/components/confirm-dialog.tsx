"use client";

import type { ReactNode } from "react";
import { buttonClass } from "./button-styles";
import { Modal } from "./modal";

/**
 * Asks before an action that's hard to undo. Stays open while `pending` (so
 * the action's progress and any `error` show here) and can't be dismissed then.
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel,
  pendingLabel,
  pending = false,
  error,
  danger = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  error?: string;
  /** Destructive: red confirm button, and Cancel gets focus first. */
  danger?: boolean;
}) {
  const close = () => {
    if (!pending) onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            // biome-ignore lint/a11y/noAutofocus: a modal should focus its safest action on open
            autoFocus={danger}
            className={buttonClass("quiet")}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            // biome-ignore lint/a11y/noAutofocus: a modal should focus its safest action on open
            autoFocus={!danger}
            className={danger ? buttonClass("dangerSolid") : buttonClass("primary")}
          >
            {pending && pendingLabel ? pendingLabel : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-3 px-5 py-4 text-[13.5px] leading-relaxed">
        {children}
        {error && (
          <p role="alert" className="text-[12.5px] text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
