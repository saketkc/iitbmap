// Short forms OSM names lack; fuzzy.ts derives initialisms. Keys are exact building names.
export const BUILDING_ALIASES: Record<string, string[]> = {
  KReSIT: ["KCDH", "Koita Centre for Digital Health", "Kanwal Rekhi"],
  "Department of Bio sciences and Bio engineering": ["BSBE", "Biosciences"],
  "Department of Metalurgical and Material Science Engineering": ["MEMS", "Metallurgy"],
  "Department of Energy Sciences and Engineering": ["ESE", "DESE", "CCD", "Cafe Coffee Day"],
  Gulmohar: ["Gullu"],
  "Lecture Hall": ["LHC", "Lecture Hall Complex"],
  SOM: ["SJMSOM", "School of Management"],
  "Viktor Menezes Convention Centre": ["VMCC"],
};
