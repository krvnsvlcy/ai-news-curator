import { countSubscribers } from "@curator/db";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { getAttribution } from "@/lib/attribution";
import { requireSession } from "@/lib/auth/session";
import { logout } from "../login/actions";

// Pages under (app) are signed-in only. Each page still calls requireSession()
// itself: layouts don't re-render on every client navigation.
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  // Total across everyone (a count only); shown in the nav on every page.
  const total = await countSubscribers();
  return (
    <AppShell signOut={logout} subscriberTotal={total} attribution={getAttribution()}>
      {children}
    </AppShell>
  );
}
