// Review the category bank: format problems, then everything a person should look at for overlaps.
//   node tools/review-bank.mjs            summary + format errors + rule catches
//   node tools/review-bank.mjs --shared   also list every word that sits in two or more categories
//   node tools/review-bank.mjs --days 60  also print the next 60 puzzles from today
import { CATEGORIES, ERRATA } from '../site/js/bank/index.js';
import { addDays, fits, bankAt, puzzle, ruleFits, todayKey } from '../site/js/daily.js';
import { checkBank } from './bank-check.mjs';

const args = process.argv.slice(2);
const errors = checkBank(CATEGORIES, ERRATA);
console.log(`${CATEGORIES.length} categories · tiers ${[1, 2, 3, 4].map((t) => `${t}: ${CATEGORIES.filter((c) => c.tier === t).length}`).join(', ')}`);
const vocab = new Set(CATEGORIES.flatMap((c) => c.words));
console.log(`${vocab.size} different words shown somewhere`);
if (errors.length) { console.log(`\n${errors.length} format problems:`); for (const e of errors) console.log('  ' + e); }

// Families: how many look-alikes each category has (no look-alikes = it can't be a red herring).
const fam = new Map();
for (const c of CATEGORIES) for (const f of c.family) fam.set(f, [...(fam.get(f) ?? []), c.id]);
console.log('\nFamilies:');
for (const [f, ids] of [...fam].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${f.padEnd(14)} ${ids.length}  ${ids.join(', ')}`);

// Rules: words from other categories that a wordplay rule catches. The generator already keeps them apart; this is
// to spot a rule that catches too much (the category would then rarely fit) or a member that hides by accident.
console.log('\nRule catches (words from other categories):');
for (const c of CATEGORIES.filter((x) => x.rule)) {
  const caught = [...vocab].filter((w) => !c.words.includes(w) && ruleFits(c.rule, w));
  console.log(`  ${c.id} (${caught.length}): ${caught.slice(0, 40).join(', ')}${caught.length > 40 ? ' …' : ''}`);
}

if (args.includes('--shared')) {
  console.log('\nWords in more than one category (shown members in CAPS, also-words in lower case):');
  const where = new Map();
  for (const c of CATEGORIES) {
    for (const w of c.words) where.set(w, [...(where.get(w) ?? []), c.id.toUpperCase()]);
    for (const w of c.also ?? []) where.set(w, [...(where.get(w) ?? []), c.id]);
  }
  for (const [w, cs] of [...where].filter(([, cs]) => cs.length > 1).sort()) console.log(`  ${w}: ${cs.join(', ')}`);
}

const di = args.indexOf('--days');
if (di >= 0) {
  const n = Number(args[di + 1]) || 30;
  for (let d = todayKey(), i = 0; i < n; i++, d = addDays(d, 1)) {
    const p = puzzle(d), bank = bankAt(d);
    console.log(`\n${d} #${p.number} (${p.groups.length} groups, ${p.herrings} look-alike pairs)`);
    for (const g of p.groups) console.log(`  [${g.colour}] t${g.tier} ${g.name.padEnd(30)} ${g.words.join(', ')}`);
    // belt and braces: no shown word fits another group
    for (const g of p.groups) for (const w of g.words) for (const o of p.groups) if (o !== g && fits(bank.get(o.id), w)) console.log(`  !! ${w} also fits ${o.name}`);
  }
}
process.exitCode = errors.length ? 1 : 0;
