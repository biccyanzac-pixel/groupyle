// The bank's format rules (docs/bank.md), shared by test/daily.test.mjs and tools/review-bank.mjs.
import { ruleFits } from '../site/js/daily.js';

export const FAMILIES = new Set(`
animals birds fish insects pets farm sea dogs
food fruit vegetables baking cheese drinks cocktails sweets kitchen cooking
music instruments bands dance theatre film tv books art fashion clothing shoes hats
sport football cricket tennis golf boxing games cards chess toys puzzles
body medicine science chemistry physics maths computing internet money business law
space weather nature plants trees flowers gems metals rocks colours shapes
geography countries cities capitals rivers islands mountains europe usa uk
mythology religion royalty history military ships cars transport aviation trains
house furniture tools jobs school language letters numbers time calendar
emotions people names famous-people crime spies magic halloween christmas
words wordplay homophones hidden anagrams compounds
`.trim().split(/\s+/));

const WORD = /^[A-Z]{3,10}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Every format problem in the bank, as readable strings. Empty when it's fine. */
export function checkBank(categories, errata = []) {
  const errors = [];
  const ids = new Set();
  for (const c of categories) {
    const at = `category ${c.id ?? '(no id)'}`;
    if (typeof c.id !== 'string' || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(c.id)) errors.push(`${at}: id must be lowercase-kebab`);
    if (ids.has(c.id)) errors.push(`${at}: duplicate id`);
    ids.add(c.id);
    if (typeof c.name !== 'string' || !c.name.trim() || c.name.length > 32) errors.push(`${at}: name must be 1-32 characters`);
    if (![1, 2, 3, 4].includes(c.tier)) errors.push(`${at}: tier must be 1-4`);
    if (!Array.isArray(c.family) || c.family.length < 1 || c.family.length > 2) errors.push(`${at}: 1-2 families`);
    for (const f of c.family ?? []) if (!FAMILIES.has(f)) errors.push(`${at}: unknown family "${f}"`);
    if (!Array.isArray(c.words) || c.words.length < 6 || c.words.length > 10) errors.push(`${at}: needs 6-10 words, has ${c.words?.length}`);
    const also = c.also ?? [];
    if (!Array.isArray(also)) errors.push(`${at}: also must be a list`);
    for (const w of [...(c.words ?? []), ...also]) if (!WORD.test(w)) errors.push(`${at}: bad word "${w}" (A-Z, 3-10 letters)`);
    if (new Set(c.words).size !== c.words?.length) errors.push(`${at}: repeated word`);
    if (new Set(also).size !== also.length) errors.push(`${at}: repeated also word`);
    for (const w of also) if (c.words?.includes(w)) errors.push(`${at}: "${w}" is in both words and also`);
    if (typeof c.added !== 'string' || !DAY.test(c.added)) errors.push(`${at}: added must be YYYY-MM-DD`);
    if (c.rule) {
      const keys = Object.keys(c.rule);
      if (!keys.length || keys.some((k) => !['hidden', 'starts', 'ends'].includes(k))) errors.push(`${at}: rule may only have hidden/starts/ends`);
      for (const s of Object.values(c.rule).flat()) if (!/^[A-Z]{2,10}$/.test(s)) errors.push(`${at}: bad rule string "${s}"`);
      for (const w of c.words ?? []) if (!ruleFits(c.rule, w)) errors.push(`${at}: "${w}" doesn't match its own rule`);
    }
  }
  for (const e of errata) {
    if (!ids.has(e.id)) errors.push(`erratum for unknown category ${e.id}`);
    if (typeof e.from !== 'string' || !DAY.test(e.from)) errors.push(`erratum ${e.id}: from must be YYYY-MM-DD`);
  }
  return errors;
}
