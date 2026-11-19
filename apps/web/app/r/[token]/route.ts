import { recordClick, recordClickStat, storyUrl } from "@curator/db";
import { after } from "next/server";
import { getTracker } from "@/lib/tracking";

// Tracked story link from a sent email: record an anonymous click, then
// redirect to the story's URL as stored in the letter (never a URL taken from
// the request, so this can't be used as an open redirect).
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = getTracker().verifyToken(token, "click");
  if (!payload) return notice(400, "This link isn't valid.");

  const destination = await storyUrl(payload.letterId, payload.storyId);
  if (!destination) return notice(404, "This story is no longer part of the letter.");

  // Don't make the reader wait for the write.
  after(() =>
    Promise.all([
      recordClick({
        letterId: payload.letterId,
        storyId: payload.storyId,
        recipient: payload.recipient,
        test: payload.test,
      }),
      recordClickStat({
        letterId: payload.letterId,
        recipient: payload.recipient,
        test: payload.test,
      }),
    ]).catch((err) => console.error("[tracking] failed to record click", err)),
  );

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination,
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function notice(status: number, message: string) {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link unavailable</title><body style="font-family:Georgia,serif;max-width:32rem;margin:15vh auto;padding:0 1rem;color:#000000"><h1 style="font-size:1.6rem">Link unavailable</h1><p>${message}</p></body>`,
    {
      status,
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    },
  );
}
