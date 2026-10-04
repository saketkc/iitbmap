import { describe, expect, it } from "vitest";
import { buildingPath, buildingSlug, slugFromPathname } from "../demo/src/lib/building-url";
import { IITB_BUILDINGS } from "../src/buildings";

describe("building share URLs", () => {
  it("round-trips every building name through its share path", () => {
    for (const f of IITB_BUILDINGS.features) {
      const name = f.properties!.name as string;
      const slug = buildingSlug(name);
      expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(slugFromPathname(`/iitbmap/${buildingPath(name)}`)).toBe(slug);
    }
  });

  it("ignores non-building paths", () => {
    expect(slugFromPathname("/iitbmap/")).toBeNull();
    expect(slugFromPathname("/")).toBeNull();
  });
});
