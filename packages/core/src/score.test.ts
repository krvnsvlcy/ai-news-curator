import { describe, expect, it } from "vitest";
import { curate, scoreArticle } from "./score.js";
import type { Article } from "./types.js";

const base: Article = {
  id: "1",
  sourceId: "hn",
  title: "",
  url: "https://example.com",
  publishedAt: "2026-11-19T00:00:00Z",
};

describe("scoreArticle", () => {
  it("tags matching keywords", () => {
    const r = scoreArticle({ ...base, title: "New LLM agent tops benchmark" });
    expect(r.tags).toEqual(["llm", "agent", "benchmark"]);
    expect(r.score).toBe(1);
  });

  it("does not match substrings", () => {
    expect(scoreArticle({ ...base, title: "Said the chair" }).tags).toEqual([]);
  });
});

describe("curate", () => {
  it("filters and sorts by score", () => {
    const out = curate([
      { ...base, id: "a", title: "Gardening tips" },
      { ...base, id: "b", title: "LLM inference" },
      { ...base, id: "c", title: "LLM agent inference benchmark" },
    ]);
    expect(out.map((a) => a.id)).toEqual(["c", "b"]);
  });
});
