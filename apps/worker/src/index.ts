import { closeDb, seedDefaultSources } from "@curator/db";
import { type IngestResult, ingestDueSources } from "@curator/ingest";

const TICK_MS = 60_000;

const usage = `Usage: worker <command>

Commands:
  run    Keep running; fetch each enabled source when its interval elapses (default)
  once   Fetch all due sources once, then exit
  seed   Add the default sources (Sky News, The Guardian, GOV.UK, UK Parliament) if missing`;

function log(results: IngestResult[]) {
  for (const r of results) {
    if (r.status === "ok") {
      console.log(`[ok]    ${r.source}: ${r.itemCount} items, ${r.newCount} new`);
    } else {
      console.warn(`[error] ${r.source}: ${r.error}`);
    }
  }
}

async function run() {
  let stopping = false;
  let timer: NodeJS.Timeout | undefined;
  let wake: (() => void) | undefined;

  const stop = () => {
    stopping = true;
    clearTimeout(timer);
    wake?.();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  console.log("Worker started. Checking for due sources every minute.");
  while (!stopping) {
    try {
      log(await ingestDueSources());
    } catch (err) {
      // Usually a database outage; keep the loop alive and retry next tick.
      console.error("Ingestion tick failed:", err);
    }
    await new Promise<void>((resolve) => {
      wake = resolve;
      timer = setTimeout(resolve, TICK_MS);
    });
  }
  console.log("Worker stopped.");
}

async function main(command = "run") {
  switch (command) {
    case "run":
      return run();
    case "once": {
      const results = await ingestDueSources();
      if (results.length === 0) console.log("No sources are due.");
      log(results);
      if (results.some((r) => r.status === "error")) process.exitCode = 1;
      return;
    }
    case "seed": {
      const added = await seedDefaultSources();
      console.log(added.length ? `Added: ${added.join(", ")}` : "Default sources already exist.");
      return;
    }
    default:
      console.error(usage);
      process.exitCode = 2;
  }
}

try {
  await main(process.argv[2]);
} finally {
  await closeDb();
}
