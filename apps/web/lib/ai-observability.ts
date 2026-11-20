import { OpenTelemetry } from "@ai-sdk/otel";
import { trace } from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { TracerProvider } from "@opentelemetry/sdk-trace";
import { PostHogSpanProcessor } from "@posthog/ai/otel";
import { registerTelemetry } from "ai";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

let posthogSpanProcessor: PostHogSpanProcessor | undefined;
let registration: Promise<void> | undefined;

export function registerAiObservability(): Promise<void> {
  registration ??= (async () => {
    if (!token || !host) {
      if (process.env.NODE_ENV !== "production") {
        const missingVariable = token
          ? "NEXT_PUBLIC_POSTHOG_HOST"
          : "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN";
        console.warn(
          `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
        );
      }
      return;
    }

    posthogSpanProcessor = new PostHogSpanProcessor({
      projectToken: token,
      host,
      privacyMode: false,
    });

    const provider = new TracerProvider({
      resource: resourceFromAttributes({
        "service.name": "curator-web",
      }),
      spanProcessors: [posthogSpanProcessor],
    });
    trace.setGlobalTracerProvider(provider);

    registerTelemetry(
      new OpenTelemetry({
        enrichSpan: ({ runtimeContext }) => ({
          "posthog.distinct_id":
            typeof runtimeContext?.distinctId === "string"
              ? runtimeContext.distinctId
              : undefined,
          $ai_session_id:
            typeof runtimeContext?.sessionId === "string"
              ? runtimeContext.sessionId
              : undefined,
          $ai_trace_name:
            typeof runtimeContext?.traceName === "string"
              ? runtimeContext.traceName
              : undefined,
        }),
      }),
    );
  })();

  return registration;
}

export async function flushAiObservability(): Promise<void> {
  if (!posthogSpanProcessor) return;

  try {
    await Promise.race([
      posthogSpanProcessor.forceFlush().catch(() => {}),
      new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
    ]);
  } catch {
    // PostHog delivery must not change the result of an editorial request.
  }
}
