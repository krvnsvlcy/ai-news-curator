"use client";

import posthog from "posthog-js";
import { useState, useTransition } from "react";
import { buttonClass } from "@/components/button-styles";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TrashIcon } from "@/components/icons";
import { deleteLetterAction } from "./actions";

export function DeleteLetterButton({
  id,
  label,
  compact = false,
  stay = compact,
}: {
  id: string;
  label: string;
  compact?: boolean;
  /** Stay on the current page once deleted (a list row); otherwise go to /letters. */
  stay?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();

  return (
    <>
      <button
        type="button"
        disabled={pending}
        title="Delete draft"
        aria-label={`Delete ${label}`}
        className={compact ? `${buttonClass("quiet")} px-2` : buttonClass("danger")}
        onClick={() => {
          setError(undefined);
          setOpen(true);
        }}
      >
        <TrashIcon className="size-4" />
        {!compact && (pending ? "Deleting…" : "Delete draft")}
      </button>
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete draft?"
        confirmLabel="Delete draft"
        pendingLabel="Deleting…"
        pending={pending}
        error={error}
        danger
        onConfirm={() =>
          startTransition(async () => {
            const res = await deleteLetterAction(id, { stay });
            if (res && !res.ok) setError(res.error);
            else {
              posthog.capture("letter_deleted");
              setOpen(false);
            }
          })
        }
      >
        <p>
          <span className="font-medium">“{label}”</span> and its stories will be deleted. This can't
          be undone.
        </p>
      </ConfirmDialog>
    </>
  );
}
