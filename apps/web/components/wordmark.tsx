import Link from "next/link";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`flex items-center gap-2.5 text-ink ${className}`}>
      <span
        aria-hidden
        className="grid size-7 place-items-center rounded-md bg-ink text-[13px] font-bold text-paper"
      >
        C
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Curator</span>
    </Link>
  );
}
