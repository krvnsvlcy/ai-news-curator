import Link from "next/link";

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <Link href="/" className={`font-serif text-2xl font-bold tracking-tight text-ink ${className}`}>
      Curator
    </Link>
  );
}
