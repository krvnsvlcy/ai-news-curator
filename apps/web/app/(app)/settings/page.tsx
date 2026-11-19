import Link from "next/link";
import type { ComponentType, SVGProps } from "react";
import { ChevronRightIcon, SourcesIcon } from "@/components/icons";
import { PageBody, PageHeader, Panel } from "@/components/page";
import { requireSession } from "@/lib/auth/session";

export const metadata = { title: "Settings · AI News Curator" };

const SECTIONS: {
  href: string;
  title: string;
  description: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}[] = [
  {
    href: "/settings/sources",
    title: "Sources",
    description: "Feeds the curator pulls stories from, and how often.",
    icon: SourcesIcon,
  },
];

export default async function SettingsPage() {
  await requireSession();
  return (
    <>
      <PageHeader title="Settings" />
      <PageBody>
        <Panel>
          <ul className="divide-y divide-rule">
            {SECTIONS.map(({ href, title, description, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="flex items-center gap-3.5 px-5 py-4 transition-colors hover:bg-hover/50"
                >
                  <Icon className="size-5 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] font-medium text-ink">{title}</span>
                    <span className="block text-[13px] text-muted">{description}</span>
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      </PageBody>
    </>
  );
}
