import { type Assistant, createAssistant } from "@curator/ai";
import { listPromptOverrides } from "@curator/db";
import { newsletterOptions } from "./newsletter-config";

let assistant: Assistant | undefined;

export function getAssistant(): Assistant {
  assistant ??= createAssistant({
    publicationName: newsletterOptions().publicationName,
    // Prompts edited in Settings apply to the next request.
    loadPrompts: listPromptOverrides,
  });
  return assistant;
}
