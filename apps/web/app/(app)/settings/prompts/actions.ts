"use server";

import { isPromptKey, PROMPTS } from "@curator/ai";
import { resetPrompt, savePrompt } from "@curator/db";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";

export type PromptResult =
  | { ok: true; text: string; customized: boolean; updatedAt?: string }
  | { ok: false; error: string };

const MAX_LENGTH = 20_000;

/** Stores an override. Saving the default text removes the override instead. */
export async function savePromptAction(key: string, raw: string): Promise<PromptResult> {
  await requireSession();
  if (!isPromptKey(key)) return { ok: false, error: "Unknown prompt." };
  const text = String(raw).trim();
  if (!text) return { ok: false, error: "A prompt can't be empty. Reset it to use the default." };
  if (text.length > MAX_LENGTH) {
    return {
      ok: false,
      error: `Keep prompts under ${MAX_LENGTH.toLocaleString("en-GB")} characters.`,
    };
  }
  revalidatePath("/settings/prompts");
  if (text === PROMPTS[key].default) {
    await resetPrompt(key);
    return { ok: true, text, customized: false };
  }
  const doc = await savePrompt(key, text);
  return { ok: true, text, customized: true, updatedAt: doc.updatedAt.toISOString() };
}

export async function resetPromptAction(key: string): Promise<PromptResult> {
  await requireSession();
  if (!isPromptKey(key)) return { ok: false, error: "Unknown prompt." };
  await resetPrompt(key);
  revalidatePath("/settings/prompts");
  return { ok: true, text: PROMPTS[key].default, customized: false };
}
