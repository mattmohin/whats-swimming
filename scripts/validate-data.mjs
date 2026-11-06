import { readFile } from 'node:fs/promises';
const rows = JSON.parse(await readFile(new URL('../data/fish.json', import.meta.url)));
if (!Array.isArray(rows) || rows.length === 0) throw new Error('fish.json must contain records');
const ids = new Set();
for (const fish of rows) {
  if (!fish.id || ids.has(fish.id)) throw new Error(`Duplicate or missing id: ${fish.id}`);
  ids.add(fish.id);
  if (!fish.name || !fish.scientificName) throw new Error(`Missing core fields: ${fish.id}`);
  for (const [region, rule] of Object.entries(fish.regions ?? {})) {
    for (const key of ['peak', 'available']) if (!Array.isArray(rule[key]) || rule[key].some(m => !Number.isInteger(m) || m < 1 || m > 12)) throw new Error(`Invalid ${key} months for ${fish.id}/${region}`);
    if (rule.source && !/^https?:\/\//.test(rule.source)) throw new Error(`Invalid source for ${fish.id}/${region}`);
  }
}
console.log(`Validated ${rows.length} fish records.`);
