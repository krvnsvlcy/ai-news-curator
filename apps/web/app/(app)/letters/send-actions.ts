"use server";

import {
  changeLetterStatus,
  getLetter,
  type LetterSendRecord,
  recordLetterSend,
} from "@curator/db";
import {
  personalizeHtml,
  personalizeText,
  renderLetterHtml,
  renderLetterText,
} from "@curator/newsletter";
import { rewriteStoryLinks } from "@curator/tracking";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { type EditorSend, toNewsletterLetter } from "@/lib/letters";
import { appOrigin, getMailer } from "@/lib/mail";
import { newsletterOptions } from "@/lib/newsletter-config";
import { getTracker } from "@/lib/tracking";

export type SendResult =
  | {
      ok: true;
      delivered: number;
      failed: { to: string; error: string }[];
      published: boolean;
      send: EditorSend;
    }
  | { ok: false; error: string };

const MAX_RECIPIENTS = 200;

const inputSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{24}$/),
  revision: z.number().int().min(0),
  mode: z.enum(["test", "subscribers"]),
  recipients: z
    .array(z.email().max(254))
    .min(1, "Add at least one recipient.")
    .max(MAX_RECIPIENTS, `At most ${MAX_RECIPIENTS} recipients per send in this demo.`),
});

/**
 * Sends a letter. Recipients come from the sender's own browser (demo
 * subscribers live in localStorage); addresses are used for this send only and
 * never stored. Sending to subscribers publishes a "ready" letter.
 */
export async function sendLetterAction(input: z.input<typeof inputSchema>): Promise<SendResult> {
  await requireSession();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const { id, revision, mode } = parsed.data;
  const recipients = [...new Set(parsed.data.recipients.map((r) => r.trim().toLowerCase()))];
  if (mode === "test" && recipients.length > 5) {
    return { ok: false, error: "Test sends go to at most 5 addresses." };
  }

  const mailer = getMailer();
  if (!mailer) {
    return {
      ok: false,
      error: "Email sending isn't configured. Set SMTP_URL and SMTP_FROM on the server.",
    };
  }

  const letter = await getLetter(id);
  if (!letter) return { ok: false, error: "This letter no longer exists." };
  if (letter.revision !== revision) {
    return {
      ok: false,
      error: "This letter changed since you opened it. Reload, then send again.",
    };
  }
  if (mode === "subscribers" && letter.status === "draft") {
    return { ok: false, error: "Mark the letter ready before sending it to subscribers." };
  }

  const options = newsletterOptions();
  // A published edition is always re-sent exactly as archived.
  const baseHtml = letter.publishedHtml ?? renderLetterHtml(toNewsletterLetter(letter), options);
  const baseText = renderLetterText(toNewsletterLetter(letter), options);
  const origin = await appOrigin();
  const subject = `${mode === "test" ? "[Test] " : ""}${letter.headline || "Untitled edition"}`;

  // Per-recipient links: story clicks go through /r/<token> and the unsubscribe
  // link carries a token, both identifying the reader only by an anonymous id.
  const tracker = getTracker();
  const test = mode === "test";
  const stories = letter.stories.map((s) => ({ id: s.id, url: s.original.url }));
  const emails = recipients.map((to) => {
    const recipient = tracker.recipientId(to);
    const clickUrl = (storyId: string) =>
      `${origin}/r/${tracker.createToken({ kind: "click", letterId: id, storyId, recipient, test })}`;
    const unsubscribeToken = tracker.createToken({
      kind: "unsubscribe",
      letterId: id,
      storyId: "",
      recipient,
      test,
    });
    const links = {
      manageUrl: `${origin}/subscribe`,
      unsubscribeUrl: `${origin}/unsubscribe?email=${encodeURIComponent(to)}&t=${unsubscribeToken}`,
    };
    const trackText = (text: string) =>
      stories.reduce((t, s) => t.replaceAll(s.url, clickUrl(s.id)), text);
    return {
      to,
      subject,
      html: personalizeHtml(rewriteStoryLinks(baseHtml, stories, clickUrl), links),
      text: personalizeText(trackText(baseText), links),
      unsubscribeUrl: links.unsubscribeUrl,
    };
  });

  const result = await mailer.sendBatch(emails);

  let published = false;
  if (mode === "subscribers" && letter.status === "ready" && result.delivered.length > 0) {
    await changeLetterStatus(id, revision, "published", { publishedHtml: baseHtml });
    published = true;
  }

  const record: LetterSendRecord = {
    at: new Date(),
    kind: mode,
    recipients: recipients.length,
    delivered: result.delivered.length,
    failed: result.failed.length,
  };
  await recordLetterSend(id, record);
  revalidatePath("/letters");

  if (result.delivered.length === 0) {
    const reason = result.failed[0]?.error ?? "unknown error";
    return { ok: false, error: `Nothing was delivered. The mail server said: ${reason}` };
  }
  return {
    ok: true,
    delivered: result.delivered.length,
    failed: result.failed,
    published,
    send: { ...record, at: record.at.toISOString() },
  };
}
