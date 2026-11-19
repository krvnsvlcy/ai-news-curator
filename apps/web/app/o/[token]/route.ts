import { recordOpenStat } from "@curator/db";
import { after } from "next/server";
import { getTracker } from "@/lib/tracking";

// Open-tracking pixel from a sent email: count the open (anonymously, against
// today's counters), and always answer with a transparent 1×1 GIF.
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const payload = getTracker().verifyToken(token.replace(/\.gif$/, ""), "open");
  if (payload) {
    after(() =>
      recordOpenStat({
        letterId: payload.letterId,
        recipient: payload.recipient,
        test: payload.test,
      }).catch((err) => console.error("[tracking] failed to record open", err)),
    );
  }
  return new Response(new Uint8Array(GIF), {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(GIF.length),
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });
}
