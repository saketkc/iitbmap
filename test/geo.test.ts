import { describe, it, expect } from "vitest";
import { inCampusBbox } from "../src/geo";

describe("inCampusBbox", () => {
  it("accepts a campus point", () => expect(inCampusBbox(19.13, 72.91)).toBe(true));
  it("rejects an off-campus point", () => expect(inCampusBbox(12.97, 77.59)).toBe(false));
});
