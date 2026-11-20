import type { NewsletterOptions } from "@curator/newsletter";

/** Publication details for the email template. Server-only (reads env). */
export function newsletterOptions(): NewsletterOptions {
  return {
    publicationName: process.env.NEWSLETTER_NAME?.trim() || "The Curator Daily",
    tagline: process.env.NEWSLETTER_TAGLINE?.trim() || undefined,
  };
}
