import { type Assistant, createAssistant } from "@curator/ai";
import { listPromptOverrides } from "@curator/db";
import { flushAiObservability } from "./ai-observability";
import { newsletterOptions } from "./newsletter-config";

let assistant: Assistant | undefined;

function flushAfter<T>(operation: () => Promise<T>): Promise<T> {
  return operation().finally(flushAiObservability);
}

export function getAssistant(): Assistant {
  if (!assistant) {
    const baseAssistant = createAssistant({
      publicationName: newsletterOptions().publicationName,
      // Prompts edited in Settings apply to the next request.
      loadPrompts: listPromptOverrides,
    });
    assistant = {
      suggestLetterHeadlines: (input) =>
        flushAfter(() => baseAssistant.suggestLetterHeadlines(input)),
      writeBriefing: (input) => flushAfter(() => baseAssistant.writeBriefing(input)),
      draftLetter: (input, onPartial, signal) =>
        flushAfter(() => baseAssistant.draftLetter(input, onPartial, signal)),
      suggestStoryHeadlines: (input) =>
        flushAfter(() => baseAssistant.suggestStoryHeadlines(input)),
    };
  }
  return assistant;
}
