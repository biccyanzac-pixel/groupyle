// The day's puzzle, built from the date with no randomness from outside, so everyone gets the same board and a past day
// never changes. Shared by the site and the leaderboard worker (worker/src/index.js imports this file), so the board,
// the judging of a guess and the ranking can never disagree between the two.
//
// How a day is picked (docs/generator.md has the long version):
//   - The weekday sets how many groups there are, their tiers (1 obvious … 4 wordplay) and how many look-alike pairs
//     (categories sharing a family) there must be: the red herrings.
//   - Each tier's categories sit in a shuffled queue that runs for an "era" of 13 weeks. Every day has its own place in
//     each queue, so a category comes round again only after the queue has. A new era carries the queue on where it
//     stopped and slots any newly added categories in. When a day's own pick doesn't fit, a stand-in comes from half a
//     lap round the queue, and categories used in the last few weeks are skipped.
//   - No word on the board fits two groups: a word is shown in group A only if it isn't in another chosen group's
//     words, `also` list or rule (docs/bank.md).
import { CATEGORIES, ERRATA } from './bank/index.js';

export const EPOCH = '2026-10-19';  // puzzle #1: set to the launch day. Never change it once live: it renumbers and reshuffles every day.
export const MAX_MISTAKES = 4;
export const GROUP_SIZE = 4;
export const MIN_MS = 10_000;       // solving faster than this isn't a person reading 16 words
export const ERA_DAYS = 91;         // 13 weeks
const WINDOW = 1;                   // queue places reserved per slot

// By weekday (0 = Sunday). herrings = [min, max] pairs of chosen categories that share a family.
export const PLAN = [
  { tiers: [1, 2, 2, 3, 4], herrings: [2, 10] }, // Sunday special: five groups of four
  { tiers: [1, 1, 1, 2], herrings: [0, 0] },     // Monday: obvious, nothing to mix up
  { tiers: [1, 1, 2, 2], herrings: [0, 1] },
  { tiers: [1, 2, 2, 3], herrings: [1, 1] },
  { tiers: [1, 2, 3, 3], herrings: [1, 2] },
  { tiers: [2, 2, 3, 4], herrings: [2, 3] },
  { tiers: [2, 3, 4, 4], herrings: [3, 6] },     // Saturday: the most look-alikes
];
// Group colours, easiest first; Sunday's five add orange in the middle.
export const COLOURS = { 4: ['y', 'g', 'b', 'p'], 5: ['y', 'g', 'o', 'b', 'p'] };
export const EMOJI = { y: '🟨', g: '🟩', o: '🟧', b: '🟦', p: '🟪' };

// --- dates ----------------------------------------------------------------------------------------

/** UTC day key YYYY-MM-DD. */
export function todayKey(now = new Date()) {
  return now.toISOString().slice(0, 10);
}
export function dayNumber(day) {
  return Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${EPOCH}T00:00:00Z`)) / 864e5) + 1;
}
export function addDays(day, n) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
}
export function msUntilNextUtcDay(now = Date.now()) {
  return Math.ceil((now + 1) / 864e5) * 864e5 - now;
}
export function validDay(day) {
  return typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
    && !Number.isNaN(Date.parse(`${day}T00:00:00Z`))
    && new Date(`${day}T00:00:00Z`).toISOString().slice(0, 10) === day;
}
export const hasPuzzle = (day) => validDay(day) && day >= EPOCH;
const weekday = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();
export const planFor = (day) => PLAN[weekday(day)];

// --- seeded randomness ----------------------------------------------------------------------------

function hash(str) { // FNV-1a, 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function rngFor(key) { // mulberry32
  let a = hash(`groupyle:${key}`);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// --- the bank as it stood on a day ----------------------------------------------------------------

export function ruleFits(rule, w) {
  if (!rule) return false;
  return (rule.hidden ?? []).some((s) => w.includes(s))
    || (rule.starts ?? []).some((s) => w.length > s.length && w.startsWith(s))
    || (rule.ends ?? []).some((s) => w.length > s.length && w.endsWith(s));
}
/** Does word w fit category c (as a member, an `also` word or by its rule)? */
export const fits = (c, w) => c.fit.has(w) || ruleFits(c.rule, w);

const bankCache = new Map();
/** Categories live on a day, with that day's errata applied. Map id -> { ...category, show, fit }. */
export function bankAt(day) {
  const errata = ERRATA.filter((e) => e.from <= day);
  const key = errata.length ? day : `base:${CATEGORIES.filter((c) => c.added <= day).length}`;
  if (bankCache.has(key)) return bankCache.get(key);
  const byId = new Map();
  for (const c of CATEGORIES) {
    if (c.added > day) continue;
    byId.set(c.id, { ...c, show: [...c.words], also: [...(c.also ?? [])], retired: false });
  }
  for (const e of errata) {
    const c = byId.get(e.id);
    if (!c) continue;
    if (e.retire) c.retired = true;
    if (e.remove) { c.show = c.show.filter((w) => !e.remove.includes(w)); c.also.push(...e.remove); }
    if (e.also) c.also.push(...e.also);
  }
  for (const c of byId.values()) c.fit = new Set([...c.words, ...c.also]);
  bankCache.set(key, byId);
  return byId;
}

// --- queues ---------------------------------------------------------------------------------------

const eraOf = (day) => Math.floor((dayNumber(day) - 1) / ERA_DAYS);
const eraStart = (e) => addDays(EPOCH, e * ERA_DAYS);
const perEra = (t) => (ERA_DAYS / 7) * PLAN.reduce((n, p) => n + p.tiers.filter((x) => x === t).length, 0);
const liveIds = (t, day) => [...bankAt(day).values()].filter((c) => c.tier === t && !c.retired).map((c) => c.id).sort();

const queueCache = new Map();
/** Tier t's queue of category ids for era e. */
function queue(t, e) {
  const key = `${t}:${e}`;
  if (queueCache.has(key)) return queueCache.get(key);
  let q;
  if (e === 0) q = shuffle(liveIds(t, eraStart(0)), rngFor(`queue:${t}:0`));
  else {
    const prev = queue(t, e - 1);
    const shift = prev.length ? (WINDOW * perEra(t)) % prev.length : 0;
    const live = new Set(liveIds(t, eraStart(e)));
    q = [...prev.slice(shift), ...prev.slice(0, shift)].filter((id) => live.has(id)); // carry on where it stopped
    const known = new Set(prev), rng = rngFor(`queue:${t}:${e}`);
    for (const id of [...live].filter((x) => !known.has(x))) q.splice(Math.floor(rng() * (q.length + 1)), 0, id);
  }
  queueCache.set(key, q);
  return q;
}
const EPOCH_WEEKDAY = new Date(`${EPOCH}T00:00:00Z`).getUTCDay();
const tierCounts = PLAN.map((p) => p.tiers.reduce((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {}));
/** How many tier-t slots the era's earlier days used: this day's window starts after theirs. */
function usedBefore(t, day) {
  const idx = dayNumber(day) - 1, from = eraOf(day) * ERA_DAYS, n = idx - from, weeks = Math.floor(n / 7);
  let count = weeks * PLAN.reduce((a, _, w) => a + (tierCounts[w][t] ?? 0), 0);
  for (let i = from + weeks * 7; i < idx; i++) count += tierCounts[(EPOCH_WEEKDAY + i) % 7][t] ?? 0;
  return count;
}

// --- choosing the day's groups --------------------------------------------------------------------

const shares = (a, b) => a.family.some((f) => b.family.includes(f));
function pairs(set) {
  let n = 0;
  for (let i = 0; i < set.length; i++) for (let j = i + 1; j < set.length; j++) if (shares(set[i], set[j])) n++;
  return n;
}
// Which of a's shown words fit b, as a bitmask over a.show (at most 10 words). Cached per bank.
const exclCache = new WeakMap();
function excl(a, b) {
  let m = exclCache.get(a);
  if (!m) exclCache.set(a, (m = new Map()));
  let bits = m.get(b);
  if (bits === undefined) {
    bits = 0;
    a.show.forEach((w, i) => { if (fits(b, w)) bits |= 1 << i; });
    m.set(b, bits);
  }
  return bits;
}
const bitCount = (n) => { let c = 0; for (; n; n &= n - 1) c++; return c; };
/** Does every chosen category keep at least four words that fit no other chosen one? */
function fairWords(set) {
  for (const a of set) {
    let gone = 0;
    for (const b of set) if (b !== a) gone |= excl(a, b);
    if (a.show.length - bitCount(gone) < GROUP_SIZE) return false;
  }
  return true;
}
/** Words that can be shown for each category: fits no other chosen group. */
function eligible(set) {
  return set.map((a) => {
    let gone = 0;
    for (const b of set) if (b !== a) gone |= excl(a, b);
    return a.show.filter((_, i) => !(gone & (1 << i)));
  });
}

const LOOKBACK = 2;     // blocks of 7 days (from EPOCH) before a day's own block whose categories it avoids
const LEVELS = 4;       // how many times the lookback is refined (see blockIds)
const blockCache = new Map();
/**
 * The categories of each day in block b (days 7b to 7b+6 after EPOCH) at a refinement level. Every day avoids what
 * came earlier in its block; at level n it also avoids the LOOKBACK blocks before, as level n-1 saw them. The puzzle
 * is the top level, so the work is bounded (a few blocks, cached) however far from EPOCH the day is.
 */
function blockIds(b, level) {
  const key = `${level}:${b}`;
  if (blockCache.has(key)) return blockCache.get(key);
  const used = new Set();
  if (level > 0) for (let k = Math.max(0, b - LOOKBACK); k < b; k++) for (const ids of blockIds(k, level - 1)) for (const id of ids) used.add(id);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const ids = chooseGroups(addDays(EPOCH, b * 7 + i), used).map((c) => c.id);
    for (const id of ids) used.add(id);
    out.push(ids);
  }
  blockCache.set(key, out);
  return out;
}

function chooseGroups(day, used) {
  const bank = bankAt(day), plan = planFor(day), e = eraOf(day);
  const [minH, maxH] = plan.herrings;
  const slots = [];
  const seen = {};
  for (const t of plan.tiers) {
    const q = queue(t, e), k = seen[t] = (seen[t] ?? -1) + 1;
    slots.push({ t, q, start: q.length ? (WINDOW * (usedBefore(t, day) + k)) % q.length : 0 });
  }
  const usable = (id) => { const c = bank.get(id); return c && !c.retired && !used.has(id) ? c : null; };
  // How far a queue place is from this slot's own place, both ways round. Half a lap is as far as it gets: a category
  // taken from there was last due, and is next due, about half a lap of the queue away.
  const away = (s, pos) => { const len = s.q.length, d = (pos - s.start + len) % len; return Math.min(d, len - d); };
  // The best stand-in for slot j: fits (ok), then furthest from its own turn, then the earlier id.
  function standIn(set, j, ok) {
    let best = null;
    const next = [...set];
    slots[j].q.forEach((id, pos) => {
      const c = usable(id);
      if (!c || set.includes(c)) return;
      next[j] = c;
      if (!ok(next)) return;
      const score = away(slots[j], pos);
      if (!best || score > best.score || (score === best.score && c.id < best.c.id)) best = { c, score };
    });
    return best;
  }

  // 1. Each slot takes the category at its own place in its queue if it keeps the day fair: every chosen group
  //    still has four words that fit no other, and the look-alike pairs stay under the day's maximum. If not,
  //    a stand-in from as far round the queue as possible, so it isn't anyone else's turn soon.
  const chosen = [];
  const fair = (set) => pairs(set) <= maxH && fairWords(set);
  slots.forEach((s, j) => {
    const own = s.q.length ? usable(s.q[s.start]) : null;
    let pick = own && !chosen.includes(own) && fair([...chosen, own]) ? own : null;
    if (!pick) pick = standIn([...chosen, null], j, (set) => fair(set.slice(0, j + 1)))?.c;
    if (!pick) throw new Error(`Groupyle: no category fits ${day} (tier ${s.t}).`);
    chosen.push(pick);
  });

  // 2. Red herrings: while there are too few look-alike pairs, swap one slot for a stand-in that adds pairs.
  for (let round = 0; round < 8 && pairs(chosen) < minH; round++) {
    const now = pairs(chosen);
    let best = null;
    for (let j = slots.length - 1; j >= 0; j--) {
      const found = standIn(chosen, j, (set) => pairs(set) > now && fair(set));
      if (!found) continue;
      const { c } = found;
      const score = [Math.min(pairs(chosen.map((x, k) => (k === j ? c : x))), minH), found.score];
      if (!best || score[0] > best.score[0] || (score[0] === best.score[0] && score[1] > best.score[1])) best = { j, c, score };
    }
    if (!best) break;
    chosen[best.j] = best.c;
  }

  // 3. Still short (single swaps can get stuck): swap two slots at once, the first for a look-alike of another group.
  if (pairs(chosen) < minH) {
    let best = null;
    for (let j1 = 0; j1 < slots.length; j1++) {
      for (const id of slots[j1].q) {
        const c1 = usable(id);
        if (!c1 || chosen.includes(c1) || !chosen.some((x, k) => k !== j1 && shares(x, c1))) continue;
        const mid = chosen.map((x, k) => (k === j1 ? c1 : x));
        if (!fair(mid)) continue;
        const now = pairs(mid);
        for (let j2 = 0; j2 < slots.length; j2++) {
          if (j2 === j1) continue;
          const found = standIn(mid, j2, (set) => pairs(set) > now && fair(set));
          if (!found) continue;
          const p = Math.min(pairs(mid.map((x, k) => (k === j2 ? found.c : x))), minH);
          const score = p * 10000 + found.score + away(slots[j1], slots[j1].q.indexOf(c1.id));
          if (!best || score > best.score) best = { score, j1, c1, j2, c2: found.c };
        }
      }
    }
    if (best && Math.floor(best.score / 10000) > pairs(chosen)) { chosen[best.j1] = best.c1; chosen[best.j2] = best.c2; }
  }
  return chosen;
}

const puzzleCache = new Map();
/**
 * The day's puzzle: { day, number, groups: [{ id, name, tier, colour, words }], board, herrings }.
 * Groups are easiest first; board is the shuffled list of every word.
 */
export function puzzle(day) {
  if (puzzleCache.has(day)) return puzzleCache.get(day);
  if (!hasPuzzle(day)) throw new Error(`No Groupyle for ${day}.`);
  const idx = dayNumber(day) - 1, ids = blockIds(Math.floor(idx / 7), LEVELS)[idx % 7], bank = bankAt(day);
  const chosen = ids.map((id) => bank.get(id));
  const rng = rngFor(`words:${day}`);
  const pools = eligible(chosen);
  const groups = chosen.map((c, i) => ({ id: c.id, name: c.name, tier: c.tier, family: c.family, words: shuffle(pools[i], rng).slice(0, GROUP_SIZE) }))
    .map((g, i) => ({ ...g, slot: i }))
    .sort((a, b) => a.tier - b.tier || a.slot - b.slot)
    .map(({ slot, ...g }, i, all) => ({ ...g, colour: COLOURS[all.length][i] }));
  const board = shuffle(groups.flatMap((g) => g.words), rng);
  const p = { day, number: dayNumber(day), groups, board, herrings: pairs(chosen) };
  puzzleCache.set(day, p);
  return p;
}

// --- judging --------------------------------------------------------------------------------------

/**
 * Judge a guess of four words against a puzzle. found = indexes of groups already found.
 * Returns { error } for an invalid guess, else { group: index or -1, oneAway }.
 */
export function judge(p, words, found = []) {
  if (!Array.isArray(words) || words.length !== GROUP_SIZE) return { error: 'bad_guess' };
  const ws = words.map((w) => String(w).toUpperCase());
  if (new Set(ws).size !== GROUP_SIZE || !ws.every((w) => p.board.includes(w))) return { error: 'bad_guess' };
  const groupOf = (w) => p.groups.findIndex((g) => g.words.includes(w));
  if (ws.some((w) => found.includes(groupOf(w)))) return { error: 'already_found' };
  const counts = {};
  for (const w of ws) counts[groupOf(w)] = (counts[groupOf(w)] ?? 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  if (top[1] === GROUP_SIZE) return { group: Number(top[0]), oneAway: false };
  return { group: -1, oneAway: top[1] === GROUP_SIZE - 1 };
}
/** The same four words in any order, for spotting a repeated guess. */
export const guessKey = (words) => words.map((w) => String(w).toUpperCase()).sort().join(',');

/**
 * Leaderboard order, smaller is better: solved games by mistakes (0-3); then unsolved ones, more groups found first.
 * Ties go to the faster time, then whoever finished first.
 */
export function rankKey({ solved, mistakes, found, groups }) {
  return solved ? mistakes : MAX_MISTAKES + (groups - found);
}
/** Room score (more is better): groups found, plus the mistakes you had left if you solved it. */
export function roomScore({ solved, mistakes, found }) {
  return found + (solved ? MAX_MISTAKES - mistakes : 0);
}
