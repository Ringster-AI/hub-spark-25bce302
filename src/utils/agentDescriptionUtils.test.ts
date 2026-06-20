import { describe, expect, it } from "vitest";

import {
  appendToolInstructionsToDescription,
  generateToolInstructions,
} from "./agentDescriptionUtils";

describe("generateToolInstructions", () => {
  it("returns no instructions for an agent without enabled tools", () => {
    expect(generateToolInstructions({})).toEqual([]);
  });

  it("lists transfer departments", () => {
    const instructions = generateToolInstructions({
      transfer_directory: { Sales: "+15551234567", Support: "+15557654321" },
    });

    expect(instructions).toEqual([
      "Use the transferCall tool to transfer calls to the respective departments: Sales, Support.",
    ]);
  });

  it.each([
    { calendar_booking: { enabled: true } },
    { config: { calendar_booking: { enabled: true } } },
  ])("adds booking steps for either supported calendar configuration", (agent) => {
    const [instruction] = generateToolInstructions(agent);

    expect(instruction).toContain("When a caller wants to schedule an appointment:");
    expect(instruction).toContain("Use check_availability");
    expect(instruction).toContain("Use book_appointment");
  });

  it("includes both tool instructions when both tools are configured", () => {
    const instructions = generateToolInstructions({
      transfer_directory: { Sales: "+15551234567" },
      calendar_booking: { enabled: true },
    });

    expect(instructions).toHaveLength(2);
  });
});

describe("appendToolInstructionsToDescription", () => {
  const transfer =
    "Use the transferCall tool to transfer calls to the respective departments: Sales.";
  const calendar = generateToolInstructions({ calendar_booking: { enabled: true } })[0];

  it("leaves a description unchanged when there are no instructions", () => {
    expect(appendToolInstructionsToDescription("Friendly receptionist", [])).toBe(
      "Friendly receptionist",
    );
  });

  it("adds punctuation before appending instructions", () => {
    expect(appendToolInstructionsToDescription("Friendly receptionist", [transfer])).toBe(
      `Friendly receptionist. ${transfer}`,
    );
  });

  it("supports an empty description", () => {
    expect(appendToolInstructionsToDescription("", [transfer])).toBe(transfer);
  });

  it("replaces existing transfer instructions instead of duplicating them", () => {
    const original = `Friendly receptionist. ${transfer}`;
    const replacement =
      "Use the transferCall tool to transfer calls to the respective departments: Billing.";

    const result = appendToolInstructionsToDescription(original, [replacement]);

    expect(result).toBe(`Friendly receptionist. ${replacement}`);
    expect(result).not.toContain("Sales");
  });

  it("replaces existing calendar instructions instead of duplicating them", () => {
    const result = appendToolInstructionsToDescription(
      `Friendly receptionist. ${calendar}`,
      [calendar],
    );

    expect(result).toBe(`Friendly receptionist. ${calendar}`);
    expect(result.match(/When a caller wants/g)).toHaveLength(1);
  });

  it("removes legacy calendar wording before adding current instructions", () => {
    const result = appendToolInstructionsToDescription(
      "Friendly receptionist. Use the google_calendar tool to schedule appointments for callers.",
      [calendar],
    );

    expect(result).toBe(`Friendly receptionist. ${calendar}`);
  });
});
