import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import {
  briefingPrompt,
  letterHeadlinePrompt,
  type SourceStory,
  storyHeadlinePrompt,
  systemPrompt,
} from "./prompts.js";

export const MODEL = "claude-opus-5-5";

/** An error whose message is safe and useful to show to the editor. */
export class AiError extends Error {}

const headlinesSchema = z.object({ headlines: z.array(z.string()) });
const briefingSchema = z.object({ briefing: z.string() });

type ParseClient = Pick<Anthropic["beta"]["messages"], "parse">;

export interface AssistantOptions {
  publicationName: string;
  /** Injected in tests; defaults to a client configured from the environment. */
  client?: { beta: { messages: ParseClient } };
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

function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new AiError("Claude rejected the API key. Check ANTHROPIC_API_KEY on the server.");
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new AiError("This API key isn't allowed to use the model. Check the Anthropic account.");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiError("Claude is rate limiting requests. Try again in a moment.");
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError("Couldn't reach Claude. Check the server's network connection.");
  }
  if (err instanceof Anthropic.APIError) {
    return new AiError(`Claude returned an error (${err.status ?? "unknown"}). Try again.`);
  }
  // Anything else happened before a request reached the API; in practice that's
  // missing credentials (the SDK throws a plain Error when it can't resolve any).
  console.error("[ai] request could not be sent:", err);
  return new AiError(
    "Couldn't call Claude. Check that ANTHROPIC_API_KEY is set on the server, then try again.",
  );
}

export function createAssistant({ publicationName, client }: AssistantOptions) {
  let lazyClient = client;
  const getClient = () => {
    lazyClient ??= new Anthropic();
    return lazyClient;
  };
  const system = systemPrompt(publicationName);

  async function run<T extends z.ZodType>(prompt: string, schema: T): Promise<z.infer<T>> {
    try {
      const response = await getClient().beta.messages.parse({
        model: MODEL,
        max_tokens: 16000,
        system,
        messages: [{ role: "user", content: prompt }],
        output_config: { effort: "medium", format: betaZodOutputFormat(schema) },
        // On a safety decline, retry on a suitable fallback model inside the same call.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (response.stop_reason === "refusal") {
        throw new AiError(
          "Claude declined to write this one. Try different wording, or write it yourself.",
        );
      }
      if (response.stop_reason === "max_tokens" || response.parsed_output == null) {
        throw new AiError("Claude's response came back incomplete. Try again.");
      }
      return response.parsed_output as z.infer<T>;
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
      const briefing = out.briefing
        .split(/\n\s*\n/)
        .map((p) => p.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .join("\n\n");
      if (!briefing) throw new AiError("Claude returned an empty briefing. Try again.");
      return briefing;
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
