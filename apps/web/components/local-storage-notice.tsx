export function LocalStorageNotice({ className = "" }: { className?: string }) {
  return (
    <div
      className={`rounded-md border border-sky-600/20 bg-sky-50 px-3 py-2.5 text-[13px] text-sky-950 dark:bg-sky-950/30 dark:text-sky-200 ${className}`}
    >
      <p className="font-medium">Demo mode: subscribers live in this browser only</p>
      <p className="mt-0.5 text-sky-900/80 dark:text-sky-200/80">
        The list is kept in this browser's local storage. It isn't saved on the server, other people
        and devices can't see it, and clearing site data erases it. Letters are only ever sent to
        addresses you add here.
      </p>
    </div>
  );
}
