import { getLetter, listSources } from "@curator/db";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth/session";
import { serializeLetter } from "@/lib/letters-server";
import { newsletterOptions } from "@/lib/newsletter-config";
import { LetterEditor } from "./letter-editor";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const letter = await getLetter((await params).id);
  return { title: `${letter?.headline || "Untitled letter"} · Letters` };
}

export default async function LetterPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession();
  const { id } = await params;
  const [letter, sources] = await Promise.all([getLetter(id), listSources()]);
  if (!letter) notFound();

  return (
    <LetterEditor
      // Remount on status change so a freshly published letter picks up its archived HTML.
      key={letter.status}
      initial={serializeLetter(letter)}
      publishedHtml={letter.publishedHtml}
      sources={sources.map((s) => ({ slug: s.slug, name: s.name }))}
      newsletter={newsletterOptions()}
    />
  );
}
