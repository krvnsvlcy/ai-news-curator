"use server";

import {
  changeLetterStatus,
  countOwnSubscribers,
  getLetter,
  type LetterSendRecord,
  listOwnEmails,
  recordDelivered,
  recordLetterSend,
} from "@curator/db";
import {
  removeLegacySubscriptionLinks,
  renderLetterHtml,
  renderLetterText,
} from "@curator/newsletter";
import { addOpenPixel, rewriteStoryLinks } from "@curator/tracking";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { type EditorSend, toNewsletterLetter } from "@/lib/letters";
import { appOrigin, getMailer } from "@/lib/mail";
import { newsletterOptions } from "@/lib/newsletter-config";
import { currentOwnerId } from "@/lib/owner-server";
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

const inputSchema = z.discriminatedUnion("mode", [
  z.object({
    id: z.string().regex(/^[0-9a-f]{24}$/),
    revision: z.number().int().min(0),
    mode: z.literal("test"),
    recipients: z
      .array(z.email().max(254))
      .min(1, "Add at least one recipient.")
      .max(5, "Test sends go to at most 5 addresses."),
  }),
  z.object({
    id: z.string().regex(/^[0-9a-f]{24}$/),
    revision: z.number().int().min(0),
    mode: z.literal("subscribers"),
  }),
]);

/** What "Send to subscribers" would reach from this browser. */
export async function sendAudienceAction(): Promise<{ count: number; limit: number }> {
  await requireSession();
  const ownerId = await currentOwnerId();
  return { count: ownerId ? await countOwnSubscribers(ownerId) : 0, limit: MAX_RECIPIENTS };
}

/**
 * Sends a letter. Test sends go to the given addresses (not stored). Subscriber
 * sends go to every address on this browser's list, looked up on the server, so
 * nobody can email addresses only someone else added. Sending to
 * subscribers publishes a "ready" letter.
 */
export async function sendLetterAction(input: z.input<typeof inputSchema>): Promise<SendResult> {
  await requireSession();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid request." };
  const { id, revision, mode } = parsed.data;
  let recipients: string[];
  if (parsed.data.mode === "test") {
    recipients = [...new Set(parsed.data.recipients.map((r) => r.trim().toLowerCase()))];
  } else {
    const ownerId = await currentOwnerId();
    recipients = ownerId ? await listOwnEmails(ownerId, MAX_RECIPIENTS + 1) : [];
    if (recipients.length === 0) {
      return { ok: false, error: "You have no subscribers to send to." };
    }
    if (recipients.length > MAX_RECIPIENTS) {
      return {
        ok: false,
        error: `At most ${MAX_RECIPIENTS} recipients per send in this demo.`,
      };
    }
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
  // A published edition is always re-sent as archived (minus the subscription
  // links older template versions included).
  const baseHtml = letter.publishedHtml
    ? removeLegacySubscriptionLinks(letter.publishedHtml)
    : renderLetterHtml(toNewsletterLetter(letter), options);
  const baseText = renderLetterText(toNewsletterLetter(letter), options);
  const origin = await appOrigin();
  const subject = `${mode === "test" ? "[Test] " : ""}${letter.headline || "Untitled edition"}`;

  // Per-recipient tracking: story clicks go through /r/<token> and an open pixel
  // loads /o/<token>, both identifying the reader only by an anonymous id.
  const tracker = getTracker();
  const test = mode === "test";
  const stories = letter.stories.map((s) => ({ id: s.id, url: s.original.url }));
  const emails = recipients.map((to) => {
    const recipient = tracker.recipientId(to);
    const clickUrl = (storyId: string) =>
      `${origin}/r/${tracker.createToken({ kind: "click", letterId: id, storyId, recipient, test })}`;
    const trackText = (text: string) =>
      stories.reduce((t, s) => t.replaceAll(s.url, clickUrl(s.id)), text);
    return {
      to,
      subject,
      html: addOpenPixel(
        rewriteStoryLinks(baseHtml, stories, clickUrl),
        `${origin}/o/${tracker.createToken({ kind: "open", letterId: id, storyId: "", recipient, test })}.gif`,
      ),
      text: trackText(baseText),
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
  // Daily dashboard counter (subscriber sends only; tests never count).
  if (mode === "subscribers") await recordDelivered(result.delivered.length);
  revalidatePath("/letters");
  revalidatePath("/");

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
