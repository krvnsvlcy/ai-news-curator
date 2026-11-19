import { type NextRequest, NextResponse } from "next/server";
import { getAuthConfig, SESSION_COOKIE } from "@/lib/auth/config";
import { verifySessionToken } from "@/lib/auth/token";
import { isValidOwnerId, newOwnerId, OWNER_COOKIE, ownerCookieOptions } from "@/lib/owner";

// Early redirect for unauthenticated requests. Pages and server actions
// still call requireSession(); this is not the only line of defense.
// Reachable without signing in. Subscribers are managed by the editors only, so
// there are no reader-facing pages.
const PUBLIC_PATHS = new Set(["/login"]);

export async function proxy(request: NextRequest) {
  // Every browser gets an owner id (see lib/owner.ts) on its first request. It's
  // also written into this request so pages rendering right now can read it.
  const existing = request.cookies.get(OWNER_COOKIE)?.value;
  const ownerId = isValidOwnerId(existing) ? existing : newOwnerId();
  if (ownerId !== existing) request.cookies.set(OWNER_COOKIE, ownerId);
  const withOwner = (res: NextResponse) => {
    res.cookies.set(OWNER_COOKIE, ownerId, ownerCookieOptions()); // also refreshes expiry
    return res;
  };

  const { pathname, search } = request.nextUrl;
  const next = () => withOwner(NextResponse.next({ request: { headers: request.headers } }));
  // /r/<token> (tracked links) and /o/<token> (open pixel) come from emails; the
  // token is verified by the route itself.
  if (PUBLIC_PATHS.has(pathname) || pathname.startsWith("/r/") || pathname.startsWith("/o/")) {
    return next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySessionToken(getAuthConfig(), token)) return next();

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?from=${encodeURIComponent(pathname + search)}`;
  return withOwner(NextResponse.redirect(url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt).*)"],
};
