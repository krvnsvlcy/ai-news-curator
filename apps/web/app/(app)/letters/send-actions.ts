"use server";

import {
  changeLetterStatus,
  getLetter,
  type LetterSendRecord,
  listOwnEmails,
  recordDelivered,
  recordLetterSend,
} from "@curator/db";
import { renderLetterHtml, renderLetterText } from "@curator/newsletter";
import { addOpenPixel, rewriteStoryLinks } from "@curator/tracking";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { type EditorLetter, type EditorSend, toNewsletterLetter } from "@/lib/letters";
import { serializeLetter } from "@/lib/letters-server";
import { appOrigin, getMailer } from "@/lib/mail";
import { newsletterOptions } from "@/lib/newsletter-config";
import { currentOwnerId } from "@/lib/owner-server";
import { getTracker } from "@/lib/tracking";

export type PublishResult =
  | {
      ok: true;
      letter: EditorLetter;
      delivered: number;
      failed: { to: string; error: string }[];
      send?: EditorSend;
    }
  | { ok: false; error: string; conflict?: boolean };

const MAX_RECIPIENTS = 200;

const inputSchema = z.object({
  id: z.string().regex(/^[0-9a-f]{24}$/),
  revision: z.number().int().min(0),
});

/**
 * Publishes a "ready" letter: archives its HTML, locks it, and emails it to
 * every address on this browser's list (looked up on the server, so nobody can
 * email addresses only someone else added). With no subscribers it is simply
 * published.
 */
export async function publishLetterAction(
  input: z.input<typeof inputSchema>,
): Promise<PublishResult> {
  await requireSession();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const { id, revision } = parsed.data;

  const letter = await getLetter(id);
  if (!letter) return { ok: false, error: "This letter no longer exists." };
  if (letter.revision !== revision) {
    return {
      ok: false,
      conflict: true,
      error: "This letter changed since you opened it. Reload, then publish again.",
    };
  }
  if (letter.status !== "ready") {
    return { ok: false, error: "Only a letter marked ready can be published." };
  }

  const ownerId = await currentOwnerId();
  const recipients = ownerId ? await listOwnEmails(ownerId, MAX_RECIPIENTS + 1) : [];
  if (recipients.length > MAX_RECIPIENTS) {
    return { ok: false, error: `At most ${MAX_RECIPIENTS} recipients per send in this demo.` };
  }

  const options = newsletterOptions();
  const html = renderLetterHtml(toNewsletterLetter(letter), options);

  if (recipients.length === 0) {
    const published = await changeLetterStatus(id, revision, "published", { publishedHtml: html });
    revalidatePath("/letters");
    revalidatePath("/");
    return { ok: true, letter: serializeLetter(published), delivered: 0, failed: [] };
  }

  const mailer = getMailer();
  if (!mailer) {
    return {
      ok: false,
      error: "Email sending isn't configured. Set SMTP_URL and SMTP_FROM on the server.",
    };
  }

  const text = renderLetterText(toNewsletterLetter(letter), options);
  const origin = await appOrigin();
  const subject = letter.headline || "Untitled edition";

  // Per-recipient tracking: story clicks go through /r/<token> and an open pixel
  // loads /o/<token>, both identifying the reader only by an anonymous id.
  const tracker = getTracker();
  const stories = letter.stories.map((s) => ({ id: s.id, url: s.original.url }));
  const emails = recipients.map((to) => {
    const recipient = tracker.recipientId(to);
    const clickUrl = (storyId: string) =>
      `${origin}/r/${tracker.createToken({ kind: "click", letterId: id, storyId, recipient, test: false })}`;
    const trackText = (t: string) =>
      stories.reduce((acc, s) => acc.replaceAll(s.url, clickUrl(s.id)), t);
    return {
      to,
      subject,
      html: addOpenPixel(
        rewriteStoryLinks(html, stories, clickUrl),
        `${origin}/o/${tracker.createToken({ kind: "open", letterId: id, storyId: "", recipient, test: false })}.gif`,
      ),
      text: trackText(text),
    };
  });

  const result = await mailer.sendBatch(emails);
  if (result.delivered.length === 0) {
    const reason = result.failed[0]?.error ?? "unknown error";
    return {
      ok: false,
      error: `Nothing was delivered, so the letter wasn't published. The mail server said: ${reason}`,
    };
  }

  const published = await changeLetterStatus(id, revision, "published", { publishedHtml: html });
  const record: LetterSendRecord = {
    at: new Date(),
    kind: "subscribers",
    recipients: recipients.length,
    delivered: result.delivered.length,
    failed: result.failed.length,
  };
  await recordLetterSend(id, record);
  await recordDelivered(result.delivered.length);
  revalidatePath("/letters");
  revalidatePath("/");

  const send = { ...record, at: record.at.toISOString() };
  const serialized = serializeLetter(published);
  return {
    ok: true,
    letter: { ...serialized, sends: [...serialized.sends, send] },
    delivered: result.delivered.length,
    failed: result.failed,
    send,
  };
}
