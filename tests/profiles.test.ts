import { expect, it, afterEach } from "vitest";
import {
  applyProfiles,
  displayNameFor,
  normalizeDisplayName,
  ownDisplayName,
} from "../src/profiles";
afterEach(() => applyProfiles([], ""));
it("uses account names instead of email and updates the same stable identity", () => {
  applyProfiles([{ user_id: "owner", display_name: "Ameen" }], "owner");
  expect(ownDisplayName).toBe("Ameen");
  expect(displayNameFor("owner", "old@example.test")).toBe("Ameen");
  applyProfiles([{ user_id: "owner", display_name: "Ameen M" }], "owner");
  expect(displayNameFor("owner")).toBe("Ameen M");
  expect(displayNameFor("friend", "friend@example.test")).toBe("Traveler");
  expect(displayNameFor("friend", "You")).toBe("Traveler");
  expect(displayNameFor("self", "You", "self")).toBe("You");
});
it("normalizes international names and validates without turning emails into names", () => {
  expect(normalizeDisplayName("  Zoë   李 ")).toBe("Zoë 李");
  for (const value of ["", "bad\nname", "test@example.test", "x".repeat(61)])
    expect(() => normalizeDisplayName(value)).toThrow();
});
