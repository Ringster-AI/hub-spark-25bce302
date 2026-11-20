import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isPreflight,
  PUBLIC_FUNCTIONS,
  requiresJwt,
  resolveFunctionName,
} from "./policy.ts";

Deno.test("resolveFunctionName finds the function after the v1 mount point", () => {
  assertEquals(
    resolveFunctionName("/functions/v1/text-to-speech"),
    "text-to-speech",
  );
  assertEquals(
    resolveFunctionName("/functions/v1/process-campaigns"),
    "process-campaigns",
  );
});

Deno.test("resolveFunctionName handles a custom mount prefix", () => {
  // The mount prefix is configurable, so the dispatcher cannot hard-code
  // "/functions/v1". The function name is whatever follows the last "v1".
  assertEquals(resolveFunctionName("/v1/hello"), "hello");
  assertEquals(resolveFunctionName("/some/other/prefix/v1/hello"), "hello");
});

Deno.test("resolveFunctionName falls back to the first segment", () => {
  assertEquals(resolveFunctionName("/text-to-speech"), "text-to-speech");
});

Deno.test("resolveFunctionName returns null for a path with no function", () => {
  assertEquals(resolveFunctionName("/"), null);
  assertEquals(resolveFunctionName(""), null);
  assertEquals(resolveFunctionName("/functions/v1/"), null);
});

Deno.test("a function not on the allowlist requires a JWT", () => {
  assert(requiresJwt("text-to-speech", true));
  assert(requiresJwt("get-live-stream-url", true));
  assert(requiresJwt("some-brand-new-function", true));
});

Deno.test("allowlisted functions stay public", () => {
  assertFalse(requiresJwt("process-campaigns", true));
  assertFalse(requiresJwt("auth-email-hook", true));
  assertFalse(requiresJwt("stripe-webhook", true));
  assertFalse(requiresJwt("google-callback", true));
  assertFalse(requiresJwt("partner-demos", true));
});

Deno.test("nothing is enforced when VERIFY_JWT is off", () => {
  // The global switch being off must not silently make the allowlist
  // meaningless: with it off, no function is gated, which is the
  // pre-existing behaviour of the self-hosted runtime.
  assertFalse(requiresJwt("text-to-speech", false));
  assertFalse(requiresJwt("process-campaigns", false));
});

Deno.test("every allowlisted entry is a plausible public entry point", () => {
  // Guards against a typo in the allowlist that would silently expose a
  // function, or a stray entry that would silently break a webhook.
  for (const name of PUBLIC_FUNCTIONS) {
    assert(
      /^[a-z0-9-]+$/.test(name),
      `allowlist entry "${name}" is not a valid function name`,
    );
  }
});

Deno.test("the allowlist contains the known cron and webhook targets", () => {
  // These are the functions the database and third parties call directly.
  // If one is removed by accident, the caller starts getting 401s.
  const required = [
    "process-campaigns",
    "email-lifecycle-cron",
    "process-booking-reminders",
    "auth-email-hook",
    "stripe-webhook",
    "calendly-webhook",
    "calcom-webhook",
    "vapi-webhook",
    "google-callback",
    "microsoft-callback",
  ];
  for (const name of required) {
    assert(
      PUBLIC_FUNCTIONS.has(name),
      `"${name}" must stay public or its caller breaks`,
    );
  }
});

Deno.test("preflight requests bypass the auth check", () => {
  assert(isPreflight("OPTIONS"));
  assert(isPreflight("options"));
  assertFalse(isPreflight("GET"));
  assertFalse(isPreflight("POST"));
});
