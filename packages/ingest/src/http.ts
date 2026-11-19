export const USER_AGENT = "ai-news-curator/0.1 (+internal news sourcing)";
const TIMEOUT_MS = 20_000;
const MAX_BYTES = 5 * 1024 * 1024;

export class FetchError extends Error {}

/** GET with a timeout, a size cap and a clear error for non-2xx responses. */
export async function fetchText(
  url: string,
  init: { accept?: string; fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const res = await (init.fetchImpl ?? fetch)(url, {
    headers: { "user-agent": USER_AGENT, accept: init.accept ?? "*/*" },
    redirect: "follow",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new FetchError(`HTTP ${res.status} ${res.statusText}`.trim());
  const length = Number(res.headers.get("content-length"));
  if (length > MAX_BYTES) throw new FetchError(`Response too large (${length} bytes)`);
  const text = await res.text();
  if (text.length > MAX_BYTES) throw new FetchError("Response too large");
  return text;
}
