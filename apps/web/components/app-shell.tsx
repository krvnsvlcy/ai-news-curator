"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type ComponentType,
  type ReactNode,
  type SVGProps,
  useEffect,
  useState,
  useTransition,
} from "react";
import { ConfirmDialog } from "./confirm-dialog";
import { EditorialWordmark } from "./editorial";
import {
  CloseIcon,
  FeedIcon,
  HomeIcon,
  LettersIcon,
  MenuIcon,
  SettingsIcon,
  SignOutIcon,
  UsersIcon,
} from "./icons";

const NAV: { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { href: "/", label: "Home", icon: HomeIcon },
  { href: "/letters", label: "Letters", icon: LettersIcon },
  { href: "/subscribers", label: "Subscribers", icon: UsersIcon },
  { href: "/feed", label: "Feed", icon: FeedIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  signOut,
  subscriberTotal,
}: {
  children: ReactNode;
  signOut: () => Promise<void>;
  /** Subscribers across everyone. */
  subscriberTotal: number;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [signingOut, startSignOut] = useTransition();

  // Close the mobile drawer whenever the route changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname is the trigger
  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center justify-between px-4">
        <EditorialWordmark className="text-xl" />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink lg:hidden"
          aria-label="Close navigation"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>

      <nav aria-label="Main" className="flex-1 space-y-0.5 px-2 py-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[14px] text-muted transition-colors hover:bg-hover hover:text-ink aria-[current=page]:bg-primary aria-[current=page]:font-medium aria-[current=page]:text-paper aria-[current=page]:hover:bg-primary aria-[current=page]:hover:text-paper"
            >
              <Icon className="size-[18px] shrink-0" />
              <span className="flex-1">{label}</span>
              {href === "/subscribers" && (
                <span className="text-[12px] tabular-nums opacity-80" title="Subscribers in total">
                  {subscriberTotal.toLocaleString("en-GB")}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-0.5 p-2">
        <Link
          href="/settings"
          aria-current={isActive(pathname, "/settings") ? "page" : undefined}
          className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[14px] text-muted transition-colors hover:bg-hover hover:text-ink aria-[current=page]:bg-primary aria-[current=page]:font-medium aria-[current=page]:text-paper aria-[current=page]:hover:bg-primary aria-[current=page]:hover:text-paper"
        >
          <SettingsIcon className="size-[18px] shrink-0" />
          Settings
        </Link>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setSignOutOpen(true);
          }}
          className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[14px] text-muted transition-colors hover:bg-hover hover:text-ink"
        >
          <SignOutIcon className="size-[18px] shrink-0" />
          Sign out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 lg:block">{sidebar}</aside>

      {/* Mobile drawer */}
      <div className={`lg:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className={`fixed inset-0 z-30 cursor-default bg-black/30 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          className={`fixed inset-y-0 left-0 z-40 w-64 bg-canvas transition-transform ${open ? "translate-x-0" : "-translate-x-full"}`}
          inert={!open}
        >
          {sidebar}
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <div className="flex h-14 shrink-0 items-center gap-3 px-4 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="-ml-1.5 rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink"
            aria-label="Open navigation"
            aria-expanded={open}
          >
            <MenuIcon className="size-5" />
          </button>
          <EditorialWordmark className="text-xl" />
        </div>

        {/* Main area: one large card, inset from the screen edge. It scrolls; each
          page's PageHeader sticks to its top over a translucent, blurred background. */}
        <div className="mx-2 mb-2 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-lg border border-rule/70 bg-surface lg:my-2 lg:ml-0">
          {children}
        </div>
      </div>
      <ConfirmDialog
        open={signOutOpen}
        onClose={() => setSignOutOpen(false)}
        onConfirm={() => startSignOut(() => signOut())}
        title="Sign out?"
        confirmLabel="Sign out"
        pendingLabel="Signing out…"
        pending={signingOut}
      >
        <p>You'll need your password to sign back in.</p>
      </ConfirmDialog>
    </div>
  );
}
