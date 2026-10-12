import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isWithinBusinessHours,
  isWithinCalledPartyWindow,
  normalizeForDnc,
  timezoneForPhone,
} from "./compliance.ts";

// Wed 2026-10-14 16:00 UTC = 12:00 New York, 09:00 Los Angeles, 08:00 Anchorage
const MIDDAY_UTC = new Date("2026-10-14T16:00:00Z");
// Wed 2026-10-14 02:00 UTC = 22:00 New York (prev day), 19:00 Los Angeles
const LATE_UTC = new Date("2026-10-14T02:00:00Z");

Deno.test("normalizeForDnc strips formatting and leading country code", () => {
  assertEquals(normalizeForDnc("+1 (212) 555-0100"), "2125550100");
  assertEquals(normalizeForDnc("212.555.0100"), "2125550100");
  assertEquals(normalizeForDnc(""), "");
});

Deno.test("timezoneForPhone maps area codes", () => {
  assertEquals(timezoneForPhone("+12125550100"), "America/New_York");
  assertEquals(timezoneForPhone("+12135550100"), "America/Los_Angeles");
  assertEquals(timezoneForPhone("+19075550100"), "America/Anchorage");
  assertEquals(timezoneForPhone("12"), null);
});

Deno.test("called-party window uses the contact's local time", () => {
  assert(isWithinCalledPartyWindow("+12125550100", "UTC", MIDDAY_UTC));
  assertFalse(isWithinCalledPartyWindow("+12125550100", "UTC", LATE_UTC)); // 10pm NY
  assert(isWithinCalledPartyWindow("+12135550100", "UTC", LATE_UTC)); // 7pm LA
});

Deno.test("called-party window falls back to campaign timezone for unknown codes", () => {
  assert(isWithinCalledPartyWindow("+15555550100", "America/New_York", MIDDAY_UTC));
  assertFalse(isWithinCalledPartyWindow("+15555550100", "America/New_York", LATE_UTC));
});

Deno.test("business hours respect days and timezone", () => {
  const bh = { start: "09:00", end: "17:00", timezone: "America/New_York", days: [1, 2, 3, 4, 5] };
  assert(isWithinBusinessHours(bh, MIDDAY_UTC));
  assertFalse(isWithinBusinessHours({ ...bh, days: [0, 6] }, MIDDAY_UTC));
  assertFalse(isWithinBusinessHours(bh, LATE_UTC));
});

Deno.test("invalid timezone falls back to UTC instead of throwing", () => {
  const bh = { start: "15:00", end: "17:00", timezone: "Not/AZone", days: [3] };
  assert(isWithinBusinessHours(bh, MIDDAY_UTC));
});
