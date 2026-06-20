import { afterEach, describe, expect, it, vi } from "vitest";

import { getNetlifyFunctionsUrl } from "./netlifyFunctions";

describe("getNetlifyFunctionsUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses a relative URL when no external Netlify URL is configured", () => {
    vi.stubEnv("VITE_NETLIFY_URL", "");

    expect(getNetlifyFunctionsUrl("voices")).toBe("/.netlify/functions/voices");
  });

  it("uses the configured host outside Netlify", () => {
    vi.stubEnv("VITE_NETLIFY_URL", "https://functions.example.com");

    expect(getNetlifyFunctionsUrl("voices")).toBe(
      "https://functions.example.com/.netlify/functions/voices",
    );
  });
});
