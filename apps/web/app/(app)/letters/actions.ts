"use server";

import { AiError, type SourceStory } from "@curator/ai";
import {
  changeLetterStatus,
  createLetter,
  deleteDraftLetter,
  duplicateLetter,
  getLetter,
  InvalidTransitionError,
  LetterConflictError,
  LetterLockedError,
  LetterNotFoundError,
  LetterNotReadyError,
  saveLetterContent,
  searchArticles,
} from "@curator/db";
import { renderLetterHtml } from "@curator/newsletter";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAssistant } from "@/lib/ai";
import { requireSession } from "@/lib/auth/session";
import {
  type EditorLetter,
  type EditorLetterContent,
  type LetterStatus,
  type PickerArticle,
  toNewsletterLetter,
} from "@/lib/letters";
import { serializeArticle, serializeLetter } from "@/lib/letters-server";
import { newsletterOptions } from "@/lib/newsletter-config";

export type LetterResult =
  | { ok: true; letter: EditorLetter; notice?: string }
  | { ok: false; error: string; conflict?: boolean };

function failure(err: unknown): { ok: false; error: string; conflict?: boolean } {
  if (err instanceof LetterConflictError) return { ok: false, error: err.message, conflict: true };
  if (
    err instanceof LetterLockedError ||
    err instanceof LetterNotFoundError ||
    err instanceof LetterNotReadyError ||
    err instanceof InvalidTransitionError
  ) {
    return { ok: false, error: err.message };
  }
  if (err instanceof z.ZodError) {
    const issue = err.issues[0];
    const where = issue?.path.length ? ` (${issue.path.join(".")})` : "";
    return { ok: false, error: `${issue?.message ?? "Invalid input."}${where}` };
  }
  throw err;
}

function revalidateLetters(id?: string) {
  revalidatePath("/letters");
  if (id) revalidatePath(`/letters/${id}`);
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

export async function createLetterAction(): Promise<void> {
  await requireSession();
  const letter = await createLetter();
  revalidateLetters();
  redirect(`/letters/${letter._id.toHexString()}`);
}

export async function duplicateLetterAction(id: string): Promise<void> {
  await requireSession();
  const copy = await duplicateLetter(id);
  revalidateLetters();
  redirect(`/letters/${copy._id.toHexString()}`);
}

export async function deleteLetterAction(
  id: string,
): Promise<{ ok: false; error: string } | undefined> {
  await requireSession();
  if (!(await deleteDraftLetter(id))) {
    return { ok: false, error: "Only draft letters can be deleted." };
  }
  revalidateLetters();
  redirect("/letters");
}

export async function saveLetterAction(
  id: string,
  revision: number,
  content: EditorLetterContent,
): Promise<LetterResult> {
  await requireSession();
  try {
    const { letter, demotedBecause } = await saveLetterContent(id, revision, content);
    // Only the list: refreshing the editor route would reset in-progress edits.
    revalidateLetters();
    return {
      ok: true,
      letter: serializeLetter(letter),
      ...(demotedBecause ? { notice: `Moved back to draft: ${demotedBecause.join(" ")}` } : {}),
    };
  } catch (err) {
    return failure(err);
  }
}

export async function changeLetterStatusAction(
  id: string,
  revision: number,
  to: LetterStatus,
): Promise<LetterResult> {
  await requireSession();
  try {
    let publishedHtml: string | undefined;
    if (to === "published") {
      // Render from the stored letter (not the client) so the archive matches the record.
      const stored = await getLetter(id);
      if (!stored) throw new LetterNotFoundError();
      if (stored.revision !== revision) throw new LetterConflictError();
      publishedHtml = renderLetterHtml(toNewsletterLetter(stored), newsletterOptions());
    }
    const letter = await changeLetterStatus(id, revision, to, { publishedHtml });
    revalidateLetters(id);
    return { ok: true, letter: serializeLetter(letter) };
  } catch (err) {
    return failure(err);
  }
}

// ── Article picker ───────────────────────────────────────────────────────────

const searchSchema = z.object({
  query: z.string().max(200).default(""),
  sourceSlug: z.string().max(60).optional(),
});

export async function searchArticlesAction(
  input: z.input<typeof searchSchema>,
): Promise<PickerArticle[]> {
  await requireSession();
  const { query, sourceSlug } = searchSchema.parse(input);
  const articles = await searchArticles({ query, sourceSlug: sourceSlug || undefined, limit: 40 });
  return articles.map(serializeArticle);
}

// ── AI assistance ────────────────────────────────────────────────────────────

const aiStorySchema = z.object({
  publisher: z.string().max(120),
  originalHeadline: z.string().max(500),
  summary: z.string().max(2000).optional(),
  headline: z.string().max(300).optional(),
  description: z.string().max(1000).optional(),
});
const toneSchema = z.string().max(300).optional();
const instructionSchema = z.string().max(500).optional();

export type AiResult<T> = { ok: true; value: T } | { ok: false; error: string };

async function runAi<T>(fn: () => Promise<T>): Promise<AiResult<T>> {
  await requireSession();
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    if (err instanceof AiError) return { ok: false, error: err.message };
    if (err instanceof z.ZodError) return { ok: false, error: "Invalid request." };
    console.error("AI action failed", err);
    return { ok: false, error: "Something went wrong while generating. Try again." };
  }
}

export async function suggestLetterHeadlinesAction(input: {
  stories: SourceStory[];
  tone?: string;
  currentHeadline?: string;
}): Promise<AiResult<string[]>> {
  return runAi(() => {
    const data = z
      .object({
        stories: z.array(aiStorySchema).max(50),
        tone: toneSchema,
        currentHeadline: z.string().max(200).optional(),
      })
      .parse(input);
    return getAssistant().suggestLetterHeadlines(data);
  });
}

export async function writeBriefingAction(input: {
  stories: SourceStory[];
  tone?: string;
  date?: string;
  currentDraft?: string;
  instruction?: string;
}): Promise<AiResult<string>> {
  return runAi(() => {
    const data = z
      .object({
        stories: z.array(aiStorySchema).max(50),
        tone: toneSchema,
        date: z.string().max(10).optional(),
        currentDraft: z.string().max(5000).optional(),
        instruction: instructionSchema,
      })
      .parse(input);
    return getAssistant().writeBriefing(data);
  });
}

export async function suggestStoryHeadlinesAction(input: {
  story: SourceStory;
  tone?: string;
  instruction?: string;
  otherHeadlines?: string[];
}): Promise<AiResult<string[]>> {
  return runAi(() => {
    const data = z
      .object({
        story: aiStorySchema,
        tone: toneSchema,
        instruction: instructionSchema,
        otherHeadlines: z.array(z.string().max(300)).max(50).optional(),
      })
      .parse(input);
    return getAssistant().suggestStoryHeadlines(data);
  });
}
