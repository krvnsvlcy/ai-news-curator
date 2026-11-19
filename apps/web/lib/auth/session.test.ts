import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./session";

describe("safeRedirectPath", () => {
  it.each([
    ["/articles?x=1", "/articles?x=1"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["https://evil.com", "/"],
    [undefined, "/"],
  ])("%s -> %s", (input, expected) => {
    expect(safeRedirectPath(input)).toBe(expected);
  });
});
