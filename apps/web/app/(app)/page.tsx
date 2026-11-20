import { countLettersByStatus, listLetters } from "@curator/db";
import { SectionHeader } from "@/components/page";
import { requireSession } from "@/lib/auth/session";
import { LettersBrowser, NewLetterButton, parseLetterQuery } from "./letters/letter-list";
import { parseRange, RangePicker, Trends } from "./trends";

export const metadata = { title: "Home" };

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; status?: string; sort?: string }>;
}) {
  await requireSession();
  const sp = await searchParams;
  const range = parseRange(sp.range);
  const { status, sort } = parseLetterQuery(sp);
  const [letters, counts] = await Promise.all([
    listLetters({ status, sort }),
    countLettersByStatus(),
  ]);

  // Each control keeps the other's settings in the URL.
  const letterParams: Record<string, string> = {
    ...(status ? { status } : {}),
    ...(sort !== "date-desc" ? { sort } : {}),
  };

  const total = counts.draft + counts.ready + counts.published;

  // No page header: two equal sections, each with its own (non-sticky) header.
  return (
    <main className="space-y-10 px-4 pt-6 pb-8 sm:px-8">
      <section aria-labelledby="overview">
        <SectionHeader
          id="overview"
          title="Overview"
          description="Subscribers and engagement over time · test sends excluded"
          actions={<RangePicker range={range} keep={letterParams} />}
        />
        <Trends range={range} />
      </section>
      <section aria-labelledby="letters">
        <SectionHeader
          id="letters"
          title="Letters"
          description={`${total} ${total === 1 ? "edition" : "editions"} · ${counts.draft} draft · ${counts.ready} ready · ${counts.published} published`}
          actions={<NewLetterButton />}
        />
        <LettersBrowser
          letters={letters}
          counts={counts}
          status={status}
          sort={sort}
          basePath="/"
          keep={range === 30 ? {} : { range: String(range) }}
        />
      </section>
    </main>
  );
}
