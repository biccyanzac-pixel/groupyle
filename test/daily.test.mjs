// Schedule, bank and rules tests: node --test test/daily.test.mjs (npm test)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CATEGORIES, ERRATA } from '../site/js/bank/index.js';
import { EPOCH, GROUP_SIZE, MAX_MISTAKES, PLAN, addDays, bankAt, dayNumber, fits, guessKey, hasPuzzle, judge, planFor, puzzle, rankKey, roomScore } from '../site/js/daily.js';
import { checkBank } from '../tools/bank-check.mjs';
import { fingerprint } from './fingerprint.mjs';

const YEARS = 2;
const DAYS = [];
for (let i = 0, d = EPOCH; i < 365 * YEARS; i++, d = addDays(d, 1)) DAYS.push(d);

test('the bank follows docs/bank.md', () => {
  assert.deepEqual(checkBank(CATEGORIES, ERRATA), []);
  assert.ok(CATEGORIES.length >= 250, `a few hundred categories (has ${CATEGORIES.length})`);
});

test('numbering starts at 1 on EPOCH', () => {
  assert.equal(dayNumber(EPOCH), 1);
  assert.equal(hasPuzzle(addDays(EPOCH, -1)), false);
});

test('every day for two years is a fair puzzle', () => {
  for (const d of DAYS) {
    const p = puzzle(d), plan = planFor(d), bank = bankAt(d);
    assert.equal(p.groups.length, plan.tiers.length, d);
    assert.deepEqual(p.groups.map((g) => g.tier), [...plan.tiers].sort((a, b) => a - b), `${d}: tiers follow the weekday plan`);
    assert.equal(new Set(p.groups.map((g) => g.id)).size, p.groups.length, `${d}: different categories`);
    assert.equal(p.board.length, p.groups.length * GROUP_SIZE, d);
    assert.equal(new Set(p.board).size, p.board.length, `${d}: no repeated word`);
    for (const g of p.groups) {
      assert.equal(g.words.length, GROUP_SIZE, d);
      for (const w of g.words) {
        assert.ok(bank.get(g.id).words.includes(w), `${d}: ${w} is a member of ${g.id}`);
        for (const o of p.groups) if (o !== g) assert.ok(!fits(bank.get(o.id), w), `${d}: ${w} (${g.name}) also fits ${o.name}`);
      }
    }
  }
});

test('red herrings follow the weekday curve', () => {
  const misses = [];
  for (const d of DAYS) {
    const [lo, hi] = planFor(d).herrings, h = puzzle(d).herrings;
    assert.ok(h <= hi, `${d}: ${h} look-alike pairs, at most ${hi}`);
    if (h < lo) misses.push(d);
  }
  // A day may fall short of its minimum only if the bank couldn't make it; it must be rare.
  assert.ok(misses.length <= DAYS.length * 0.02, `${misses.length} days short of look-alikes: ${misses.slice(0, 10).join(', ')}`);
  const mondays = DAYS.filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() === 1);
  assert.ok(mondays.every((d) => puzzle(d).herrings === 0), 'Mondays have no look-alike groups');
});

test('a category never comes back within two weeks, and rarely within three', () => {
  const last = new Map();
  let worst = Infinity, where = '', near = 0;
  for (const d of DAYS) {
    for (const g of puzzle(d).groups) {
      if (last.has(g.id)) {
        const gap = dayNumber(d) - dayNumber(last.get(g.id));
        if (gap < 21) near++;
        if (gap < worst) { worst = gap; where = `${g.id} on ${last.get(g.id)} and ${d}`; }
      }
      last.set(g.id, d);
    }
  }
  assert.ok(worst >= 14, `closest repeat: ${worst} days (${where})`);
  assert.ok(near <= 10, `${near} repeats within three weeks`);
});

test('the same day always gives the same puzzle', () => {
  const a = JSON.stringify(puzzle(addDays(EPOCH, 40)));
  assert.equal(JSON.stringify(puzzle(addDays(EPOCH, 40))), a);
});

test('past and planned days match test/golden.json', () => {
  const golden = JSON.parse(fs.readFileSync(new URL('./golden.json', import.meta.url), 'utf8')).days;
  const changed = Object.entries(golden).filter(([d, f]) => fingerprint(d) !== f).map(([d]) => d);
  assert.deepEqual(changed.slice(0, 20), [], 'these days changed: if they are in the future, run node tools/golden.mjs');
});

test('judging a guess', () => {
  const p = puzzle(EPOCH);
  const [a, b] = p.groups;
  assert.deepEqual(judge(p, a.words), { group: 0, oneAway: false });
  assert.deepEqual(judge(p, [...a.words.slice(0, 3), b.words[0]]), { group: -1, oneAway: true });
  assert.deepEqual(judge(p, [...a.words.slice(0, 2), ...b.words.slice(0, 2)]), { group: -1, oneAway: false });
  assert.equal(judge(p, a.words.map((w) => w.toLowerCase())).group, 0, 'case does not matter');
  assert.equal(judge(p, a.words, [0]).error, 'already_found');
  assert.equal(judge(p, [a.words[0], a.words[0], a.words[1], a.words[2]]).error, 'bad_guess');
  assert.equal(judge(p, [...a.words.slice(0, 3), 'NOTONBOARD']).error, 'bad_guess');
  assert.equal(judge(p, a.words.slice(0, 3)).error, 'bad_guess');
  assert.equal(guessKey(['b', 'A', 'c', 'D']), guessKey(['D', 'c', 'B', 'a']));
});

test('ranking: fewest mistakes, unsolved below solved, more groups found higher', () => {
  const keys = [
    { solved: true, mistakes: 0, found: 4, groups: 4 },
    { solved: true, mistakes: 3, found: 4, groups: 4 },
    { solved: false, mistakes: MAX_MISTAKES, found: 3, groups: 4 },
    { solved: false, mistakes: MAX_MISTAKES, found: 0, groups: 4 },
  ].map(rankKey);
  assert.deepEqual(keys, [...keys].sort((a, b) => a - b));
  assert.equal(new Set(keys).size, keys.length);
  // room score: more is better, and any solve beats any fail
  assert.ok(roomScore({ solved: true, mistakes: 3, found: 4 }) > roomScore({ solved: false, mistakes: 4, found: 3 }));
  assert.ok(roomScore({ solved: true, mistakes: 0, found: 4 }) > roomScore({ solved: true, mistakes: 1, found: 4 }));
});

test('the weekday plan', () => {
  assert.equal(PLAN[0].tiers.length, 5, 'Sunday: five groups');
  for (let w = 1; w <= 6; w++) assert.equal(PLAN[w].tiers.length, 4);
  const hard = PLAN.slice(1).map((p) => p.tiers.reduce((a, b) => a + b, 0));
  assert.deepEqual(hard, [...hard].sort((a, b) => a - b), 'tiers rise from Monday to Saturday');
  const herrings = PLAN.slice(1).map((p) => p.herrings[0]);
  assert.deepEqual(herrings, [...herrings].sort((a, b) => a - b), 'look-alikes rise from Monday to Saturday');
});
