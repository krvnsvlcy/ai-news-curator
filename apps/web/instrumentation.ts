export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const [{ registerAiObservability }, { registerPostHogLogs }] = await Promise.all([
      import("./lib/ai-observability"),
      import("./lib/posthog-logs"),
    ]);
    await Promise.all([registerAiObservability(), registerPostHogLogs()]);
  }
}
