// India Post DIGIPIN, ported from INDIAPOST-gov/digipin (https://www.indiapost.gov.in/digipin).
const GRID = ["FC98", "J327", "K456", "LMPT"];
const BOUNDS = { minLat: 2.5, maxLat: 38.5, minLng: 63.5, maxLng: 99.5 };

/** DIGIPIN for a [lng, lat] point, formatted "XXX-XXX-XXXX". */
export function encodeDigipin([lng, lat]: [number, number]): string {
  if (lat < BOUNDS.minLat || lat > BOUNDS.maxLat || lng < BOUNDS.minLng || lng > BOUNDS.maxLng) {
    throw new Error("DIGIPIN: point is outside India's bounds");
  }
  let { minLat, maxLat, minLng, maxLng } = BOUNDS;
  let code = "";
  for (let level = 0; level < 10; level++) {
    const latDiv = (maxLat - minLat) / 4;
    const lngDiv = (maxLng - minLng) / 4;
    const row = Math.max(0, Math.min(3, 3 - Math.floor((lat - minLat) / latDiv)));
    const col = Math.max(0, Math.min(3, Math.floor((lng - minLng) / lngDiv)));
    code += GRID[row][col];
    maxLat = maxLat - latDiv * row;
    minLat = maxLat - latDiv;
    minLng = minLng + lngDiv * col;
    maxLng = minLng + lngDiv;
  }
  return `${code.slice(0, 3)}-${code.slice(3, 6)}-${code.slice(6)}`;
}

/** [lng, lat] at the cell centre, or null if input isn't a DIGIPIN; dashes and spaces optional. */
export function decodeDigipin(input: string): [number, number] | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (!/^[2-9CFJKLMPT]{10}$/.test(code)) return null;
  let { minLat, maxLat, minLng, maxLng } = BOUNDS;
  for (const ch of code) {
    const row = GRID.findIndex((r) => r.includes(ch));
    const col = GRID[row].indexOf(ch);
    const latDiv = (maxLat - minLat) / 4;
    const lngDiv = (maxLng - minLng) / 4;
    maxLat = maxLat - latDiv * row;
    minLat = maxLat - latDiv;
    minLng = minLng + lngDiv * col;
    maxLng = minLng + lngDiv;
  }
  return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}
