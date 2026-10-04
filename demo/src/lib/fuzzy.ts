import { normalizeName as normalize } from "./building-url";

/** Optimal-string-alignment distance: insert/delete/substitute/swap-adjacent each cost 1. */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

const allowedTypos = (word: string) => (word.length <= 3 ? 0 : word.length <= 6 ? 1 : 2);

/** Typed word vs name word, compared as a prefix so partial typing matches. */
function wordCost(typed: string, word: string): number {
  if (word.startsWith(typed)) return 0;
  // Compare against same-length (+/-1) prefixes so "victo" still matches "viktor".
  return Math.min(
    ...[typed.length - 1, typed.length, typed.length + 1].map((n) => editDistance(typed, word.slice(0, Math.max(n, 1)))),
  );
}

const NO_ALIASES: Record<string, string[]> = {};
const STOPWORDS = new Set(["of", "and", "for", "the", "in"]);

interface Entry {
  name: string;
  full: string; // normalized name
  words: string[]; // matched with typo tolerance
  codes: string[]; // initialisms and aliases; exact prefix only, typos on short codes match everything
}

function toEntry(name: string, aliases: string[]): Entry {
  const full = normalize(name);
  const words = full.split(" ");
  const initials = words.filter((w) => !STOPWORDS.has(w)).map((w) => w[0]).join("");
  // every suffix, so "ese" matches as well as "dese"
  const codes = [...initials].map((_, i) => initials.slice(i)).filter((c) => c.length >= 2);
  const aliasWords = aliases.flatMap((a) => normalize(a).split(" "));
  return { name, full, words: [...words, ...aliasWords], codes: [...codes, ...aliases.map((a) => normalize(a).replace(/ /g, ""))] };
}

const entryCache = new WeakMap<string[], { aliases: Record<string, string[]>; entries: Entry[] }>();

/** Names matching query, best first; each typed word must hit a name word (with typos), an initialism or an alias. */
export function searchNames(query: string, names: string[], aliases: Record<string, string[]> = NO_ALIASES): string[] {
  const q = normalize(query);
  if (!q) return [];
  let cached = entryCache.get(names);
  if (cached?.aliases !== aliases) {
    cached = { aliases, entries: names.map((n) => toEntry(n, aliases[n] ?? [])) };
    entryCache.set(names, cached);
  }
  const { entries } = cached;
  const typed = q.split(" ");
  const scored: { name: string; cost: number }[] = [];
  for (const e of entries) {
    let cost = e.full.includes(q) ? -1 : 0; // exact substring hits rank above everything else
    for (const t of typed) {
      const best = e.codes.some((c) => c.startsWith(t)) ? 0 : Math.min(...e.words.map((w) => wordCost(t, w)));
      if (best > allowedTypos(t)) {
        cost = Infinity;
        break;
      }
      cost += best;
    }
    if (cost !== Infinity) scored.push({ name: e.name, cost });
  }
  return scored
    .sort((a, b) => a.cost - b.cost || a.name.length - b.name.length)
    .slice(0, 8)
    .map((s) => s.name);
}
