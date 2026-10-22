// localStorage, wrapped so the game works with storage blocked or empty (private mode, cleared data).
// Per day: { startedAt, guesses: [[w, w, w, w], ...], finishedAt, synced, started }
//   synced = how many guesses the leaderboard has; started = the leaderboard has the game; ms = the server's time.
// Today's real game and archive replays are kept apart ('day' vs 'late').

const KEY = 'groupyle:progress:v1';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

let mem = readAll();

function writeAll() {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* storage blocked: progress lasts for this page */ }
}

const k = (day, late) => `${late ? 'late' : 'day'}:${day}`;

export function progress(day, late = false) {
  const p = mem[k(day, late)] || {};
  return { startedAt: p.startedAt ?? null, guesses: p.guesses ?? [], finishedAt: p.finishedAt ?? null, synced: p.synced ?? 0, started: !!p.started, ms: p.ms ?? null };
}

export function save(day, late, p) {
  mem[k(day, late)] = p;
  writeAll();
}

/** Consecutive days (ending today or yesterday) finished on the day itself. */
export function streak(today, addDays) {
  let n = 0;
  let d = progress(today).finishedAt ? today : addDays(today, -1);
  while (progress(d).finishedAt) { n++; d = addDays(d, -1); }
  return n;
}
