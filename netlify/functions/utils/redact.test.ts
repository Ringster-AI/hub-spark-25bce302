import { describe, expect, it } from "vitest";

import { redact, summarizeForLog } from "./redact";

describe("redact", () => {
  it("masks phone numbers and email addresses in free text", () => {
    expect(redact("Call +1 (416) 555-1234 or jane.doe@example.com")).toBe(
      "Call ***1234 or j***@example.com",
    );
  });

  it.each(["authorization", "apiKey", "api_key", "token", "password", "secret"])(
    "redacts the sensitive key %s case-insensitively",
    (key) => {
      expect(redact({ [key.toUpperCase()]: "do-not-log" })).toEqual({
        [key.toUpperCase()]: "[redacted]",
      });
    },
  );

  it("uses field names to mask phone and email values", () => {
    expect(
      redact({ contactPhone: "4165559876", customerEmail: "alex@example.ca" }),
    ).toEqual({ contactPhone: "***9876", customerEmail: "a***@example.ca" });
  });

  it("recursively redacts arrays and nested objects without mutating input", () => {
    const input = { contacts: [{ email: "sam@example.com", active: true }], count: 1 };

    expect(redact(input)).toEqual({
      contacts: [{ email: "s***@example.com", active: true }],
      count: 1,
    });
    expect(input.contacts[0].email).toBe("sam@example.com");
  });

  it("truncates data beyond the supported nesting depth", () => {
    const deeplyNested = { a: { b: { c: { d: { e: { f: { g: "hidden" } } } } } } };

    expect(redact(deeplyNested)).toEqual({
      a: { b: { c: { d: { e: { f: { g: "[truncated]" } } } } } },
    });
  });
});

describe("summarizeForLog", () => {
  it("serializes a safe redacted payload", () => {
    expect(summarizeForLog({ token: "secret", phone: "+14165551234" })).toBe(
      '{"token":"[redacted]","phone":"***1234"}',
    );
  });

  it("falls back safely when a payload cannot be serialized", () => {
    const unreadable = new Proxy({}, {
      ownKeys() {
        throw new Error("cannot inspect payload");
      },
    });

    expect(summarizeForLog(unreadable)).toBe("[unserialisable payload]");
  });
});
