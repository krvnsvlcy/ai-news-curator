"use client";

import { SubmitButton } from "@/components/submit-button";

export function DeleteSourceButton({
  action,
  name,
}: {
  action: () => Promise<void>;
  name: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Delete “${name}” and all of its stored articles? This can’t be undone.`)) {
          e.preventDefault();
        }
      }}
    >
      <SubmitButton variant="danger" pendingText="Deleting…">
        Delete source
      </SubmitButton>
    </form>
  );
}
