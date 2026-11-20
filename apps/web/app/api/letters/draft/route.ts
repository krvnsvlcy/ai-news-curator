import { AiError, type PartialLetterDraft } from "@curator/ai";
import { after } from "next/server";
import { z } from "zod";
import { getAssistant } from "@/lib/ai";
import { isAuthenticated } from "@/lib/auth/session";
import { flushPostHogLogs, logLetterDraftLifecycle } from "@/lib/posthog-logs";
import {
  type DraftPreview,
  dateSchema,
  dayCandidates,
  toneSchema,
  toPreview,
  toSourceStories,
} from "@/lib/letter-draft";

// Step 2 of the "New letter" walkthrough: Claude drafts the edition, streamed
// as newline-delimited JSON so the dialog can show the letter being written.
export type DraftEvent =
  | { type: "partial"; draft: PartialLetterDraft }
  | { type: "done"; draft: DraftPreview }
  | { type: "error"; error: string };

/** At most one partial every this many ms; the latest always wins. */
const PARTIAL_INTERVAL_MS = 80;

export const maxDuration = 300;

export async function POST(req: Request) {
  if (!(await isAuthenticated())) return new Response("Unauthorized", { status: 401 });
  const parsed = z
    .object({ date: dateSchema, tone: toneSchema })
    .safeParse(await req.json().catch(() => null));
  if (!parsed.success) return new Response("Invalid request", { status: 400 });
  const { date, tone } = parsed.data;
  logLetterDraftLifecycle("accepted");
  after(flushPostHogLogs);

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const send = (event: DraftEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          open = false; // the browser went away
        }
      };
      let lastSent = 0;
      try {
        const articles = await dayCandidates(date);
        const draft = await getAssistant().draftLetter(
          { stories: toSourceStories(articles), date, tone },
          (partial) => {
            const now = Date.now();
            if (now - lastSent < PARTIAL_INTERVAL_MS) return;
            lastSent = now;
            send({ type: "partial", draft: partial });
          },
          // Cancelling in the dialog aborts the request, which stops the model call too.
          req.signal,
        );
        send({ type: "done", draft: toPreview(draft, articles, date, tone) });
        logLetterDraftLifecycle("completed");
      } catch (err) {
        if (req.signal.aborted) return;
        logLetterDraftLifecycle("failed");
        if (!(err instanceof AiError)) console.error("[generate] draft failed", err);
        send({
          type: "error",
          error:
            err instanceof AiError
              ? err.message
              : "Something went wrong while writing the letter. Try again.",
        });
      } finally {
        if (open) {
          open = false;
          try {
            controller.close();
          } catch {
            // already closed by the browser
          }
        }
      }
    },
    cancel() {
      // The browser stopped reading; req.signal aborts the model call.
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Accel-Buffering": "no",
    },
  });
}
