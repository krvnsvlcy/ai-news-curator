import { type Assistant, createAssistant } from "@curator/ai";
import { newsletterOptions } from "./newsletter-config";

let assistant: Assistant | undefined;

export function getAssistant(): Assistant {
  assistant ??= createAssistant({ publicationName: newsletterOptions().publicationName });
  return assistant;
}
