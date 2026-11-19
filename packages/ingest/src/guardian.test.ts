import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildGuardianUrl, fetchGuardian, parseGuardian } from "./adapters/guardian.js";

const json = readFileSync(new URL("./__fixtures__/guardian-search.json", import.meta.url), "utf8");

describe("guardian adapter", () => {
  it("normalizes search results", () => {
    const [a, b] = parseGuardian(json);
    expect(a).toMatchObject({
      externalId: "politics/2026/nov/19/example-minister-announces-review",
      title: "Minister announces review of review process",
      summary: "Officials say the new review will report back ‘in due course’",
      author: "Jane Doe Political correspondent",
      section: "Politics",
    });
    expect(a?.publishedAt.toISOString()).toBe("2026-11-19T15:30:00.000Z");
    expect(b?.summary).toBeUndefined();
  });

  it("surfaces API errors", () => {
    expect(() =>
      parseGuardian(JSON.stringify({ response: { status: "error", message: "Bad key" } })),
    ).toThrow("Guardian API error: Bad key");
  });

  it("builds the query", () => {
    const url = new URL(
      buildGuardianUrl({ kind: "guardian", section: "politics|uk-news", pageSize: 20 }, "k"),
    );
    expect(url.searchParams.get("section")).toBe("politics|uk-news");
    expect(url.searchParams.get("page-size")).toBe("20");
    expect(url.searchParams.has("q")).toBe(false);
  });

  it("requires an API key and never leaks it in errors", async () => {
    await expect(fetchGuardian({ kind: "guardian", pageSize: 1 }, {})).rejects.toThrow(
      "GUARDIAN_API_KEY is not set",
    );
    const failing = (async () => {
      throw new Error("connect failed for https://x/?api-key=secret123");
    }) as unknown as typeof fetch;
    await expect(
      fetchGuardian({ kind: "guardian", pageSize: 1 }, { GUARDIAN_API_KEY: "secret123" }, failing),
    ).rejects.toThrow("api-key=***");
  });
});
