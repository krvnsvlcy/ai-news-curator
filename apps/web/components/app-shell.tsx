"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ComponentType, type ReactNode, type SVGProps, useEffect, useState } from "react";
import {
  ChartIcon,
  CloseIcon,
  FeedIcon,
  LettersIcon,
  MenuIcon,
  SignOutIcon,
  SourcesIcon,
  UsersIcon,
} from "./icons";
import { Wordmark } from "./wordmark";

const NAV: { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { href: "/letters", label: "Letters", icon: LettersIcon },
  { href: "/subscribers", label: "Subscribers", icon: UsersIcon },
  { href: "/analytics", label: "Analytics", icon: ChartIcon },
  { href: "/", label: "Feed", icon: FeedIcon },
  { href: "/sources", label: "Sources", icon: SourcesIcon },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  signOut,
}: {
  children: ReactNode;
  signOut: () => Promise<void>;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

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
        <Wordmark />
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
              className="flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[14px] text-muted transition-colors hover:bg-hover hover:text-ink aria-[current=page]:bg-hover aria-[current=page]:font-medium aria-[current=page]:text-ink"
            >
              <Icon className="size-[18px] shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-rule p-2">
        <form action={signOut}>
          <button
            type="submit"
            className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[14px] text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <SignOutIcon className="size-[18px] shrink-0" />
            Sign out
          </button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh lg:pl-60">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-rule bg-sidebar lg:block">
        {sidebar}
      </aside>

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
          className={`fixed inset-y-0 left-0 z-40 w-64 border-r border-rule bg-sidebar transition-transform ${open ? "translate-x-0" : "-translate-x-full"}`}
          inert={!open}
        >
          {sidebar}
        </aside>
      </div>

      {/* Mobile top bar */}
      <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-rule bg-sidebar/95 px-4 backdrop-blur lg:hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-ml-1.5 rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink"
          aria-label="Open navigation"
          aria-expanded={open}
        >
          <MenuIcon className="size-5" />
        </button>
        <Wordmark />
      </div>

      {children}
    </div>
  );
}
