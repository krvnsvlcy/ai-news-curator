import { redirect } from "next/navigation";

/** Analytics now lives on the letter page as a view; keep old links working. */
export default async function LetterAnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/letters/${id}?view=analytics`);
}
