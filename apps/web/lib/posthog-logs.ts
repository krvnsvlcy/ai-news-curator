import { SeverityNumber } from "@opentelemetry/api-logs";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { BatchLogRecordProcessor, LoggerProvider } from "@opentelemetry/sdk-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

let loggerProvider: LoggerProvider | undefined;
let posthogLogger: ReturnType<LoggerProvider["getLogger"]> | undefined;
let registration: Promise<void> | undefined;

export function registerPostHogLogs(): Promise<void> {
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

    loggerProvider = new LoggerProvider({
      resource: resourceFromAttributes({
        "service.name": "curator-web",
      }),
      processors: [
        new BatchLogRecordProcessor({
          exporter: new OTLPLogExporter({
            url: `${host}/i/v1/logs`,
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          }),
        }),
      ],
    });
    posthogLogger = loggerProvider.getLogger("posthog-curator-log-export");
  })();

  return registration;
}

export function logLetterDraftLifecycle(status: "accepted" | "completed" | "failed"): void {
  posthogLogger?.emit({
    body: `letter_draft_${status}`,
    severityNumber: status === "failed" ? SeverityNumber.ERROR : SeverityNumber.INFO,
    attributes: {
      route: "/api/letters/draft",
      status,
    },
  });
}

export async function flushPostHogLogs(): Promise<void> {
  if (!loggerProvider) return;

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      loggerProvider.forceFlush().catch(() => {}),
      new Promise<void>((resolve) => {
        timeout = setTimeout(resolve, 2_000);
      }),
    ]);
  } catch {
    // PostHog delivery must not affect the letter draft response.
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
