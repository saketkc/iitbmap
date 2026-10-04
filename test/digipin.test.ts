import { describe, expect, it } from "vitest";
import { decodeDigipin, encodeDigipin } from "../demo/src/lib/digipin";

describe("DIGIPIN", () => {
  it("matches India Post's published code for Dak Bhawan, New Delhi", () => {
    expect(encodeDigipin([77.213033, 28.622788])).toBe("39J-49L-L8T4");
  });

  it("decodes back into the same ~4m cell, with or without dashes", () => {
    const [lng, lat] = decodeDigipin("39j 49l l8t4")!;
    expect(Math.abs(lat - 28.622788)).toBeLessThan(0.00005);
    expect(Math.abs(lng - 77.213033)).toBeLessThan(0.00005);
    expect(encodeDigipin([lng, lat])).toBe("39J-49L-L8T4");
  });

  it("rejects things that aren't DIGIPINs", () => {
    expect(decodeDigipin("KReSIT")).toBeNull();
    expect(decodeDigipin("39J-49L-L8T")).toBeNull();
    expect(decodeDigipin("39J-49L-L8T0")).toBeNull();
  });
});
