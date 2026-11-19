"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "@/components/button-styles";
import { TrashIcon } from "@/components/icons";
import { deleteLetterAction } from "./actions";

export function DeleteLetterButton({
  id,
  label,
  compact = false,
}: {
  id: string;
  label: string;
  compact?: boolean;
}) {
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
          if (!confirm(`Delete the draft “${label}”? This can’t be undone.`)) return;
          startTransition(async () => {
            // A compact button sits in a list: stay there once the row is gone.
            const res = await deleteLetterAction(id, { stay: compact });
            if (res && !res.ok) setError(res.error);
          });
        }}
      >
        <TrashIcon className="size-4" />
        {!compact && (pending ? "Deleting…" : "Delete draft")}
      </button>
      {error && (
        <span role="alert" className="text-[12px] text-red-600">
          {error}
        </span>
      )}
    </>
  );
}
