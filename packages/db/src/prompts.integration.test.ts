import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.MONGO_TEST_URL;

describe.skipIf(!url)("prompts (integration)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: module is imported after env is set
  let db: any;

  beforeAll(async () => {
    process.env.MONGO_DB_URL = url;
    process.env.MONGO_DB_NAME = `curator_prompts_test_${Date.now()}`;
    db = await import("./index.js");
  });
  afterAll(async () => {
    await (await db.getDb()).dropDatabase();
    await db.closeDb();
  });

  it("saves, replaces and resets overrides", async () => {
    expect(await db.listPromptOverrides()).toEqual({});
    await db.savePrompt("briefing", "First");
    await db.savePrompt("briefing", "Second");
    await db.savePrompt("system", "Sys");
    expect(await db.listPromptOverrides()).toEqual({ briefing: "Second", system: "Sys" });
    await db.resetPrompt("briefing");
    expect(await db.listPromptOverrides()).toEqual({ system: "Sys" });
  });
});
