import Link from "next/link";

const TABS = [
  { id: "sources", label: "Sources", href: "/settings/sources" },
  { id: "prompts", label: "Prompts", href: "/settings/prompts" },
] as const;

/** Sources / Prompts switch at the top of every settings page. */
export function SettingsTabs({ active }: { active: (typeof TABS)[number]["id"] }) {
  return (
    <nav aria-label="Settings" className="flex">
      <div className="flex rounded-md border border-rule p-0.5">
        {TABS.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            aria-current={t.id === active ? "page" : undefined}
            className="rounded-sm px-2.5 py-0.5 text-[12.5px] text-muted hover:text-ink aria-[current=page]:bg-ink aria-[current=page]:text-paper"
          >
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
