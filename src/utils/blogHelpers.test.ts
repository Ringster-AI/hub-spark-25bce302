import { afterEach, describe, expect, it, vi } from "vitest";

import { formatBlogDate, generateSlug } from "./blogHelpers";

describe("generateSlug", () => {
  it.each([
    ["My First Blog Post", "my-first-blog-post"],
    ["  Multiple --- separators!  ", "multiple-separators"],
    ["Ringster: AI Calls & More", "ringster-ai-calls-more"],
    ["Already-a-slug", "already-a-slug"],
    ["", ""],
  ])("converts %j to %j", (title, expected) => {
    expect(generateSlug(title)).toBe(expected);
  });
});

describe("formatBlogDate", () => {
  afterEach(() => vi.useRealTimers());

  it("returns null when no date is supplied", () => {
    expect(formatBlogDate(null)).toBeNull();
    expect(formatBlogDate("")).toBeNull();
  });

  it("formats a date using the product's US display format", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-19T12:00:00Z"));

    expect(formatBlogDate("2026-06-19T12:00:00Z")).toBe("June 19, 2026");
  });
});
