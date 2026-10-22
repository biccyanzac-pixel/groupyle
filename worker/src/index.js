/**
 * Groupyle leaderboard: Cloudflare Worker + D1 (the shared `words-leaderboard` database, tables `groupyle_*`).
 * Same shape as Lettrle's and Factle's workers.
 *
 * No result is client-reported. The browser sends the four words of each guess, one guess at a time. This worker
 *   - rebuilds the day's puzzle from the date with the same code the site uses (site/js/daily.js + site/js/bank/),
 *   - judges each guess itself, counts mistakes, refuses repeats and words that aren't on the board,
 *   - times the game from its own clock: /api/start to the guess that ends it,
 *   - decides "late" (archive replay) from its own clock at the start, and keeps one game per player per day.
 * What it can't stop is someone reading the groups out of the public site code; that is the accepted trade-off of a
 * free static game whose puzzles are built in the browser.
 */
import { MIN_MS, guessKey, hasPuzzle, judge, puzzle as buildPuzzle, rankKey, todayKey, validDay, MAX_MISTAKES } from '../../site/js/daily.js';
import DAYS from './days.js';

const MAX_NAME = 20;

// The day's board and groups: baked at deploy by build-days.mjs from the same generator, because building a day cold
// costs more CPU than the free plan allows per request. Outside the baked range, built live.
const cache = new Map();
function puzzle(day) {
  if (cache.has(day)) return cache.get(day);
  const baked = DAYS[day];
  let p;
  if (baked) {
    const board = baked[0].split(',');
    p = { board, groups: baked[1].map((g) => ({ words: [...g].map((c) => board[parseInt(c, 36)]) })) };
  } else p = buildPuzzle(day);
  cache.set(day, p);
  return p;
}
const BOARD_SIZE = 20;
const MAX_GUESSES = 9; // 5 groups + 4 mistakes: no game can need more

function validateName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!name || [...name].length > MAX_NAME) return null;
  return name;
}

async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// --- HTTP plumbing ---

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.length) return '*';
  return allowed.includes(origin) ? origin : allowed[0];
}

function cors(request, env) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(request, env),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors(request, env) } });
}

function fail(request, env, code, message, status, extra = {}) {
  return json(request, env, { error: code, message, ...extra }, status);
}

const hits = new Map(); // in-memory, per isolate: enough to blunt a burst
function rateLimited(ip, bucket, limit) {
  const now = Date.now(), key = `${bucket}:${ip}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < 3600_000);
  const over = recent.length >= limit;
  if (!over) recent.push(now);
  hits.set(key, recent);
  return over;
}

async function readBody(request) {
  try { return (await request.json()) ?? {}; } catch { return null; }
}

// --- players and games ---

async function handleSession(request, env, ip) {
  if (rateLimited(ip, 'session', 30)) return fail(request, env, 'rate_limited', 'Too many new sessions from here.', 429);
  const playerId = crypto.randomUUID(), token = crypto.randomUUID();
  await env.DB.prepare('INSERT INTO groupyle_players (id, token_hash, created_at) VALUES (?, ?, ?)')
    .bind(playerId, await sha256Hex(token), new Date().toISOString()).run();
  return json(request, env, { playerId, token });
}

async function verifyPlayer(env, playerId, token) {
  if (typeof playerId !== 'string' || typeof token !== 'string' || !playerId || !token) return false;
  const row = await env.DB.prepare('SELECT token_hash FROM groupyle_players WHERE id = ?').bind(playerId).first();
  return !!row && row.token_hash === (await sha256Hex(token));
}

/** Stored guesses (board positions) back to words. */
const guessWords = (row, p) => (row.guesses ? row.guesses.split(';').map((g) => g.split(',').map((i) => p.board[Number(i)])) : []);
const foundGroups = (row) => [...row.results].filter((c) => /\d/.test(c)).map(Number);

/** What the browser gets back about a game. */
function gameView(row, day) {
  const p = puzzle(day);
  return {
    day, late: !!row.is_late, startedAt: row.started_at, guesses: guessWords(row, p), results: row.results,
    found: foundGroups(row), mistakes: row.mistakes, finished: !!row.finished, solved: !!row.solved, ms: row.ms,
  };
}

const getGame = (env, playerId, day) =>
  env.DB.prepare('SELECT * FROM groupyle_games WHERE player_id = ? AND day_key = ?').bind(playerId, day).first();

function checkDay(request, env, day) {
  if (!hasPuzzle(day)) return fail(request, env, 'bad_day', 'There is no Groupyle for that day.', 400);
  if (day > todayKey()) return fail(request, env, 'bad_day', "That day hasn't happened yet.", 400);
  return null;
}

/** Start (or resume) the player's game for a day. The server's clock starts here. */
async function handleStart(request, env, ip) {
  if (rateLimited(ip, 'start', 120)) return fail(request, env, 'rate_limited', 'Too many games from here. Try again later.', 429);
  const body = await readBody(request);
  if (!body) return fail(request, env, 'bad_request', 'Invalid JSON.', 400);
  const { playerId, token, day } = body;
  if (!(await verifyPlayer(env, playerId, token))) return fail(request, env, 'bad_session', 'Invalid or missing session. Reload the page.', 401);
  const bad = checkDay(request, env, day);
  if (bad) return bad;
  const name = validateName(body.name);
  if (!name) return fail(request, env, 'bad_name', `Name must be 1-${MAX_NAME} characters.`, 400);

  const late = day !== todayKey() ? 1 : 0;
  const ins = await env.DB.prepare(
    `INSERT INTO groupyle_games (player_id, day_key, is_late, display_name, groups, started_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (player_id, day_key) DO NOTHING`,
  ).bind(playerId, day, late, name, puzzle(day).groups.length, new Date().toISOString()).run();
  if (ins.meta?.changes) {
    await env.DB.prepare(
      `INSERT INTO groupyle_day_stats (day_key, is_late, players) VALUES (?, ?, 1)
         ON CONFLICT (day_key, is_late) DO UPDATE SET players = players + 1`,
    ).bind(day, late).run();
  }
  return json(request, env, gameView(await getGame(env, playerId, day), day));
}

/** One guess of four words. `index` is which guess this is, so a retried request can't count twice. */
async function handleGuess(request, env, ip) {
  if (rateLimited(ip, 'guess', 600)) return fail(request, env, 'rate_limited', 'Too many guesses from here. Try again later.', 429);
  const body = await readBody(request);
  if (!body) return fail(request, env, 'bad_request', 'Invalid JSON.', 400);
  const { playerId, token, day, index, words } = body;
  if (!(await verifyPlayer(env, playerId, token))) return fail(request, env, 'bad_session', 'Invalid or missing session. Reload the page.', 401);
  const bad = checkDay(request, env, day);
  if (bad) return bad;
  const row = await getGame(env, playerId, day);
  if (!row) return fail(request, env, 'not_started', 'Start the game first.', 409);
  if (!Number.isInteger(index) || index < 0 || index >= MAX_GUESSES) return fail(request, env, 'bad_index', 'Invalid guess number.', 400);

  const p = puzzle(day);
  const done = guessWords(row, p);
  const key = Array.isArray(words) ? guessKey(words) : '';
  if (index < done.length) {
    // a retry of a guess we already have: answer it again, change nothing
    if (guessKey(done[index]) === key) return json(request, env, { ...gameView(row, day), index, result: row.results[index] });
    return fail(request, env, 'already', 'That guess was already made.', 409, { state: gameView(row, day) });
  }
  if (index > done.length) return fail(request, env, 'out_of_order', 'Guesses must arrive in order.', 409, { state: gameView(row, day) });
  if (row.finished) return fail(request, env, 'finished', 'This game is over.', 409, { state: gameView(row, day) });
  const found = foundGroups(row);
  const verdict = judge(p, words, found);
  if (verdict.error === 'already_found') return fail(request, env, 'already_found', 'One of those is in a group you found.', 400);
  if (verdict.error) return fail(request, env, 'bad_guess', 'A guess is four different words from the board.', 400);
  if (done.some((g) => guessKey(g) === key)) return fail(request, env, 'repeat', 'You already tried those four.', 400);

  const hit = verdict.group >= 0;
  const result = hit ? String(verdict.group) : verdict.oneAway ? 'o' : 'x';
  const nFound = found.length + (hit ? 1 : 0), mistakes = row.mistakes + (hit ? 0 : 1);
  const solved = nFound === p.groups.length;
  const finished = solved || mistakes >= MAX_MISTAKES;
  const now = new Date();
  const ms = finished ? now - Date.parse(row.started_at) : null;
  if (solved && ms < MIN_MS) return fail(request, env, 'bad_time', 'That was impossibly fast.', 400);

  const positions = words.map((w) => p.board.indexOf(String(w).toUpperCase())).join(',');
  const res = await env.DB.prepare(
    `UPDATE groupyle_games SET guesses = ?, results = ?, n = ?, found = ?, mistakes = ?, finished = ?, solved = ?, rank_n = ?, ms = ?, finished_at = ?
      WHERE player_id = ? AND day_key = ? AND n = ?`,
  ).bind(row.guesses ? `${row.guesses};${positions}` : positions, row.results + result, index + 1, nFound, mistakes,
    finished ? 1 : 0, solved ? 1 : 0, finished ? rankKey({ solved, mistakes, found: nFound, groups: p.groups.length }) : null,
    ms, finished ? now.toISOString() : null, playerId, day, index).run();
  if (!res.meta?.changes) return fail(request, env, 'conflict', 'Another guess arrived at the same time. Reload the page.', 409);
  if (finished) {
    await env.DB.prepare(
      `UPDATE groupyle_day_stats SET finished = finished + 1, solved = solved + ?, perfect = perfect + ? WHERE day_key = ? AND is_late = ?`,
    ).bind(solved ? 1 : 0, solved && mistakes === 0 ? 1 : 0, day, row.is_late).run();
  }
  return json(request, env, { ...gameView(await getGame(env, playerId, day), day), index, result });
}

// --- boards ---

const BOARD_COLS = 'player_id, display_name, groups, found, mistakes, solved, rank_n, ms, results, finished_at';
const view = (r, rank, playerId) => ({
  rank, name: r.display_name, groups: r.groups, found: r.found, mistakes: r.mistakes, solved: !!r.solved, ms: r.ms,
  results: r.results, you: r.player_id === playerId,
});

export async function fetchBoard(env, day, late, playerId) {
  const lateN = late ? 1 : 0;
  const { results } = await env.DB.prepare(
    `SELECT ${BOARD_COLS} FROM groupyle_games WHERE day_key = ? AND is_late = ? AND finished = 1
      ORDER BY rank_n ASC, ms ASC, finished_at ASC LIMIT ?`,
  ).bind(day, lateN, BOARD_SIZE).all();
  const top = (results ?? []).map((r, i) => view(r, i + 1, playerId));
  const stats = await env.DB.prepare('SELECT players, finished, solved, perfect FROM groupyle_day_stats WHERE day_key = ? AND is_late = ?')
    .bind(day, lateN).first();
  let you = null;
  if (playerId && !top.some((r) => r.you)) {
    const mine = await env.DB.prepare(
      `SELECT ${BOARD_COLS} FROM groupyle_games WHERE player_id = ? AND day_key = ? AND is_late = ? AND finished = 1`,
    ).bind(playerId, day, lateN).first();
    if (mine) {
      const above = await env.DB.prepare(
        `SELECT COUNT(*) AS c FROM groupyle_games WHERE day_key = ? AND is_late = ? AND finished = 1
           AND (rank_n < ? OR (rank_n = ? AND (ms < ? OR (ms = ? AND finished_at < ?))))`,
      ).bind(day, lateN, mine.rank_n, mine.rank_n, mine.ms, mine.ms, mine.finished_at).first();
      you = view(mine, (above?.c ?? 0) + 1, playerId);
    }
  }
  return {
    day, late: !!late, players: stats?.players ?? 0, finished: stats?.finished ?? 0, solved: stats?.solved ?? 0,
    perfect: stats?.perfect ?? 0, top, you,
  };
}

async function handleLeaderboard(request, env) {
  const url = new URL(request.url);
  const day = url.searchParams.get('day') || todayKey();
  if (!validDay(day)) return fail(request, env, 'bad_day', 'Invalid day.', 400);
  return json(request, env, await fetchBoard(env, day, url.searchParams.get('late') === '1', url.searchParams.get('playerId')));
}

async function handleDays(request, env) {
  const url = new URL(request.url);
  const to = url.searchParams.get('to') || todayKey();
  const from = url.searchParams.get('from') || to;
  if (!validDay(from) || !validDay(to)) return fail(request, env, 'bad_day', 'Invalid day.', 400);
  const { results } = await env.DB.prepare(
    'SELECT day_key, is_late, players, solved, perfect FROM groupyle_day_stats WHERE day_key BETWEEN ? AND ?',
  ).bind(from, to).all();
  const days = {};
  for (const r of results ?? []) {
    days[r.day_key] ??= { players: 0, solved: 0, perfect: 0, latePlayers: 0 };
    if (r.is_late) days[r.day_key].latePlayers = r.players;
    else Object.assign(days[r.day_key], { players: r.players, solved: r.solved, perfect: r.perfect });
  }
  return json(request, env, { days });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors(request, env) });
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    try {
      if (url.pathname === '/api/session' && request.method === 'POST') return await handleSession(request, env, ip);
      if (url.pathname === '/api/start' && request.method === 'POST') return await handleStart(request, env, ip);
      if (url.pathname === '/api/guess' && request.method === 'POST') return await handleGuess(request, env, ip);
      if (url.pathname === '/api/leaderboard' && request.method === 'GET') return await handleLeaderboard(request, env);
      if (url.pathname === '/api/days' && request.method === 'GET') return await handleDays(request, env);
      return fail(request, env, 'not_found', 'No such endpoint.', 404);
    } catch (err) {
      console.error(err);
      return fail(request, env, 'server_error', 'Something broke. Try again.', 500);
    }
  },
};
