import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/session";
import { logout } from "../login/actions";

// Pages under (app) are signed-in only. Each page still calls requireSession()
// itself: layouts don't re-render on every client navigation.
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireSession();
  return <AppShell signOut={logout}>{children}</AppShell>;
}
