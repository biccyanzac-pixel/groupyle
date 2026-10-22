/**
 * End-to-end test against a running worker (wrangler dev --local = real Miniflare + local D1, no mocks).
 *   rm -rf .wrangler && npm run db:init:local && npm run dev:local      (in another terminal)
 *   npm test                                                           (or: node test/e2e.mjs http://127.0.0.1:8871)
 */
import { EPOCH, MIN_MS, addDays, puzzle, todayKey } from '../../site/js/daily.js';

const BASE = process.argv[2] || 'http://127.0.0.1:8871';
const today = todayKey();
const p = puzzle(today);
const G = p.groups.map((g) => g.words);
const n = G.length;

let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`); if (!ok) failures++; };
async function call(path, body) {
  const res = await fetch(BASE + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  return { status: res.status, body: await res.json() };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const twoTwo = [G[0][0], G[0][1], G[1][0], G[1][1]];          // a plain mistake
const oneAway = [G[0][0], G[0][1], G[0][2], G[1][0]];         // three right

const a = (await call('/api/session', {})).body, b = (await call('/api/session', {})).body, c = (await call('/api/session', {})).body;
check('session issues id + token', !!a.playerId && !!a.token && a.playerId !== b.playerId);

let r = await call('/api/guess', { ...a, day: today, index: 0, words: twoTwo });
check('a guess before starting is refused', r.status === 409 && r.body.error === 'not_started');
r = await call('/api/start', { ...a, day: today, name: 'Ada' });
check('start returns an empty game', r.status === 200 && r.body.guesses.length === 0 && r.body.mistakes === 0 && !r.body.late, JSON.stringify(r.body));
const startedAt = r.body.startedAt;
r = await call('/api/start', { ...a, day: today, name: 'Ada' });
check('start again resumes, clock not reset', r.body.startedAt === startedAt);
r = await call('/api/start', { ...a, day: today, name: '' });
check('a name is required', r.status === 400 && r.body.error === 'bad_name');

r = await call('/api/guess', { ...a, day: today, index: 0, words: twoTwo });
check('a mistake is judged by the server', r.status === 200 && r.body.result === 'x' && r.body.mistakes === 1, JSON.stringify(r.body));
r = await call('/api/guess', { ...a, day: today, index: 0, words: [...twoTwo].reverse() });
check('a retried guess is not counted twice', r.status === 200 && r.body.mistakes === 1 && r.body.guesses.length === 1);
r = await call('/api/guess', { ...a, day: today, index: 0, words: oneAway });
check('a different guess for a used slot is refused', r.status === 409 && r.body.error === 'already');
r = await call('/api/guess', { ...a, day: today, index: 3, words: oneAway });
check('guesses must be in order', r.status === 409 && r.body.error === 'out_of_order' && r.body.state.guesses.length === 1);
r = await call('/api/guess', { ...a, day: today, index: 1, words: [twoTwo[1], twoTwo[3], twoTwo[0], twoTwo[2]] });
check('the same four again are refused, not a mistake', r.status === 400 && r.body.error === 'repeat');
r = await call('/api/guess', { ...a, day: today, index: 1, words: [G[0][0], G[0][1], G[0][2], 'NOTAWORDX'] });
check('a word not on the board is refused', r.status === 400 && r.body.error === 'bad_guess');
r = await call('/api/guess', { ...a, day: today, index: 1, words: [G[0][0], G[0][0], G[0][1], G[0][2]] });
check('a repeated word is refused', r.status === 400 && r.body.error === 'bad_guess');
r = await call('/api/guess', { ...a, day: today, index: 1, words: oneAway });
check('one away', r.status === 200 && r.body.result === 'o' && r.body.mistakes === 2, JSON.stringify(r.body));
r = await call('/api/guess', { ...a, day: today, index: 2, words: G[1].map((w) => w.toLowerCase()) });
check('a found group', r.status === 200 && r.body.result === '1' && r.body.found.join() === '1' && !r.body.finished, JSON.stringify(r.body));
r = await call('/api/guess', { ...a, day: today, index: 3, words: [G[1][0], G[0][0], G[0][1], G[0][2]] });
check('a word from a found group is refused', r.status === 400 && r.body.error === 'already_found');
await wait(MIN_MS + 300);
for (let i = 0, k = 3; i < n; i++) if (i !== 1) r = await call('/api/guess', { ...a, day: today, index: k++, words: G[i] });
check('finding every group finishes the game', r.body.finished && r.body.solved && r.body.mistakes === 2, JSON.stringify(r.body));
check('server timed it', r.body.ms >= MIN_MS, String(r.body.ms));
r = await call('/api/guess', { ...a, day: today, index: n + 2, words: twoTwo });
check('no guesses after the end', r.status === 409 && r.body.error === 'finished');

// Bo: no mistakes, but too fast at first
await call('/api/start', { ...b, day: today, name: 'Bo' });
for (let i = 0; i < n - 1; i++) await call('/api/guess', { ...b, day: today, index: i, words: G[i] });
r = await call('/api/guess', { ...b, day: today, index: n - 1, words: G[n - 1] });
check('a solve faster than a person is refused', r.status === 400 && r.body.error === 'bad_time');
await wait(MIN_MS + 200);
r = await call('/api/guess', { ...b, day: today, index: n - 1, words: G[n - 1] });
check('Bo solves with no mistakes', r.body.solved && r.body.mistakes === 0, JSON.stringify(r.body));

// Cy: finds one group, then four mistakes
await call('/api/start', { ...c, day: today, name: 'Cy' });
// mistakes that avoid group 1, which Cy finds first
const cy = [G[1], [G[0][0], G[0][1], G[2][0], G[2][1]], [G[0][2], G[0][3], G[3][0], G[3][1]], [G[2][2], G[2][3], G[3][2], G[3][3]],
  [G[0][0], G[0][2], G[3][0], G[3][2]]];
for (let i = 0; i < cy.length; i++) r = await call('/api/guess', { ...c, day: today, index: i, words: cy[i] });
check('four mistakes end the game unsolved', r.body.finished && !r.body.solved && r.body.mistakes === 4 && r.body.found.length === 1, JSON.stringify(r.body));
r = await call('/api/guess', { ...c, day: today, index: 5, words: G[0] });
check('nothing after the fourth mistake', r.status === 409 && r.body.error === 'finished');

r = await call(`/api/leaderboard?day=${today}&playerId=${a.playerId}`);
const order = r.body.top.map((x) => `${x.name}:${x.solved ? x.mistakes : `${x.found}/${x.groups}`}`).join(',');
check('board: fewest mistakes, unsolved last', order === `Bo:0,Ada:2,Cy:1/${n}`, order);
check('board never shows words', !p.board.some((w) => JSON.stringify(r.body).includes(w)));
check('you flagged', r.body.top[1].you === true);
check('day counts', r.body.players === 3 && r.body.finished === 3 && r.body.solved === 2 && r.body.perfect === 1, JSON.stringify(r.body));

r = await call('/api/start', { ...a, day: addDays(today, 1), name: 'Ada' });
check('no playing tomorrow', r.status === 400 && r.body.error === 'bad_day');
r = await call('/api/start', { ...a, day: addDays(EPOCH, -1), name: 'Ada' });
check('no day before #1', r.status === 400 && r.body.error === 'bad_day');
const yesterday = addDays(today, -1);
if (yesterday >= EPOCH) {
  r = await call('/api/start', { ...a, day: yesterday, name: 'Ada' });
  check('a past day is a late replay', r.status === 200 && r.body.late === true);
  const yp = puzzle(yesterday);
  await call('/api/guess', { ...a, day: yesterday, index: 0, words: yp.groups[0].words });
  r = await call(`/api/leaderboard?day=${yesterday}`);
  check("a replay doesn't touch the day's board", r.body.players === 0, JSON.stringify(r.body));
  r = await call(`/api/days?from=${yesterday}&to=${today}`);
  check('days summary', r.body.days[today]?.players === 3 && r.body.days[yesterday]?.latePlayers === 1, JSON.stringify(r.body));
}
r = await call('/api/guess', { playerId: a.playerId, token: 'wrong', day: today, index: 0, words: G[0] });
check('a wrong token is refused', r.status === 401 && r.body.error === 'bad_session');

console.log(failures ? `\n${failures} FAILED` : '\nAll passed.');
process.exit(failures ? 1 : 0);
