import { countLettersByStatus, listLetters } from "@curator/db";
import { PageBody, PageHeader } from "@/components/page";
import { requireSession } from "@/lib/auth/session";
import { LettersBrowser, NewLetterButton, parseLetterQuery } from "./letter-list";

export const metadata = { title: "Letters · AI News Curator" };

export default async function LettersPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; sort?: string }>;
}) {
  await requireSession();
  const { status, sort } = parseLetterQuery(await searchParams);
  const [letters, counts] = await Promise.all([
    listLetters({ status, sort }),
    countLettersByStatus(),
  ]);
  const total = counts.draft + counts.ready + counts.published;

  return (
    <>
      <PageHeader
        title="Letters"
        description={`${total} ${total === 1 ? "edition" : "editions"} · ${counts.draft} draft · ${counts.ready} ready · ${counts.published} published`}
        actions={<NewLetterButton />}
      />
      <PageBody>
        <LettersBrowser
          letters={letters}
          counts={counts}
          status={status}
          sort={sort}
          basePath="/letters"
        />
      </PageBody>
    </>
  );
}
