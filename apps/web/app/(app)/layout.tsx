import type { ReactNode } from "react";
import { Wordmark } from "@/components/wordmark";
import { requireSession } from "@/lib/auth/session";
import { logout } from "../login/actions";

// Pages under (app) are signed-in only. Each page still calls requireSession()
// itself: layouts don't re-render on every client navigation.
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-rule bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
          <Wordmark />
          <form action={logout}>
            <button type="submit" className="text-sm text-muted transition-colors hover:text-ink">
              Sign out
            </button>
          </form>
        </div>
      </header>
      {children}
    </>
  );
}
