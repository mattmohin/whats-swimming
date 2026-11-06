import React, { useEffect, useMemo, useRef, useState } from 'react';

/** Standalone React + CSS. No Tailwind, icon package, remote fonts, or asset requests.
 * The supplied attachment was truncated before its species data/component setup.
 * SAMPLE_FISH below is the embedded catalogue used by the standalone MVP.
 * Northeast records have source links and review dates; they remain consumer guidance,
 * not legal harvest advice. Other regions are still being expanded in the same format.
 * Production: supply a stable loadCatalogue callback returning validated Fish[].
 * Empty/error responses never silently fall back to samples. Keep writes/auth server-side.
 */
export const REGIONS = [
  { id: 'NE_NY', name: 'Northeast & New York', coast: 'Montauk to Cape Cod' },
  { id: 'PNW_AK', name: 'Pacific Northwest & Alaska', coast: 'Puget Sound to Sitka' },
  { id: 'CA_BAJA', name: 'California & Baja', coast: 'Santa Barbara to Ensenada' },
  { id: 'GULF_SOUTH', name: 'Gulf & South Atlantic', coast: 'Key West to Galveston' },
  { id: 'JP_SEAS', name: 'Seas of Japan', coast: 'Hokkaido to Toyama Bay' },
] as const;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const CATALOGUE_PROVENANCE = {
  primaryRegion: 'NE_NY',
  status: 'Northeast sourced baseline; other regions editorial baseline',
  checkedAt: '2026-11-05',
  method: 'Normalized public fishery profiles and seafood guidance; verify local rules before use',
} as const;
type RegionId = typeof REGIONS[number]['id'];
type Shape = 'fish' | 'flat' | 'shell' | 'prawn' | 'angler';
export type SeasonRule = { peak: number[]; available: number[]; source?: string; checkedAt?: string; note?: string };
export type Fish = {
  id: string; name: string; scientificName: string; tagline: string; color: string;
  shape: Shape; kind: 'Fish' | 'Shellfish'; richness: 1 | 2 | 3;
  texture: string; cook: string; pairings: string[];
  sourceType: 'Wild caught' | 'Farm raised' | 'Mixed';
  harvestMethod: string;
  sustainability: 'Good choice' | 'Ask your fishmonger' | 'Varies by source';
  sustainabilityNote: string;
  regions: Partial<Record<RegionId, SeasonRule>>;
};
export type CatalogueLoader = (signal: AbortSignal) => Promise<Fish[]>;
type Season = 'peak' | 'available' | 'outside' | 'unknown';
type Filter = 'season' | 'peak' | 'sustainable' | 'all';
type Sort = 'season' | 'name' | 'richness';
type Journal = { saved: string[]; notes: Record<string, string> };
const STORAGE_KEY = 'whats-swimming-journal-v1';
const BLANK_JOURNAL: Journal = { saved: [], notes: {} };
const LABELS: Record<Season, string> = { peak: '★ Peak', available: '● In season', outside: '— Outside season', unknown: '? Not recorded' };
const RICHNESS = ['Light', 'Balanced', 'Rich'];

// Editorial baseline informed by NOAA species and management pages reviewed 2026-11-05.
// These are broad market-season heuristics, not legal open-season rules.
const SOURCE_URLS: Record<string, string> = {
  'sea-bass': 'https://www.fisheries.noaa.gov/species/black-sea-bass',
  scallop: 'https://www.fisheries.noaa.gov/species/atlantic-sea-scallop',
  monkfish: 'https://www.fisheries.noaa.gov/permit/monkfish',
  flounder: 'https://www.fisheries.noaa.gov/species/summer-flounder',
  cod: 'https://www.fisheries.noaa.gov/species/atlantic-cod/management',
  haddock: 'https://www.montereybayaquarium.org/animals-the-ocean/how-to-choose-sustainable-seafood/sustainable-seafood-guides/cod-and-haddock-buying-guide',
  salmon: 'https://www.fisheries.noaa.gov/species/chinook-salmon',
  halibut: 'https://www.fisheries.noaa.gov/species/pacific-halibut',
  // These two records need a species-specific regional source before publication.
  snapper: 'https://www.fisheries.noaa.gov/species/red-snapper',
  pollock: 'https://www.montereybayaquarium.org/animals-the-ocean/how-to-choose-sustainable-seafood/sustainable-seafood-guides/pollock-buying-guide',
  mahi: 'https://www.montereybayaquarium.org/animals-the-ocean/how-to-choose-sustainable-seafood/sustainable-seafood-guides/mahi-mahi-buying-guide',
  sardine: 'https://www.montereybayaquarium.org/animals-the-ocean/how-to-choose-sustainable-seafood/sustainable-seafood-guides/sardine-anchovy-herring-buying-guide',
  herring: 'https://www.montereybayaquarium.org/animals-the-ocean/how-to-choose-sustainable-seafood/sustainable-seafood-guides/sardine-anchovy-herring-buying-guide',
  shrimp: 'https://www.montereybayaquarium.org/animals-the-ocean/how-to-choose-sustainable-seafood/sustainable-seafood-guides/shrimp-buying-guide',
  tuna: 'https://www.montereybayaquarium.org/animals-the-ocean/how-to-choose-sustainable-seafood/sustainable-seafood-guides/tuna-buying-guide',
  tilapia: 'https://www.montereybayaquarium.org/animals-the-ocean/how-to-choose-sustainable-seafood/sustainable-seafood-guides/tilapia-buying-guide',
  mussel: 'https://www.montereybayaquarium.org/animals-the-ocean/how-to-choose-sustainable-seafood/sustainable-seafood-guides/clams-mussels-oysters-scallops-buying-guide',
};
const sample = (id: string, name: string, scientificName: string, tagline: string, color: string,
  shape: Shape, richness: Fish['richness'], texture: string, cook: string, pairings: string[],
  regionIds: RegionId[], peak: number[], available: number[], sourceType: Fish['sourceType'], harvestMethod: string,
  sustainability: Fish['sustainability'], sustainabilityNote: string): Fish => ({
  id, name, scientificName, tagline, color, shape, richness, texture, cook, pairings,
  sourceType, harvestMethod, sustainability, sustainabilityNote,
  kind: shape === 'shell' || shape === 'prawn' ? 'Shellfish' : 'Fish',
  regions: Object.fromEntries(regionIds.map(region => [region, {
    peak,
    available,
    source: SOURCE_URLS[id],
    checkedAt: '2026-11-05',
    note: 'Editorial baseline from the linked fishery profile; local landings and legal seasons vary by stock, area, gear, and quota.',
  }])),
});
export const SAMPLE_FISH: Fish[] = [
  sample('sea-bass', 'Black sea bass', 'Centropristis striata', 'Delicate, clean, lightly sweet.', '#729dba', 'fish', 1, 'Delicate flakes', 'Pan roast', ['Lemon', 'Olive oil', 'Parsley'], ['NE_NY', 'GULF_SOUTH'], [5,6,10,11], [4,5,6,7,8,9,10,11,12], 'Wild caught', 'Pots, traps, or hook and line', 'Good choice', 'Often a strong regional choice when caught with lower-impact gear; confirm origin and method.'),
  sample('scallop', 'Sea scallop', 'Placopecten magellanicus', 'Sweet, tender, and ocean-bright.', '#d496a1', 'shell', 2, 'Tender & sweet', 'Sear', ['Brown butter', 'Lemon', 'Chives'], ['NE_NY'], [10,11,12,1,2], [1,2,3,4,5,6,7,8,9,10,11,12], 'Wild caught', 'Dredge or diver harvested', 'Varies by source', 'Impact changes substantially by harvest area and method. Ask whether they are diver caught or from a managed fishery.'),
  sample('monkfish', 'Monkfish', 'Lophius americanus', 'Firm, mild, and pleasantly meaty.', '#a7a16b', 'angler', 1, 'Firm & meaty', 'Roast', ['Tomato', 'Olive oil', 'Thyme'], ['NE_NY'], [10,11,12,1,2], [1,2,3,4,5,9,10,11,12], 'Wild caught', 'Trawl or gillnet', 'Ask your fishmonger', 'Bycatch and gear impact can vary. Ask where and how it was caught.'),
  sample('flounder', 'Summer flounder', 'Paralichthys dentatus', 'Fine flakes with a gentle sweetness.', '#b8a379', 'flat', 1, 'Fine & delicate', 'Pan fry', ['Lemon', 'Butter', 'Capers'], ['NE_NY', 'GULF_SOUTH'], [6,7,8], [4,5,6,7,8,9,10], 'Wild caught', 'Trawl or hook and line', 'Varies by source', 'Management and gear differ by region. Local hook-and-line catches may reduce habitat impact.'),
  sample('cod', 'Atlantic cod', 'Gadus morhua', 'Large flakes and a clean, mild finish.', '#8aa899', 'fish', 1, 'Large flakes', 'Bake', ['Potato', 'Olive oil', 'Parsley'], ['NE_NY'], [11,12,1,2], [1,2,3,4,10,11,12], 'Wild caught', 'Hook and line, gillnet, or trawl', 'Ask your fishmonger', 'Stock status varies sharply by area. Origin is essential when evaluating Atlantic cod.'),
  sample('haddock', 'Haddock', 'Melanogrammus aeglefinus', 'Clean, lean, and gently sweet.', '#9aa9a0', 'fish', 1, 'Fine flakes', 'Bake', ['Lemon', 'Breadcrumbs', 'Parsley'], ['NE_NY'], [4,5,6,7,8,9], [1,2,3,4,5,6,7,8,9,10,11,12], 'Wild caught', 'Trawl, longline, or hook and line', 'Ask your fishmonger', 'U.S. Georges Bank and Gulf of Maine haddock are the preferred regional source; ask for origin and method.'),
  sample('salmon', 'Chinook salmon', 'Oncorhynchus tshawytscha', 'Silky texture with full, rich flavor.', '#d79383', 'fish', 3, 'Silky & rich', 'Roast', ['Lemon', 'Dill', 'Mustard'], ['PNW_AK', 'CA_BAJA', 'JP_SEAS'], [5,6,7], [3,4,5,6,7,8,9], 'Mixed', 'Troll, net, or aquaculture', 'Varies by source', 'Wild and farmed options have different tradeoffs. Look for a specific origin, fishery, and farming system.'),
  sample('halibut', 'Pacific halibut', 'Hippoglossus stenolepis', 'Lean, firm, and gently sweet.', '#879d89', 'flat', 1, 'Firm flakes', 'Roast', ['Butter', 'Lemon', 'Tarragon'], ['PNW_AK'], [5,6,7,8], [3,4,5,6,7,8,9,10,11], 'Wild caught', 'Longline', 'Good choice', 'Well-managed North Pacific fisheries are often preferred; confirm the catch area.'),
  sample('yellowtail', 'Yellowtail', 'Seriola quinqueradiata', 'Rich, firm, and clean tasting.', '#c5ae59', 'fish', 3, 'Firm & rich', 'Grill', ['Ginger', 'Soy sauce', 'Citrus'], ['JP_SEAS'], [12,1,2], [1,2,3,10,11,12], 'Farm raised', 'Marine net pens', 'Varies by source', 'Feed, stocking density, escapes, and farm practices differ. Seek transparent farm information.'),
  sample('prawn', 'Spot prawn', 'Pandalus platyceros', 'Springy texture and natural sweetness.', '#d6957e', 'prawn', 1, 'Springy & sweet', 'Sauté', ['Garlic', 'Butter', 'Lemon'], ['PNW_AK', 'CA_BAJA'], [4,5,6], [3,4,5,6,7,8], 'Wild caught', 'Traps', 'Good choice', 'Trap fisheries can be highly selective. Confirm the harvest area and local season.'),
  sample('snapper', 'Red snapper', 'Lutjanus campechanus', 'Firm flakes with a nutty sweetness.', '#cc8181', 'fish', 2, 'Firm flakes', 'Bake', ['Lime', 'Olive oil', 'Cilantro'], ['GULF_SOUTH'], [5,6,7,8], [1,2,3,4,5,6,7,8,9,10,11,12], 'Wild caught', 'Hook and line', 'Varies by source', 'Management has improved in some fisheries, but origin and catch method still matter.'),
  sample('pollock', 'Alaska pollock', 'Gadus chalcogrammus', 'Lean, mild, and clean.', '#8c9fac', 'fish', 1, 'Fine flakes', 'Steam', ['Lemon', 'Dill', 'Cabbage'], ['PNW_AK'], [2,3,4,5,6], [1,2,3,4,5,6,7,8,9,10,11,12], 'Wild caught', 'Midwater trawl', 'Good choice', 'Prefer Alaska or U.S. sources and ask for the fishery; avoid unlabeled imported pollock.'),
  sample('mahi', 'Mahi mahi', 'Coryphaena hippurus', 'Firm, bright, and lightly sweet.', '#d7a755', 'fish', 2, 'Firm flakes', 'Grill', ['Lime', 'Chili', 'Mango'], ['CA_BAJA', 'GULF_SOUTH'], [5,6,7,8,9], [1,2,3,4,5,6,7,8,9,10,11,12], 'Wild caught', 'Troll, handline, or longline', 'Varies by source', 'Prefer U.S. troll or handline-caught mahi mahi; avoid imported longline-caught fish when origin is unclear.'),
  sample('sardine', 'Pacific sardine', 'Sardinops sagax', 'Oily, bright, and richly savory.', '#8a9da5', 'fish', 2, 'Oily & tender', 'Broil', ['Tomato', 'Olive oil', 'Parsley'], ['PNW_AK', 'CA_BAJA'], [5,6,7,8,9], [1,2,3,4,5,6,7,8,9,10,11,12], 'Wild caught', 'Purse seine', 'Good choice', 'Prefer responsibly managed U.S. or Canadian fisheries and check the current regional guide.'),
  sample('herring', 'Atlantic herring', 'Clupea harengus', 'Oily, mineral, and deeply savory.', '#718c9b', 'fish', 2, 'Oily & tender', 'Smoke', ['Mustard', 'Pickle', 'Potato'], ['NE_NY'], [4,5,6,7,8], [1,2,3,4,5,6,7,8,9,10,11,12], 'Wild caught', 'Purse seine or gillnet', 'Varies by source', 'Buy from a managed local fishery with clear origin; regional stock status changes.'),
  sample('shrimp', 'White shrimp', 'Litopenaeus setiferus', 'Sweet, springy, and clean.', '#df9a82', 'prawn', 1, 'Springy & sweet', 'Sauté', ['Garlic', 'Lime', 'Butter'], ['GULF_SOUTH', 'CA_BAJA'], [4,5,6,7,8,9], [1,2,3,4,5,6,7,8,9,10,11,12], 'Mixed', 'Trawl or pond farm', 'Varies by source', 'Prefer U.S. wild shrimp or well-managed farmed shrimp with transparent country and method; avoid unlabeled imports.'),
  sample('tuna', 'Skipjack tuna', 'Katsuwonus pelamis', 'Meaty, clean, and ocean-rich.', '#547fa0', 'fish', 3, 'Firm & rich', 'Sear', ['Sesame', 'Ginger', 'Citrus'], ['CA_BAJA', 'JP_SEAS'], [5,6,7,8], [1,2,3,4,5,6,7,8,9,10,11,12], 'Wild caught', 'Pole-and-line, troll, or purse seine', 'Varies by source', 'Buy pole-and-line or FAD-free options where available; tuna ratings change sharply by gear and ocean.'),
  sample('tilapia', 'Tilapia', 'Oreochromis niloticus', 'Mild, moist, and adaptable.', '#a9a372', 'fish', 1, 'Firm flakes', 'Pan roast', ['Ginger', 'Scallion', 'Lime'], ['GULF_SOUTH', 'CA_BAJA'], [1,2,3,4,5,6,7,8,9,10,11,12], [1,2,3,4,5,6,7,8,9,10,11,12], 'Farm raised', 'Pond or recirculating farm', 'Good choice', 'Prefer transparent farms from countries listed by Seafood Watch; farming systems matter more than species alone.'),
  sample('mussel', 'Blue mussel', 'Mytilus edulis', 'Briny, sweet, and ocean-clean.', '#405f67', 'shell', 1, 'Tender & briny', 'Steam', ['Garlic', 'White wine', 'Parsley'], ['NE_NY', 'PNW_AK'], [10,11,12,1,2,3], [1,2,3,4,5,6,7,8,9,10,11,12], 'Farm raised', 'Rope or bottom culture', 'Good choice', 'Farmed mussels are generally a strong choice; confirm local farm practices and harvest area.'),
];
export function seasonFor(rule: SeasonRule | undefined, month: number): Season {
  if (!rule) return 'unknown';
  return rule.peak.includes(month) ? 'peak' : rule.available.includes(month) ? 'available' : 'outside';
}
export function seafoodWatchGuidance(fish: Fish): 'Best Choice' | 'Good Alternative' | 'Check current rating' {
  if (fish.sustainability === 'Good choice') return 'Best Choice';
  if (fish.sustainability === 'Ask your fishmonger') return 'Good Alternative';
  return 'Check current rating';
}
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function selectFish(fish: Fish[], region: RegionId, month: number, query: string, filter: Filter, kind: string, sort: Sort, savedOnly: boolean, saved: string[]) {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  const rank = { peak: 0, available: 1, outside: 2, unknown: 3 };
  return fish.filter(f => {
    const season = seasonFor(f.regions[region], month);
    const haystack = normalize([f.name, f.scientificName, f.tagline, f.texture, f.cook, ...f.pairings].join(' '));
    return Boolean(f.regions[region]) && (filter === 'all' || (filter === 'sustainable' ? (seafoodWatchGuidance(f) === 'Best Choice' && (season === 'peak' || season === 'available')) : filter === 'peak' ? season === 'peak' : season === 'peak' || season === 'available'))
      && (kind === 'all' || f.kind === kind) && (!savedOnly || saved.includes(f.id)) && words.every(word => haystack.includes(word));
  }).sort((a, b) => (sort === 'season' ? rank[seasonFor(a.regions[region], month)] - rank[seasonFor(b.regions[region], month)] : sort === 'richness' ? b.richness - a.richness : 0) || a.name.localeCompare(b.name));
}
function safeUrl(value?: string) {
  try { const url = new URL(value || ''); return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined; } catch { return undefined; }
}
/** Fail closed on malformed remote records, instead of crashing halfway through rendering. */
export function validateCatalogue(value: unknown): Fish[] {
  if (!Array.isArray(value)) throw new Error('Expected a catalogue array.');
  const ids = new Set<string>();
  for (const f of value) {
    if (!f || typeof f !== 'object' || ['id','name','scientificName','tagline','color','texture','cook','sourceType','harvestMethod','sustainability','sustainabilityNote'].some(k => typeof f[k] !== 'string' || !f[k].trim())
      || ids.has(f.id) || !/^#[\da-f]{6}$/i.test(f.color) || !['fish','flat','shell','prawn','angler'].includes(f.shape)
      || !['Fish','Shellfish'].includes(f.kind) || !['Wild caught','Farm raised','Mixed'].includes(f.sourceType)
      || !['Good choice','Ask your fishmonger','Varies by source'].includes(f.sustainability)
      || ![1,2,3].includes(f.richness) || !Array.isArray(f.pairings)
      || f.pairings.some((p: unknown) => typeof p !== 'string') || !f.regions || typeof f.regions !== 'object' || Array.isArray(f.regions)) throw new Error('Invalid species record.');
    ids.add(f.id);
    for (const [region, raw] of Object.entries(f.regions)) {
      const rule = raw as SeasonRule;
      if (!REGIONS.some(r => r.id === region) || !rule || ![rule.peak, rule.available].every(months => Array.isArray(months) && months.every(m => Number.isInteger(m) && m >= 1 && m <= 12))
        || [rule.source, rule.checkedAt, rule.note].some(v => v !== undefined && typeof v !== 'string')) throw new Error('Invalid regional calendar.');
    }
  }
  return value as Fish[];
}

/** Original 16 × 16 silhouettes expanded to a 32 × 32 working grid and rendered at 64 × 64. */
const SPRITE_TILES: Record<string, string[]> = {
  'sea-bass': [
    '................','................','......11........','.....1331.....11','...112222111.121','..12233322221121',
    '.126622222222221','1226122444222221','1221122222222221','.122223333222221','..1122222221111.','....112221......',
    '......111.......','................','................','................',
  ],
  scallop: [
    '................','.......11.......','.....112211.....','....12233221....','...1232332321...','..122323323221..',
    '..123233232321..','.12232332323221.','.12323323323231.','..122323323221..','...1232332321...','....12233221....',
    '.....122221.....','....11....11....','................','................',
  ],
  monkfish: [
    '........11......','.......1.51.....','......1...1.....','..1111....11....','11222211112211..','122333222222211.',
    '1266222222222221','1221144441222221','1222222222222221','.12442222244421.','..122222222221..','...1112221111...',
    '......121.......','.....11.11......','................','................',
  ],
  flounder: [
    '................','................','.......11.......','....11122111....','..112222222211..','.12223333322221.',
    '1226622222222221','1226122222222221','.12222444222221.','..122222222221..','...1222222221...','....11222211....',
    '......1111......','................','................','................',
  ],
  cod: [
    '................','................','.....111........','...112221....11.','..122333211.1221','1122222222112221',
    '1266222222222221','1226122444222221','1221122222222221','.122222333322221','..1112222221111.','.....1222221....',
    '......11.11.....','................','................','................',
  ],
  salmon: [
    '................','................','......11........','....112211...11.','..112233211.1221','.122333322112221',
    '1266222322322221','1226123223222221','.122224442222221','..12233333322221','...111222221111.','......12221.....',
    '.......11.......','................','................','................',
  ],
  halibut: [
    '................','......111.......','....1122211.....','..11222222211...','.12233333332211.','1222222222222221',
    '1266222222222221','1226122444222221','.122222222222221','..1222444422221.','...12222222221..','....112222211...',
    '......11111.....','................','................','................',
  ],
  yellowtail: [
    '................','................','......11.....55.','....112211.15551','..11223322115551','.122333322225551',
    '1266222222222551','1226122444222551','.122222222222551','..12233333322551','...111222221551.','......1222155...',
    '.......1115.....','................','................','................',
  ],
  prawn: [
    '................','...11...........','..1..111........','.1..122211......','1..122333211....','..12662222221...',
    '..122612444221..','...122222222221.','....112233322221','......1222222211','....11111112221.','...1.......121..',
    '..1......11.11..','.........1...1..','................','................',
  ],
  snapper: [
    '................','......1.1.......','....1111111.....','...122222221.11.','..12333333211221','.122222222222221',
    '1266222222222221','1226122444222221','.122222222222221','..1233333333221.','...12222222221..','....111222111...',
    '......121.......','......1.1.......','................','................',
  ],
};
const SPRITE_ACCENTS: Record<string, string> = {
  'sea-bass': '#567d78', scallop: '#f3c3b1', monkfish: '#dbc66d', flounder: '#8d7958', cod: '#789788',
  salmon: '#b85f52', halibut: '#6c806f', yellowtail: '#e6c84f', prawn: '#e67e61', snapper: '#a94f55',
};
type SpriteDetail = [number, number, 'ink' | 'light' | 'accent' | 'shine'];
const SPRITE_DETAILS: Record<string, SpriteDetail[]> = {
  'sea-bass': [[10,13,'ink'],[12,12,'light'],[14,13,'accent'],[16,12,'light'],[18,13,'accent'],[20,12,'light'],[22,14,'accent'],[11,17,'accent'],[14,18,'light'],[18,17,'accent'],[21,18,'light'],[24,16,'ink']],
  scallop: [[10,12,'light'],[12,10,'shine'],[14,9,'light'],[16,8,'shine'],[18,9,'light'],[20,10,'shine'],[22,12,'light'],[11,16,'shine'],[14,15,'light'],[16,14,'shine'],[18,15,'light'],[21,16,'shine'],[13,20,'light'],[16,19,'shine'],[19,20,'light']],
  monkfish: [[9,13,'ink'],[11,12,'shine'],[15,12,'light'],[19,13,'accent'],[22,15,'ink'],[10,17,'accent'],[13,18,'light'],[16,17,'accent'],[19,18,'light'],[22,17,'accent'],[12,21,'ink'],[18,21,'ink'],[15,5,'shine']],
  flounder: [[11,11,'ink'],[14,12,'ink'],[17,11,'accent'],[20,12,'light'],[10,15,'accent'],[13,16,'light'],[16,15,'accent'],[19,16,'light'],[22,15,'accent'],[12,19,'light'],[15,20,'accent'],[18,19,'light'],[21,20,'accent']],
  cod: [[10,12,'ink'],[12,11,'shine'],[15,12,'light'],[18,11,'accent'],[21,13,'light'],[24,12,'accent'],[11,16,'accent'],[14,17,'light'],[17,16,'accent'],[20,17,'light'],[23,16,'accent'],[14,22,'ink'],[16,23,'ink']],
  salmon: [[11,12,'ink'],[13,11,'shine'],[16,12,'accent'],[19,11,'accent'],[22,13,'light'],[12,16,'accent'],[15,15,'ink'],[18,16,'accent'],[21,15,'ink'],[24,17,'accent'],[14,20,'light'],[18,19,'accent'],[22,20,'light']],
  halibut: [[10,10,'ink'],[13,11,'ink'],[16,10,'accent'],[19,11,'light'],[22,12,'accent'],[9,15,'light'],[12,16,'accent'],[15,15,'light'],[18,16,'accent'],[21,15,'light'],[24,16,'accent'],[13,20,'accent'],[17,21,'light'],[21,20,'accent']],
  yellowtail: [[10,12,'ink'],[12,11,'shine'],[15,12,'light'],[18,11,'accent'],[21,13,'light'],[12,16,'accent'],[15,17,'light'],[18,16,'accent'],[21,17,'light'],[24,16,'accent'],[26,13,'shine'],[27,16,'light'],[26,19,'shine']],
  prawn: [[9,10,'ink'],[11,9,'shine'],[13,10,'light'],[16,11,'accent'],[18,13,'light'],[20,15,'accent'],[22,17,'light'],[24,18,'accent'],[17,19,'ink'],[14,20,'ink'],[11,21,'ink'],[8,19,'accent']],
  snapper: [[10,12,'ink'],[12,11,'shine'],[15,12,'light'],[18,11,'accent'],[21,13,'light'],[11,16,'accent'],[14,17,'light'],[17,16,'accent'],[20,17,'light'],[23,16,'accent'],[13,20,'light'],[17,21,'accent'],[21,20,'light'],[15,7,'accent'],[19,8,'accent']],
};
function Sprite({ fish }: { fish: Fish }) {
  const files: Record<string, string> = {
    'sea-bass': 'black-sea-bass', scallop: 'sea-scallop', monkfish: 'monkfish', flounder: 'summer-flounder', cod: 'atlantic-cod',
    salmon: 'chinook-salmon', halibut: 'pacific-halibut', yellowtail: 'yellowtail', prawn: 'spot-prawn', snapper: 'red-snapper', haddock: 'atlantic-cod',
    pollock: 'pollock', mahi: 'mahi-mahi', sardine: 'sardine', herring: 'herring', shrimp: 'shrimp', tuna: 'tuna', tilapia: 'tilapia', mussel: 'mussel',
  };
  return <img
    aria-hidden="true"
    className={`ws-sprite ws-sprite-${fish.id}`}
    alt=""
    src={`/sprites/${files[fish.id] || 'black-sea-bass'}.png`}
  />;
}
function Calendar({ rule, month, onMonth }: { rule?: SeasonRule; month: number; onMonth?: (month: number) => void }) {
  return <div className={`ws-calendar ${onMonth ? 'ws-calendar-interactive' : ''}`} aria-label="Monthly seasonality">
    {MONTHS.map((name, i) => {
      const status = seasonFor(rule, i + 1);
      const label = `${name}: ${LABELS[status].replace(/^[^ ]+ /, '')}${month === i + 1 ? ', selected month' : ''}`;
      const content = <><span>{name.slice(0,3)}</span><b aria-hidden="true">{status === 'peak' ? '★' : status === 'available' ? '●' : '–'}</b></>;
      return onMonth ? <button key={name} type="button" className={`ws-month ${status}`} aria-label={label} aria-pressed={month === i + 1} onClick={() => onMonth(i + 1)}>{content}</button>
        : <span key={name} className={`ws-month ${status}`} title={label} aria-label={label} data-selected={month === i + 1}>{content}</span>;
    })}
  </div>;
}

export default function WhatsSwimming({ loadCatalogue }: { loadCatalogue?: CatalogueLoader } = {}) {
  const [fish, setFish] = useState<Fish[]>(loadCatalogue ? [] : SAMPLE_FISH);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(loadCatalogue ? 'loading' : 'ready');
  const [attempt, setAttempt] = useState(0);
  const [region, setRegion] = useState<RegionId>('NE_NY');
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [locationNote, setLocationNote] = useState('New York is the starting coast');
  const [filter, setFilter] = useState<Filter>('season');
  const [kind, setKind] = useState('all');
  const [sort, setSort] = useState<Sort>('season');
  const [savedOnly, setSavedOnly] = useState(false);
  const [journal, setJournal] = useState<Journal>(BLANK_JOURNAL);
  const [storageReady, setStorageReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const active = fish.find(f => f.id === activeId);
  const currentRegion = REGIONS.find(r => r.id === region)!;
  const demo = !loadCatalogue;

  useEffect(() => {
    let alive = true;
    const controller = new AbortController();
    if (!loadCatalogue) { setFish(SAMPLE_FISH); setState('ready'); return; }
    setState('loading'); setFish([]); setActiveId(null);
    Promise.resolve().then(() => loadCatalogue(controller.signal)).then(validateCatalogue).then(rows => {
      if (alive) { setFish(rows); setState('ready'); }
    }).catch(() => { if (alive) setState('error'); });
    return () => { alive = false; controller.abort(); };
  }, [loadCatalogue, attempt]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!parsed || !Array.isArray(parsed.saved) || parsed.saved.some((id: unknown) => typeof id !== 'string') || !parsed.notes || typeof parsed.notes !== 'object' || Array.isArray(parsed.notes) || Object.values(parsed.notes).some(n => typeof n !== 'string')) throw new Error('Invalid journal');
        setJournal({ saved: parsed.saved, notes: parsed.notes });
      }
    } catch { setStorageWarning('Your saved journal could not be read. New changes will stay in this session.'); }
    setStorageReady(true);
  }, []);
  function updateJournal(next: Journal) {
    setJournal(next);
    if (storageWarning) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); }
    catch { setStorageWarning('Browser storage is unavailable. Changes will stay in this session.'); }
  }
  function toggleSaved(id: string) {
    updateJournal({ ...journal, saved: journal.saved.includes(id) ? journal.saved.filter(s => s !== id) : [...journal.saved, id] });
  }
  useEffect(() => {
    if (!activeId || !dialog.current) return;
    const element = dialog.current;
    element.showModal();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = previousOverflow; opener.current?.focus(); };
  }, [activeId]);
  const results = useMemo(() => selectFish(fish, region, month, query, filter, kind, sort, savedOnly, journal.saved), [fish, region, month, query, filter, kind, sort, savedOnly, journal.saved]);
  const regional = fish.filter(f => f.regions[region]);
  const peakCount = regional.filter(f => seasonFor(f.regions[region], month) === 'peak').length;
  function reset() { setQuery(''); setFilter('season'); setKind('all'); setSavedOnly(false); setSort('season'); }
  function openFish(f: Fish, trigger: HTMLButtonElement) { opener.current = trigger; setDraft(journal.notes[f.id] || ''); setNotice(''); setActiveId(f.id); }
  function closeFish() {
    if (active && draft !== (journal.notes[active.id] || '')) updateJournal({ ...journal, notes: { ...journal.notes, [active.id]: draft.trim() } });
    setActiveId(null);
  }
  function useMyLocation() {
    if (!navigator.geolocation) { setLocationNote('Location is not available in this browser'); return; }
    setLocationNote('Checking your coast…');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const { latitude, longitude } = coords;
      const guessed: RegionId = longitude < -125 || (longitude < -115 && latitude > 42) ? 'PNW_AK'
        : longitude < -100 ? 'CA_BAJA' : longitude < -80 && latitude < 36 ? 'GULF_SOUTH' : 'NE_NY';
      setRegion(guessed);
      setLocationNote(`Coast estimated from your shared location · ${REGIONS.find(r => r.id === guessed)?.coast}`);
    }, () => setLocationNote('Location was not shared · showing New York'), { timeout: 8000 });
  }
  return <div className="ws-app">
    <style>{STYLES}</style>
    <a href="#ws-results" className="ws-skip">Skip to fish</a>
    <div className="ws-shell">
      <header className="ws-header">
        <div className="ws-brand"><span className="ws-brand-icon" aria-hidden="true">≈</span> WHAT’S SWIMMING <span className="ws-edition">SEASONAL SEAFOOD GUIDE</span></div>
        <div className="ws-question">
          <p className="ws-eyebrow">What’s in season</p>
          <h1><span>near</span> {REGIONS.find(r => r.id === region)?.name}<br /><span>in</span> {MONTHS[month - 1]}?</h1>
          <p>{currentRegion.coast} · {locationNote}</p>
        </div>
      </header>
      <section className="ws-controls" aria-label="Explore the catalogue">
        <div className="ws-picker-heading"><span>Choose a coast</span><button type="button" className="ws-text-button" onClick={useMyLocation}>◎ Use my location</button></div>
        <div className="ws-coast-picker" role="group" aria-label="Choose a coast">{REGIONS.map(r => <button key={r.id} type="button" aria-pressed={region === r.id} onClick={() => { setRegion(r.id); setLocationNote(r.id === 'NE_NY' ? 'New York is the starting coast' : r.coast); }}><b>{r.name}</b><span>{r.coast}</span></button>)}</div>
        <div className="ws-picker-heading"><span>Choose a month</span><button type="button" className="ws-text-button" onClick={() => setMonth(new Date().getMonth()+1)}>Today · {MONTHS[new Date().getMonth()].slice(0,3)}</button></div>
        <div className="ws-month-picker" role="group" aria-label="Choose a month">{MONTHS.map((name, i) => <button key={name} type="button" aria-pressed={month === i + 1} onClick={() => setMonth(i + 1)}><span>{name.slice(0,3)}</span><b>{i + 1}</b></button>)}</div>
        <div className="ws-secondary-tools"><button type="button" className="ws-text-button" aria-expanded={searchOpen} onClick={() => setSearchOpen(!searchOpen)}>⌕ {searchOpen ? 'Hide search' : 'Search the guide'}</button><button type="button" className="ws-text-button" aria-pressed={savedOnly} onClick={() => setSavedOnly(!savedOnly)}>{savedOnly ? '♥' : '♡'} Saved ({journal.saved.length})</button></div>
        {searchOpen && <div className="ws-search-panel"><label className="ws-search">Search<input autoFocus type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Fish, texture, method, pairing…" /></label><label>Type<select aria-label="Type" value={kind} onChange={e => setKind(e.target.value)}><option value="all">All seafood</option><option>Fish</option><option>Shellfish</option></select></label><label>Guidance<select aria-label="Sustainability guidance" value={filter} onChange={e => setFilter(e.target.value as Filter)}><option value="season">In season</option><option value="peak">Peak only</option><option value="sustainable">Seafood Watch · Best Choice</option><option value="all">All listed</option></select></label></div>}
      </section>
      {storageWarning && <p className="ws-warning" role="status">{storageWarning}</p>}
      <main id="ws-results" tabIndex={-1} aria-busy={state === 'loading'}>
        <div className="ws-results-heading"><div><p className="ws-eyebrow">{currentRegion.coast}</p><h2>In season now</h2></div><p role="status" aria-live="polite">{state === 'loading' ? 'Loading the guide…' : state === 'error' ? 'Catalogue unavailable' : `${results.length} catches · ${peakCount} at peak${demo ? ' · editorial baseline' : ''}`}</p></div>
        {state === 'loading' ? <div className="ws-grid">{[1,2,3].map(n => <div className="ws-skeleton" key={n} aria-hidden="true"><div /><span /><span /></div>)}</div>
          : state === 'error' ? <div className="ws-empty" role="alert"><h3>The tide didn’t bring our data in.</h3><p>We couldn’t load the catalogue. Check your connection and try again.</p><button className="ws-button ws-primary" onClick={() => setAttempt(a => a+1)}>Try again</button></div>
          : results.length === 0 ? <div className="ws-empty"><span aria-hidden="true">≈</span><h3>{fish.length === 0 ? 'The guide is empty.' : regional.length === 0 ? 'This coast is still uncharted.' : savedOnly ? 'No saved fish match this view.' : 'No catches are listed for this view.'}</h3><p>{regional.length === 0 ? 'Choose another coast to keep exploring.' : 'Try another month, coast, or a broader search.'} {savedOnly && 'Saved fish are filtered by the selected coast, month, and search.'}</p><button className="ws-button ws-primary" onClick={reset}>Clear search & show in-season catches</button></div>
          : <div className="ws-grid">{results.map(f => <article key={f.id} className="ws-card" style={{ '--fish-color': f.color } as React.CSSProperties}>
            <div className="ws-card-top"><span className="ws-number">NO. {String(fish.indexOf(f)+1).padStart(2,'0')} / {f.kind.toUpperCase()}</span><button className="ws-save" disabled={!storageReady} aria-label={`${journal.saved.includes(f.id) ? 'Unsave' : 'Save'} ${f.name}`} aria-pressed={journal.saved.includes(f.id)} onClick={() => toggleSaved(f.id)}>{journal.saved.includes(f.id) ? '♥' : '♡'}</button></div>
            <button className="ws-open" onClick={e => openFish(f, e.currentTarget)} aria-label={`Explore ${f.name}`}><div className="ws-habitat"><Sprite fish={f} /><span className={`ws-badge ${seasonFor(f.regions[region], month)}`}>{LABELS[seasonFor(f.regions[region], month)]}</span></div><div className="ws-card-title"><h3>{f.name}</h3><p>{f.tagline}</p></div></button>
            <dl className="ws-stats"><div><dt>Source</dt><dd>{f.sourceType}</dd></div><div><dt>Method</dt><dd>{f.harvestMethod}</dd></div></dl>
            <div className="ws-card-foot"><span className={`ws-sustainability ws-${f.sustainability.toLowerCase().replace(/\s/g,'-')}`}>● Seafood Watch: {seafoodWatchGuidance(f)}</span><button type="button" className="ws-notes-link" aria-label={`Read details for ${f.name}`} onClick={e => openFish(f, e.currentTarget)}>DETAILS ↗</button></div>
          </article>)}</div>}
        <p className="ws-legend">Seasonality and sustainability depend on exact origin and harvest method. Open a catch for context.</p>
      </main>
      <footer className="ws-footer"><strong>What’s Swimming</strong><p>{demo ? 'Northeast records include public source links and review dates; other regions are editorial baselines.' : 'Ask your fishmonger about origin, catch method, and current availability.'} Sustainability labels are starting points, not certifications.</p></footer>
    </div>
    {active && <dialog ref={dialog} className="ws-dialog" aria-labelledby="ws-detail-title" onCancel={e => { e.preventDefault(); closeFish(); }}>
      <div className="ws-detail"><div className="ws-detail-toolbar"><span className="ws-eyebrow">FIELD NOTES / {currentRegion.name}</span><button autoFocus className="ws-button" onClick={closeFish} aria-label="Close fish details">Close ×</button></div>
        <div className="ws-detail-hero"><Sprite fish={active} /><div><p className="ws-eyebrow">{active.kind} · {RICHNESS[active.richness-1]}</p><h2 id="ws-detail-title">{active.name}</h2><p><i>{active.scientificName}</i></p><p>{active.tagline}</p><button disabled={!storageReady} className="ws-button" aria-pressed={journal.saved.includes(active.id)} onClick={() => toggleSaved(active.id)}>{journal.saved.includes(active.id) ? '♥ Saved to your guide' : '♡ Save to your guide'}</button></div></div>
        <section><h3>Source & sustainability</h3><dl className="ws-source-grid"><div><dt>Source</dt><dd>{active.sourceType}</dd></div><div><dt>Common method</dt><dd>{active.harvestMethod}</dd></div><div><dt>Seafood Watch guidance</dt><dd>{seafoodWatchGuidance(active)}</dd></div></dl><p>{active.sustainabilityNote}</p><p className="ws-legend">Seafood Watch ratings are specific to species, origin, and harvest method. “Best Choice” is green guidance; “Good Alternative” is yellow guidance. Check the current Seafood Watch recommendation before buying.</p><a href="https://www.seafoodwatch.org/recommendations" target="_blank" rel="noreferrer">Check Monterey Bay Aquarium Seafood Watch ↗</a></section>
        <section><h3>{LABELS[seasonFor(active.regions[region], month)]} in {MONTHS[month-1]}</h3><p>Choose a month to explore this coast’s calendar.</p><Calendar rule={active.regions[region]} month={month} onMonth={setMonth} /><p className="ws-legend">★ Peak · ● In season · – Outside recorded season</p><p>{active.regions[region]?.note}</p>{demo ? <p className="ws-data-note">Editorial baseline only. Verify local availability and regulations before treating this as current fishery guidance.</p> : <p>{safeUrl(active.regions[region]?.source) ? <a href={safeUrl(active.regions[region]?.source)} target="_blank" rel="noreferrer">View seasonality source ↗</a> : 'No source supplied; calendar is unverified.'} {active.regions[region]?.checkedAt ? `Last checked: ${active.regions[region]?.checkedAt}` : 'No review date supplied.'}</p>}</section>
        <section><h3>At the kitchen counter</h3><dl className="ws-stats"><div><dt>Texture</dt><dd>{active.texture}</dd></div><div><dt>Cooking direction</dt><dd>{active.cook}</dd></div></dl><p>Good companions</p><ul className="ws-pairings">{active.pairings.map((p,i) => <li key={`${p}-${i}`}>{p}</li>)}</ul><p className="ws-legend">Cooking directions are starting points, not complete recipes.</p></section>
        <section><form onSubmit={e => { e.preventDefault(); updateJournal({ ...journal, notes: { ...journal.notes, [active.id]: draft.trim() } }); setNotice('Note kept. Closing also saves your edits.'); }}><label htmlFor="ws-note">Your kitchen note</label><p id="ws-note-help">Private to this browser. Edits are also saved when you close this view.</p><textarea id="ws-note" aria-describedby="ws-note-help" maxLength={1000} rows={3} value={draft} onChange={e => { setDraft(e.target.value); setNotice(''); }} placeholder="What worked? What would you try next time?" /><div className="ws-note-actions"><button disabled={!storageReady} className="ws-button ws-primary" type="submit">Save note</button><span>{draft.length}/1000</span></div><p role="status">{notice}</p>{storageWarning && <p role="status" className="ws-warning">{storageWarning}</p>}</form></section>
      </div>
    </dialog>}
  </div>;
}

const STYLES = `
.ws-app{--ink:#243f3b;--muted:#52645c;--paper:#fbf8eb;--line:#b8c4ae;--green:#2d604f;color:var(--ink);background:var(--paper);font:15px/1.55 ui-rounded,'Trebuchet MS',system-ui,sans-serif;min-height:100vh;padding:0 20px;color-scheme:light}
.ws-app *{box-sizing:border-box}.ws-app button,.ws-app input,.ws-app select,.ws-app textarea{font:inherit;color:inherit}.ws-app button{cursor:pointer}.ws-app button:disabled{cursor:wait;opacity:.5}.ws-app button,.ws-app select,.ws-app input,.ws-app textarea{min-height:44px}.ws-app :focus-visible{outline:3px solid #8c481e;outline-offset:4px}.ws-app button:active{transform:translateY(2px)}.ws-app h1,.ws-app h2,.ws-app h3,.ws-app p{margin:0}.ws-app h2{font-size:27px;line-height:1.2}.ws-app h3{font-size:20px;line-height:1.3}.ws-app a{color:#295e4b}.ws-shell{max-width:1120px;margin:auto}.ws-header{padding:28px 0 22px}.ws-brand{font:700 14px/1.4 ui-monospace,monospace;letter-spacing:1px;display:flex;align-items:center;gap:12px}.ws-brand-icon{background:#2d604f;color:#fff4c9;box-shadow:3px 3px 0 #b7c8ab;font-size:27px;line-height:36px;width:40px;text-align:center}.ws-edition{margin-left:auto;font-size:11px;color:var(--muted)}.ws-intro{display:flex;justify-content:space-between;align-items:center;gap:30px;padding:40px 0 28px}.ws-eyebrow{font:700 11px/1.5 ui-monospace,monospace;text-transform:uppercase;letter-spacing:1px;color:var(--muted)}.ws-app h1{font-size:clamp(38px,5vw,60px);line-height:1.02;letter-spacing:-2px;margin:12px 0 18px}.ws-app h1 em{font-style:normal;color:var(--green)}.ws-intro p:not(.ws-eyebrow){color:var(--muted)}.ws-postcard{width:265px;flex-shrink:0;background:#dbe7d1;border:2px solid var(--ink);box-shadow:5px 5px 0 #b7c8ab;transform:rotate(3deg);padding:12px 22px 18px;text-align:center}.ws-postcard span{font:10px ui-monospace,monospace;letter-spacing:1px}.ws-data-note{padding:11px 14px;background:#eeeeda;border-left:4px solid #71836a;font-size:12px;color:#415647}.ws-controls{background:#f0f0df;border:2px solid var(--ink);box-shadow:4px 4px 0 #c9d0b9;padding:18px;display:grid;gap:16px}.ws-app label{display:block;font-weight:700;font-size:12px}.ws-app input,.ws-app select,.ws-app textarea{display:block;background:#fffdf5;border:1px solid #7b8c78;border-radius:4px;padding:10px 12px;width:100%;margin-top:5px}.ws-app input,.ws-app select,.ws-app textarea{font-size:16px}.ws-location,.ws-search-row{display:flex;align-items:end;gap:12px}.ws-location label:first-child{flex:1}.ws-location label:nth-child(2){width:180px}.ws-button{border:1px solid #637967;background:#fffdf5;border-radius:4px;padding:9px 14px;box-shadow:0 2px 0 #adb99e;font-weight:700!important;line-height:1.3}.ws-button:hover{background:#e3ecd8}.ws-primary,.ws-button[aria-pressed=true]{background:var(--green);color:#fffdf1!important}.ws-primary:hover{background:#214c3d}.ws-search{flex:1}.ws-filter-row{display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap}.ws-segment{display:flex;gap:4px;flex-wrap:wrap}.ws-segment button{background:transparent;border:1px solid transparent;border-radius:4px;padding:8px 12px;font-weight:bold;font-size:13px}.ws-segment button[aria-pressed=true]{background:#fffdf5;border-color:#637967;box-shadow:0 2px 0 #adb99e}.ws-segment button:hover{background:#e0e8d3}.ws-results-heading{display:flex;align-items:end;justify-content:space-between;gap:20px;margin:32px 0 20px}.ws-results-heading h2{margin-top:5px}.ws-results-heading>p{font-size:12px;color:var(--muted)}.ws-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:22px}.ws-card{background:#fffdf4;border:2px solid #55705e;box-shadow:3px 4px 0 #d0d4bc;position:relative;border-radius:3px 3px 12px 3px;overflow:hidden;min-width:0}.ws-card-top{display:flex;justify-content:space-between;align-items:center;padding:0 10px 0 16px;border-bottom:1px dashed #a9b8a2}.ws-number{font:10px ui-monospace,monospace;letter-spacing:1px;color:var(--muted)}.ws-save{border:0;background:transparent;font-size:25px!important;min-width:44px}.ws-save[aria-pressed=true]{color:#9b413d}.ws-open{display:block;width:100%;border:0;background:transparent;text-align:left;padding:0}.ws-open:hover .ws-sprite{transform:translateY(-4px)}.ws-open:focus-visible{outline-offset:-5px}.ws-habitat{position:relative;height:150px;display:flex;justify-content:center;align-items:center;background-color:#e7eddc;background-image:linear-gradient(0deg,transparent 94%,#c7d6be 94%),linear-gradient(90deg,transparent 94%,#c7d6be 94%);background-size:18px 18px;border-bottom:1px solid #b8c4ae}.ws-sprite{width:190px;height:120px;image-rendering:pixelated;transition:transform .18s ease}.ws-postcard .ws-sprite{width:100%;height:auto}.ws-badge{position:absolute;bottom:9px;left:12px;font:bold 11px ui-monospace,monospace;padding:5px 8px;border:1px solid #73856c;background:#fcf8e9}.ws-badge.peak{background:#f4df92;border-color:#987438;color:#58421b}.ws-badge.available{background:#d5e7c8}.ws-badge.outside{background:#ecebdf}.ws-card-title{padding:17px 16px 0}.ws-card-title h3{font-size:22px}.ws-card-title p{font-size:12px;color:var(--muted);margin-top:4px}.ws-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:16px}.ws-stats dt{font:10px ui-monospace,monospace;text-transform:uppercase;color:var(--muted);margin-bottom:4px}.ws-stats dd{font-size:13px;margin:0;font-weight:700}.ws-calendar{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:3px;margin:16px 12px}.ws-month{min-width:0;display:flex;flex-direction:column;align-items:center;justify-content:center;font:9px/1.5 ui-monospace,monospace;border:1px solid #b9c6b2;background:#f0f0e5;padding:4px 0;color:#4d6055}.ws-month span{text-transform:uppercase;font-size:8px}.ws-month.peak{background:#f5e1a0;color:#57431b;border-color:#b49954}.ws-month.available{background:#d8e9ce;color:#28533f}.ws-month[data-selected=true],.ws-month[aria-pressed=true]{outline:2px solid var(--ink);outline-offset:1px}.ws-card-foot{display:flex;align-items:center;justify-content:space-between;gap:8px;font:9px/1.6 ui-monospace,monospace;background:#f0f0e3;padding:10px 14px;border-top:1px dashed #a9b8a2;color:var(--muted)}.ws-notes-link{background:transparent;border:0;font:inherit!important;padding:0 4px;text-decoration:underline;text-underline-offset:3px}.ws-legend{font-size:12px;color:var(--muted);margin-top:18px!important}.ws-footer{border-top:2px solid #b8c4ae;margin-top:35px;padding:24px 0 35px}.ws-footer p{font-size:12px;color:var(--muted);margin-top:5px}.ws-empty{text-align:center;padding:44px 20px;border:2px dashed #899c83;background:#f0f0df}.ws-empty>span{font-size:40px}.ws-empty p{margin:12px auto 20px;max-width:520px}.ws-warning{padding:12px;background:#fff0cd;color:#69451c;margin:16px 0!important}.ws-skeleton{height:350px;border:2px solid #adb99e;padding:20px;background:#f0f0df}.ws-skeleton div{height:150px;background:#d9dfcc}.ws-skeleton span{display:block;height:20px;background:#d9dfcc;margin-top:22px;width:75%}.ws-skip{position:fixed;left:20px;top:-100px;background:white;padding:12px;z-index:10}.ws-skip:focus{top:10px}.ws-dialog{border:2px solid #294d40;background:var(--paper);color:var(--ink);padding:0;width:min(720px,calc(100% - 24px));max-height:90vh;max-height:90dvh;box-shadow:6px 6px 0 #1e3d3940;border-radius:5px;overscroll-behavior:contain}.ws-dialog::backdrop{background:#163a38a6}.ws-detail{padding:24px}.ws-detail-toolbar{display:flex;align-items:center;justify-content:space-between;gap:16px}.ws-detail-hero{display:flex;align-items:center;gap:24px;padding:24px 0}.ws-detail-hero .ws-sprite{width:210px;flex-shrink:0;height:150px;background:#e2ead5}.ws-detail-hero h2{font-size:32px;margin:6px 0}.ws-detail-hero p{font-size:13px;margin-bottom:8px}.ws-detail section{padding:22px 0 0;margin-top:18px;border-top:1px dashed #96a68c}.ws-detail section h3{margin-bottom:10px}.ws-detail section p{font-size:13px}.ws-detail .ws-stats{margin:18px 0}.ws-calendar-interactive{grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:18px 0}.ws-calendar-interactive .ws-month{min-height:48px}.ws-calendar-interactive .ws-month span{font-size:11px}.ws-pairings{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none;margin:10px 0}.ws-pairings li{background:#e2ead5;border:1px solid #afbea2;padding:5px 10px;font-size:13px}.ws-note-actions{display:flex;justify-content:space-between;align-items:center;gap:12px;margin:12px 0;font-size:12px}.ws-app textarea{resize:vertical}.ws-detail a{text-decoration:underline;overflow-wrap:anywhere}
.ws-header{padding:26px 0 12px}.ws-question{padding:58px 0 30px;max-width:800px}.ws-question h1{font-size:clamp(36px,5.5vw,66px);letter-spacing:-2.5px;line-height:1.08;margin:10px 0 14px}.ws-question h1 span{font-weight:400;color:#6b786f}.ws-question>p:last-child{color:var(--muted);font-size:13px}.ws-controls{background:transparent;border:0;border-top:1px solid var(--line);border-bottom:1px solid var(--line);box-shadow:none;padding:24px 0;gap:11px}.ws-picker-heading{display:flex;justify-content:space-between;align-items:center;margin-top:9px;font:700 11px ui-monospace,monospace;text-transform:uppercase;letter-spacing:1px;color:var(--muted)}.ws-text-button{border:0;background:transparent;padding:6px 2px;min-height:36px!important;color:var(--green)!important;text-decoration:underline;text-underline-offset:4px;font-size:12px!important}.ws-coast-picker{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}.ws-coast-picker button{border:1px solid #a6b09e;background:transparent;padding:10px 11px;text-align:left;min-height:68px;border-radius:2px}.ws-coast-picker button:hover,.ws-coast-picker button[aria-pressed=true]{background:#e3e9d9;border-color:var(--ink)}.ws-coast-picker button[aria-pressed=true]{box-shadow:inset 0 -3px 0 var(--green)}.ws-coast-picker b,.ws-coast-picker span{display:block}.ws-coast-picker b{font-size:12px;line-height:1.25}.ws-coast-picker span{font-size:10px;color:var(--muted);margin-top:4px}.ws-month-picker{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:4px}.ws-month-picker button{border:1px solid #b4beaa;background:transparent;min-height:52px;border-radius:2px;padding:5px 0}.ws-month-picker button span,.ws-month-picker button b{display:block}.ws-month-picker button span{font:9px ui-monospace,monospace;text-transform:uppercase;color:var(--muted)}.ws-month-picker button b{font-size:15px}.ws-month-picker button:hover,.ws-month-picker button[aria-pressed=true]{background:var(--green);color:#fffdf1;border-color:var(--green)}.ws-month-picker button[aria-pressed=true] span{color:#dce8dc}.ws-secondary-tools{display:flex;justify-content:flex-end;gap:20px;border-top:1px dashed #bcc5b5;margin-top:8px;padding-top:10px}.ws-search-panel{display:flex;align-items:end;gap:12px;max-width:720px;margin-left:auto;width:100%}.ws-search-panel .ws-search{flex:1}.ws-search-panel label:last-child{width:160px}.ws-results-heading{margin-top:38px}.ws-grid{gap:16px}.ws-card{border:1px solid #8c9c8a;box-shadow:none;border-radius:2px;background:#fffdf7}.ws-card:hover{border-color:var(--ink)}.ws-card-top{border-bottom:0;padding-top:5px}.ws-habitat{height:180px;background:#edf0e6;border-top:1px solid #d2d9ca;border-bottom:1px solid #d2d9ca;background-image:none}.ws-sprite{display:block;width:160px;height:160px;object-fit:contain;image-rendering:pixelated}.ws-sprite-monkfish{clip-path:inset(0 22% 0 0)}.ws-card-title{padding-top:14px}.ws-card-title h3{font-size:21px}.ws-stats{border-top:1px solid #d8ddcf;padding-top:12px}.ws-stats dd{font-size:12px}.ws-card-foot{background:transparent;border-top:1px solid #d8ddcf;padding:10px 14px}.ws-sustainability{font-weight:700}.ws-good-choice{color:#2d684d}.ws-ask-your-fishmonger{color:#8a571e}.ws-varies-by-source{color:#5e6170}.ws-source-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:16px 0}.ws-source-grid div{border:1px solid #b8c4ae;padding:12px}.ws-source-grid dt{font:10px ui-monospace,monospace;text-transform:uppercase;color:var(--muted)}.ws-source-grid dd{margin:5px 0 0;font-weight:700}.ws-detail-hero .ws-sprite{width:240px;height:240px;background-color:#edf0e6}.ws-data-note{margin-top:12px!important}.ws-badge{font-size:10px}.ws-legend{max-width:700px}
@media(min-width:1000px){.ws-card-title{min-height:78px}}
@media(max-width:960px){.ws-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.ws-coast-picker{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:600px){.ws-app{padding:0 14px}.ws-header{padding-top:20px}.ws-edition{display:none}.ws-question{padding:36px 0 22px}.ws-question h1{font-size:35px;letter-spacing:-1.5px}.ws-controls{padding:18px 0}.ws-coast-picker{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px}.ws-coast-picker button{min-width:155px;scroll-snap-align:start}.ws-month-picker{display:flex;overflow-x:auto;padding:2px 1px 7px;scroll-snap-type:x mandatory}.ws-month-picker button{min-width:50px;scroll-snap-align:start}.ws-picker-heading{margin-top:6px}.ws-secondary-tools{justify-content:space-between}.ws-search-panel{display:block}.ws-search-panel label:last-child{width:auto;margin-top:10px}.ws-grid{grid-template-columns:minmax(0,1fr)}.ws-results-heading{display:block}.ws-results-heading>p{margin-top:10px}.ws-habitat{height:154px}.ws-detail{padding:16px}.ws-detail-hero{flex-direction:column;align-items:start;gap:16px}.ws-detail-hero .ws-sprite{width:192px;height:192px}.ws-detail-toolbar .ws-eyebrow{font-size:10px}.ws-card-title h3{font-size:24px}.ws-card-foot{font-size:10px}.ws-dialog{max-height:94dvh}.ws-source-grid{grid-template-columns:1fr}.ws-filter-row{gap:10px}}
@media(prefers-reduced-motion:reduce){.ws-app *{transition:none!important;animation:none!important}.ws-open:hover .ws-sprite{transform:none}}
`;
