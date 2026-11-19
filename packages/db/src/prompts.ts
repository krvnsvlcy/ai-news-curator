import { collections } from "./client.js";

/**
 * An editor's override of one AI prompt template. `_id` is the prompt's key
 * (see PROMPTS in @curator/ai); prompts without a row use their default.
 */
export interface PromptDoc {
  _id: string;
  text: string;
  updatedAt: Date;
}

/** Every stored override, keyed by prompt. */
export async function listPromptOverrides(): Promise<Record<string, string>> {
  const { prompts } = await collections();
  const rows = await prompts.find().toArray();
  return Object.fromEntries(rows.map((r) => [r._id, r.text]));
}

/** Rows with their last-change time, for the settings page. */
export async function listPromptDocs(): Promise<PromptDoc[]> {
  const { prompts } = await collections();
  return prompts.find().toArray();
}

export async function savePrompt(key: string, text: string): Promise<PromptDoc> {
  const { prompts } = await collections();
  const doc: PromptDoc = { _id: key, text, updatedAt: new Date() };
  await prompts.replaceOne({ _id: key }, doc, { upsert: true });
  return doc;
}

/** Removes an override so the default applies again. */
export async function resetPrompt(key: string): Promise<void> {
  const { prompts } = await collections();
  await prompts.deleteOne({ _id: key });
}
