import { type LetterStatus, STATUS_LABEL } from "@/lib/letters";

const STYLES: Record<LetterStatus, string> = {
  draft: "bg-chip text-muted",
  ready: "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300",
  published: "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-300",
};

export function LetterStatusBadge({ status }: { status: LetterStatus }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[12px] font-medium ${STYLES[status]}`}
    >
      <span
        aria-hidden
        className={`size-1.5 rounded-full ${status === "draft" ? "bg-muted/60" : status === "ready" ? "bg-amber-500" : "bg-green-600"}`}
      />
      {STATUS_LABEL[status]}
    </span>
  );
}
