/**
 * Problems that stop a letter from being marked ready. Empty means ready.
 * Story headlines are optional: the email falls back to the original headline.
 */
export function readinessProblems(letter: {
  headline: string;
  briefing: string;
  stories: readonly unknown[];
}): string[] {
  const problems: string[] = [];
  if (!letter.headline.trim()) problems.push("Add a headline.");
  if (!letter.briefing.trim()) problems.push("Write the daily briefing.");
  if (letter.stories.length === 0) problems.push("Add at least one story.");
  return problems;
}

/** Briefing length guidance from the editorial brief. */
export const BRIEFING_WORDS = { min: 60, max: 100 } as const;

export function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
