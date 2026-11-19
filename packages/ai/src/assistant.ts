import {
  type DeepPartial,
  generateText,
  type LanguageModel,
  NoObjectGeneratedError,
  NoOutputGeneratedError,
  Output,
  RetryError,
  streamText,
} from "ai";
import { z } from "zod";
import {
  briefingPrompt,
  draftLetterPrompt,
  letterHeadlinePrompt,
  type SourceStory,
  storyHeadlinePrompt,
  systemPrompt,
} from "./prompts.js";

/** Vercel AI Gateway model ids (provider/model). */
export const MODEL = "anthropic/claude-opus-5.5";
/** Tried by the gateway if the main model fails or is unavailable. */
export const FALLBACK_MODEL = "anthropic/claude-sonnet-5.5";

/** An error whose message is safe and useful to show to the editor. */
export class AiError extends Error {}

const headlinesSchema = z.object({ headlines: z.array(z.string()) });
const briefingSchema = z.object({ briefing: z.string() });
// Picks come first so a streamed draft reads in a natural order: choose the
// stories, write them up, then the edition headline and briefing.
const draftSchema = z.object({
  highlights: z.array(
    z.object({ storyIndex: z.number().int(), headline: z.string(), summary: z.string() }),
  ),
  headline: z.string(),
  briefing: z.string(),
});

/** A draft as it streams in: any field may be missing or half-written. `storyIndex` is 1-based here. */
export type PartialLetterDraft = DeepPartial<z.infer<typeof draftSchema>>;

/** A whole edition drafted from a day's stories. `storyIndex` is 0-based into the input. */
export interface LetterDraft {
  headline: string;
  briefing: string;
  highlights: { storyIndex: number; headline: string; summary: string }[];
}

/** The fewest stories a day needs for a drafted edition. */
export const MIN_DRAFT_STORIES = 3;

export interface AssistantOptions {
  publicationName: string;
  /**
   * Defaults to MODEL through the Vercel AI Gateway (the AI SDK's default
   * provider; authenticated by AI_GATEWAY_API_KEY, or OIDC on Vercel). Tests
   * pass a mock model.
   */
  model?: LanguageModel;
}

function cleanLine(s: string): string {
  return s
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["“'‘]+|["”'’]+$/g, "")
    .trim();
}

function uniqueNonEmpty(items: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const item = cleanLine(raw);
    const key = item.toLowerCase();
    if (item && !seen.has(key)) {
      seen.add(key);
      out.push(item);
    }
    if (out.length === max) break;
  }
  return out;
}

function cleanParagraphs(s: string): string {
  return s
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

function statusOf(err: unknown): number | undefined {
  const status = (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof status === "number" ? status : undefined;
}

/** Maps AI SDK / AI Gateway failures to messages an editor can act on. */
function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (RetryError.isInstance(err)) return toAiError(err.lastError);
  if (NoObjectGeneratedError.isInstance(err)) {
    return err.finishReason === "content-filter"
      ? new AiError(
          "Claude declined to write this one. Try different wording, or write it yourself.",
        )
      : new AiError("Claude's response came back incomplete. Try again.");
  }
  if (NoOutputGeneratedError.isInstance(err)) {
    return new AiError("Claude's response came back incomplete. Try again.");
  }
  const name = (err as { name?: unknown } | null)?.name;
  const message = err instanceof Error ? err.message : "";
  const status = statusOf(err);
  // No credentials at all: the SDK refuses before sending ("Unauthenticated. Configure
  // AI_GATEWAY_API_KEY…"), or the gateway answers "No authentication provided".
  if (/unauthenticated|no authentication provided/i.test(message)) {
    return new AiError("AI isn't set up on the server. Set AI_GATEWAY_API_KEY, then try again.");
  }
  if (name === "GatewayAuthenticationError" || name === "AI_LoadAPIKeyError" || status === 401) {
    return /no authentication provided/i.test(message)
      ? new AiError("AI isn't set up on the server. Set AI_GATEWAY_API_KEY, then try again.")
      : new AiError("The AI Gateway rejected the API key. Check AI_GATEWAY_API_KEY on the server.");
  }
  if (
    name === "GatewayForbiddenError" ||
    name === "GatewayAccessPolicyDeniedError" ||
    status === 403
  ) {
    return new AiError(
      "This AI Gateway key isn't allowed to use the model. Check the Vercel team's settings.",
    );
  }
  if (name === "GatewayRateLimitError" || status === 429) {
    return new AiError("The AI Gateway is rate limiting requests. Try again in a moment.");
  }
  if (name === "GatewayModelNotFoundError") {
    return new AiError(`The AI Gateway doesn't offer ${MODEL}. Update MODEL in @curator/ai.`);
  }
  if (status === 402) {
    return new AiError(
      "The AI Gateway account is out of credits. Top it up in Vercel, then try again.",
    );
  }
  console.error("[ai] request failed:", err);
  if (status !== undefined) return new AiError(`The AI request failed (${status}). Try again.`);
  return new AiError(
    "Couldn't reach the AI Gateway. Check the server's network connection, then try again.",
  );
}

export function createAssistant({ publicationName, model = MODEL }: AssistantOptions) {
  const instructions = systemPrompt(publicationName);

  async function run<T extends z.ZodType>(prompt: string, schema: T): Promise<z.infer<T>> {
    try {
      const result = await generateText({
        model,
        instructions,
        prompt,
        output: Output.object({ schema }),
        maxOutputTokens: 16000,
        timeout: 120_000,
        providerOptions: { gateway: { models: [FALLBACK_MODEL] } },
      });
      if (result.finishReason === "content-filter") {
        throw new AiError(
          "Claude declined to write this one. Try different wording, or write it yourself.",
        );
      }
      if (result.finishReason === "length") {
        throw new AiError("Claude's response came back incomplete. Try again.");
      }
      return result.output as z.infer<T>;
    } catch (err) {
      throw toAiError(err);
    }
  }

  /** Like run(), but streams: `onPartial` sees the output as it's generated. */
  async function runStreaming<T extends z.ZodType>(
    prompt: string,
    schema: T,
    onPartial: (partial: DeepPartial<z.infer<T>>) => void,
    abortSignal?: AbortSignal,
  ): Promise<z.infer<T>> {
    let streamError: unknown;
    try {
      const result = streamText({
        model,
        instructions,
        prompt,
        output: Output.object({ schema }),
        maxOutputTokens: 16000,
        timeout: 180_000,
        abortSignal,
        providerOptions: { gateway: { models: [FALLBACK_MODEL] } },
        onError: ({ error }) => {
          streamError ??= error;
        },
      });
      for await (const partial of result.partialOutputStream) {
        onPartial(partial as DeepPartial<z.infer<T>>);
      }
      if (streamError) throw streamError;
      const finishReason = await result.finishReason;
      if (finishReason === "content-filter") {
        throw new AiError(
          "Claude declined to write this one. Try different wording, or write it yourself.",
        );
      }
      if (finishReason === "length" || finishReason === "interrupted") {
        throw new AiError("Claude's response came back incomplete. Try again.");
      }
      return (await result.output) as z.infer<T>;
    } catch (err) {
      throw toAiError(err);
    }
  }

  function requireStories(stories: SourceStory[]) {
    if (stories.length === 0) throw new AiError("Add at least one story first.");
  }

  return {
    async suggestLetterHeadlines(input: {
      stories: SourceStory[];
      tone?: string;
      currentHeadline?: string;
    }): Promise<string[]> {
      requireStories(input.stories);
      const out = await run(letterHeadlinePrompt(input), headlinesSchema);
      const headlines = uniqueNonEmpty(out.headlines, 3);
      if (!headlines.length) throw new AiError("Claude didn't suggest any headlines. Try again.");
      return headlines;
    },

    async writeBriefing(input: {
      stories: SourceStory[];
      tone?: string;
      date?: string;
      currentDraft?: string;
      instruction?: string;
    }): Promise<string> {
      requireStories(input.stories);
      const out = await run(briefingPrompt(input), briefingSchema);
      const briefing = cleanParagraphs(out.briefing);
      if (!briefing) throw new AiError("Claude returned an empty briefing. Try again.");
      return briefing;
    },

    /**
     * Drafts a whole edition from a day's stories: picks the 3–5 most important
     * distinct ones and writes the headline, briefing and each highlight.
     */
    async draftLetter(
      input: { stories: SourceStory[]; date: string; tone?: string },
      /** Called as the draft streams in (picks, then headline, then briefing). */
      onPartial: (partial: PartialLetterDraft) => void = () => {},
      /** Stops the model call, e.g. when the editor cancels. */
      signal?: AbortSignal,
    ): Promise<LetterDraft> {
      if (input.stories.length < MIN_DRAFT_STORIES) {
        throw new AiError(
          `Only ${input.stories.length} ${input.stories.length === 1 ? "story" : "stories"} found for that day; a letter needs at least ${MIN_DRAFT_STORIES}.`,
        );
      }
      const maxHighlights = Math.min(5, input.stories.length);
      const out = await runStreaming(
        draftLetterPrompt({ ...input, minHighlights: MIN_DRAFT_STORIES, maxHighlights }),
        draftSchema,
        onPartial,
        signal,
      );
      // Keep only highlights that point at a real, not-yet-used story (prompt indexes are 1-based).
      const used = new Set<number>();
      const highlights = [];
      for (const h of out.highlights) {
        const storyIndex = h.storyIndex - 1;
        const headline = cleanLine(h.headline);
        const summary = h.summary.replace(/\s+/g, " ").trim();
        if (storyIndex < 0 || storyIndex >= input.stories.length || used.has(storyIndex)) continue;
        if (!headline || !summary) continue;
        used.add(storyIndex);
        highlights.push({ storyIndex, headline, summary });
        if (highlights.length === maxHighlights) break;
      }
      const headline = cleanLine(out.headline);
      const briefing = cleanParagraphs(out.briefing);
      if (highlights.length < MIN_DRAFT_STORIES || !headline || !briefing) {
        throw new AiError("Claude's draft came back incomplete. Try again.");
      }
      return { headline, briefing, highlights };
    },

    async suggestStoryHeadlines(input: {
      story: SourceStory;
      tone?: string;
      instruction?: string;
      otherHeadlines?: string[];
    }): Promise<string[]> {
      const out = await run(storyHeadlinePrompt(input), headlinesSchema);
      const headlines = uniqueNonEmpty(out.headlines, 3);
      if (!headlines.length) throw new AiError("Claude didn't suggest any headlines. Try again.");
      return headlines;
    },
  };
}

export type Assistant = ReturnType<typeof createAssistant>;
