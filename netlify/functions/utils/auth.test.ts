import { describe, expect, it } from "vitest";

import {
  corsHeaders,
  forbiddenResponse,
  unauthorizedResponse,
} from "./auth";

describe("HTTP auth responses", () => {
  it("builds an unauthorized response with default values", () => {
    expect(unauthorizedResponse()).toEqual({
      statusCode: 401,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Unauthorized" }),
    });
  });

  it("builds a forbidden response with a custom message", () => {
    expect(forbiddenResponse("Agent belongs to another user")).toEqual({
      statusCode: 403,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Agent belongs to another user" }),
    });
  });
});
