// Records a fingerprint of every puzzle from EPOCH to two years ahead in test/golden.json, so a change to the bank,
// the errata or the generator can't quietly change a day that has been played.
//   node tools/golden.mjs           re-record only days after tomorrow (UTC); fails if an earlier day would change
//   node tools/golden.mjs --all     re-record every day. Only before launch, or with the owner's say-so.
import fs from 'node:fs';
import { EPOCH, addDays, todayKey } from '../site/js/daily.js';
import { fingerprint } from '../test/fingerprint.mjs';

const FILE = new URL('../test/golden.json', import.meta.url);
const DAYS = 731;
const all = process.argv.includes('--all');
const old = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')).days : {};
const frozenUntil = addDays(todayKey(), 1);
const days = {};
const changed = [];
for (let i = 0, d = EPOCH; i < DAYS; i++, d = addDays(d, 1)) {
  const f = fingerprint(d);
  if (!all && d <= frozenUntil && old[d] && old[d] !== f) changed.push(d);
  days[d] = f;
}
if (changed.length) {
  console.error(`These days are already live (or tomorrow's) and would change: ${changed.join(', ')}.`);
  console.error('Undo the change, or move it to an erratum / `added` day after tomorrow (docs/bank.md).');
  process.exit(1);
}
fs.writeFileSync(FILE, JSON.stringify({ note: 'Fingerprints of every puzzle: see tools/golden.mjs. Never re-record a past day.', days }, null, 0).replace(/,"/g, ',\n"') + '\n');
console.log(`Recorded ${DAYS} days from ${EPOCH}.`);
