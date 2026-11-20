import type { MetadataRoute } from "next";
// An internal, password-protected tool: only the sign-in page is public. Tracking
// redirects and the API must never be crawled (a crawler would register clicks).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/login", disallow: ["/"] },
  };
}
