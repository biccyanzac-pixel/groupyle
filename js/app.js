// Groupyle UI: intro -> the board (find the groups, four mistakes allowed) -> result, share, leaderboard. Archive
// replays. Live progress to a Play together room: groups found and mistakes only, never words.
import { EMOJI, EPOCH, MAX_MISTAKES, GROUP_SIZE, addDays, dayNumber, guessKey, hasPuzzle, judge, msUntilNextUtcDay, puzzle, roomScore, todayKey } from './daily.js';
import * as api from './api.js';
import * as store from './storage.js';

const $ = (id) => document.getElementById(id);
const SITE = 'https://biccyanzac-pixel.github.io/groupyle/';
const IN_ROOM = window.parent !== window; // inside the jacob.gg/play lobby's iframe

let mode = { day: todayKey(), late: false };
let g = null;              // the game on screen: { day, late, p, prog, st, order, selected }
const sync = { busy: false, again: false };

function el(tag, props = {}, ...children) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) if (c !== null && c !== undefined) n.append(c);
  return n;
}

// A plain show/hide cancels any transition still running on that element, so it can't undo this later.
const show = (id, on = true) => { const e = $(id); e.getAnimations?.().forEach((a) => a.cancel()); e.hidden = !on; };
// The kit's motion (docs/motion-system.md) when it loaded; the same end state without it.
const motion = () => window.JGG?.motion;
const phase = (from, to) => { const m = motion(); if (m && !from.hidden) m.swap(from, to); else { from.hidden = true; to.hidden = false; } };
const scrollTo = (e, block = 'start') => { const m = motion(); m ? m.scroll(e, { block }) : e.scrollIntoView({ block }); };
const pad = (n) => String(n).padStart(2, '0');
const fmtTime = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Play a list of guesses through the rules: what was found, in which order, and how many mistakes. */
function replay(p, guesses) {
  const found = [], results = [];
  let mistakes = 0;
  for (const w of guesses) {
    if (found.length === p.groups.length || mistakes >= MAX_MISTAKES) break;
    const v = judge(p, w, found);
    if (v.error) continue;
    if (v.group >= 0) { found.push(v.group); results.push(String(v.group)); } else { mistakes++; results.push(v.oneAway ? 'o' : 'x'); }
  }
  const solved = found.length === p.groups.length;
  return { found, results, mistakes, solved, finished: solved || mistakes >= MAX_MISTAKES };
}
const groupOf = (p, w) => p.groups.find((x) => x.words.includes(w));

function tickCountdown() {
  const s = Math.floor(msUntilNextUtcDay() / 1000);
  $('countdown').textContent = `Next in ${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  // a new UTC day started: switch to it unless someone is in the middle of a board
  if (!mode.late && mode.day !== todayKey() && !g) {
    mode = { day: todayKey(), late: false };
    render();
  }
}

// --- room (jacob.gg/play): groups found and mistakes, never words. See jacob.gg/docs/room-contract.md -------------

function roomPost(type, extra = {}) {
  if (!IN_ROOM) return;
  const p = puzzle(mode.day), st = replay(p, store.progress(mode.day, mode.late).guesses), n = p.groups.length;
  const msg = { jgg: 'room', type, game: 'groupyle', day: mode.day, p: st.found.length / n, found: st.found.length, groups: n,
    mistakes: st.mistakes, maxMistakes: MAX_MISTAKES, rows: ['g'.repeat(st.found.length) + 'x'.repeat(n - st.found.length)], ...extra };
  try { window.parent.postMessage(msg, location.origin); } catch { /* the lobby is optional */ }
}
const roomProgress = () => roomPost('progress');
function roomFinish(already) {
  const prog = store.progress(mode.day, mode.late), st = replay(puzzle(mode.day), prog.guesses);
  roomPost('finish', { score: roomScore({ ...st, found: st.found.length }), solved: st.solved, ms: prog.finishedAt - prog.startedAt, already });
}

// --- views ----------------------------------------------------------------------------------------

function render() {
  const { day, late } = mode;
  const p = puzzle(day), n = p.groups.length;
  $('daynum').textContent = `Groupyle #${p.number}${late ? ` · ${day} (played later)` : ''}`;
  if (window.JGG) $('level').replaceChildren(JGG.levelChip(day));
  $('intro-title').textContent = n === 5 ? 'Sunday special: five hidden groups' : 'Find the four hidden groups';
  $('how-board').textContent = `${n * GROUP_SIZE} words hide ${n} groups of ${GROUP_SIZE}. Pick four that belong together and submit.`;
  g = null;
  show('play', false);
  const prog = store.progress(day, late);
  if (replay(p, prog.guesses).finished) {
    show('intro', false);
    renderDone(false);
    roomFinish(true);
    flush();
  } else {
    show('done', false);
    show('intro', true);
    hideError('start-error');
    $('start-label').textContent = prog.startedAt ? 'Continue' : 'Start';
    const name = api.savedName();
    $('name').value = name;
    show('name-field', !name);
    if (window.JGG) JGG.playingAs({ mount: $('playing-as'), name, onChange: (nm) => { api.saveName(nm); $('name').value = nm; } });
    else { $('playing-as').textContent = name ? `Playing as ${name}.` : ''; show('playing-as', !!name); }
  }
  renderBoard();
}

function startGame() {
  const { day, late } = mode;
  const p = puzzle(day);
  const prog = store.progress(day, late);
  if (!prog.startedAt) { prog.startedAt = Date.now(); store.save(day, late, prog); }
  const st = replay(p, prog.guesses);
  const gone = new Set(st.found.flatMap((i) => p.groups[i].words));
  g = { day, late, p, prog, st, order: p.board.filter((w) => !gone.has(w)), selected: new Set() };
  // The board is the puzzle and the clock is running: it appears at once, never faded in.
  show('intro', false);
  show('play', true);
  $('play-label').textContent = `Find ${p.groups.length} groups`;
  $('found').replaceChildren(...st.found.map((i) => groupItem(p.groups[i])));
  buildTiles();
  message('');
  hideError('play-error');
  roomProgress();
  flush();
  $('board').querySelector('.tile')?.focus({ preventScroll: true });
  scrollTo($('card'));
}

function groupItem(grp, { fresh = false, missed = false, i = 0 } = {}) {
  return el('li', { class: `group${fresh ? ' is-new' : ''}${missed ? ' missed' : ''}`, 'data-c': grp.colour, style: `--jgg-i: ${i}` },
    el('p', { class: 'group-name', text: grp.name }),
    el('p', { class: 'group-words', text: grp.words.join(', ') }),
    missed ? el('span', { class: 'sr', text: ' (not found)' }) : null);
}

function buildTiles() {
  $('board').replaceChildren(...g.order.map((w) => el('button', {
    class: 'tile', type: 'button', 'data-word': w, 'data-len': String(w.length), 'aria-pressed': String(g.selected.has(w)),
    onclick: () => toggle(w), text: w,
  })));
  fitTiles();
  updateControls();
}

// The whole word is the clue, so a word too wide for its tile (wide letters, a narrow phone) gets smaller type, never
// an ellipsis. Most words fit with the CSS sizes; this catches the rest.
function fitTiles() {
  for (const t of $('board').children) {
    t.style.fontSize = '';
    let size = parseFloat(getComputedStyle(t).fontSize);
    while (t.scrollWidth > t.clientWidth && size > 8) t.style.fontSize = `${(size -= 0.5)}px`;
  }
}
addEventListener('resize', () => { if (g) fitTiles(); });

function updateControls() {
  const left = MAX_MISTAKES - g.st.mistakes;
  $('dots').replaceChildren(...Array.from({ length: MAX_MISTAKES }, (_, i) => el('i', { class: i < left ? '' : 'used' })));
  $('mistakes-sr').textContent = `: ${left} of ${MAX_MISTAKES}`;
  $('submit').disabled = g.selected.size !== GROUP_SIZE;
  $('deselect').disabled = g.selected.size === 0;
}

function toggle(w) {
  if (!g || g.st.finished) return;
  if (g.selected.has(w)) g.selected.delete(w);
  else if (g.selected.size < GROUP_SIZE) g.selected.add(w);
  else return;
  $('board').querySelector(`[data-word="${w}"]`)?.setAttribute('aria-pressed', String(g.selected.has(w)));
  message('');
  updateControls();
}

function message(text, warn = false) {
  $('message').textContent = text;
  $('message').classList.toggle('warn', warn);
}

function submitGuess() {
  if (!g || g.st.finished || g.selected.size !== GROUP_SIZE) return;
  const words = [...g.selected];
  if (g.prog.guesses.some((x) => guessKey(x) === guessKey(words))) { message('Already guessed!', true); return; }
  const v = judge(g.p, words, g.st.found);
  if (v.error) return;
  g.prog.guesses.push(words);
  g.st = replay(g.p, g.prog.guesses);
  if (g.st.finished) g.prog.finishedAt = Date.now();
  store.save(g.day, g.late, g.prog);
  if (v.group >= 0) {
    const grp = g.p.groups[v.group];
    g.selected.clear();
    g.order = g.order.filter((w) => !grp.words.includes(w));
    $('found').append(groupItem(grp, { fresh: true }));
    message('');
    buildTiles();
  } else {
    message(v.oneAway ? 'One away…' : g.st.finished ? 'Out of mistakes.' : 'Not a group.', true);
    updateControls();
  }
  roomProgress();
  flush();
  if (g.st.finished) finish();
}

function finish() {
  g = null;
  renderDone(true);
  roomFinish(false);
  scrollTo($('card'));
}

// fresh: the game has just ended here, so the rows come in. Never on a reload or re-render.
function renderDone(fresh) {
  const { day, late } = mode;
  const p = puzzle(day), prog = store.progress(day, late), st = replay(p, prog.guesses), n = p.groups.length;
  fresh ? phase($('play'), $('done')) : show('done', true);
  $('daily-score-caption').textContent = late ? `Your replay of ${day}` : "Today's result";
  $('daily-score').textContent = `${st.found.length}/${n}`;
  $('daily-score').className = `score ${st.solved ? 'good' : 'bad'}`;
  $('done-sub').textContent = doneSub(day, late);
  $('guess-grid').replaceChildren(...prog.guesses.slice(0, st.results.length).map((ws) =>
    el('span', {}, ...ws.map((w) => el('i', { 'data-c': groupOf(p, w)?.colour ?? 'y' })))));
  const missed = p.groups.map((_, i) => i).filter((i) => !st.found.includes(i));
  $('done-groups').replaceChildren(
    ...st.found.map((i, k) => groupItem(p.groups[i], { fresh, i: k })),
    ...missed.map((i, k) => groupItem(p.groups[i], { fresh, missed: true, i: st.found.length + k })));
  $('room-score').textContent = String(roomScore({ ...st, found: st.found.length }));
  show('share-done', false);
  window.JGG?.rate({ game: 'groupyle', day, mount: $('rate') });
}

function doneSub(day, late) {
  const p = puzzle(day), prog = store.progress(day, late), st = replay(p, prog.guesses);
  const ms = prog.ms ?? (prog.finishedAt && prog.startedAt ? prog.finishedAt - prog.startedAt : null);
  return st.solved
    ? `Solved with ${st.mistakes ? plural(st.mistakes, 'mistake') : 'no mistakes'}${ms !== null ? ` in ${fmtTime(ms)}` : ''}.`
    : `Out of mistakes: you found ${st.found.length} of ${p.groups.length} groups.`;
}

function shareText() {
  const { day, late } = mode;
  const p = puzzle(day), prog = store.progress(day, late), st = replay(p, prog.guesses);
  const streak = late ? 0 : store.streak(todayKey(), addDays);
  const line = st.solved ? `Solved, ${st.mistakes ? plural(st.mistakes, 'mistake') : 'no mistakes'}` : `${st.found.length}/${p.groups.length} groups`;
  const rows = prog.guesses.slice(0, st.results.length).map((ws) => ws.map((w) => EMOJI[groupOf(p, w)?.colour ?? 'y']).join(''));
  return `Groupyle #${p.number}${late ? ' (replay)' : ''}: ${line}${streak > 1 ? `  🔥${streak}` : ''}\n${rows.join('\n')}\n${SITE}`;
}

async function share() {
  const text = shareText();
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    show('share-done', true);
  } catch (e) {
    if (e?.name !== 'AbortError') prompt('Copy your result:', text);
  }
}

// --- leaderboard sync: the start, then every guess in order. The server judges and times them. ----------------

/** The server knows better (another tab or device played on): take its game and redraw. */
function adopt(day, late, state) {
  const prog = store.progress(day, late);
  prog.guesses = state.guesses;
  prog.synced = state.guesses.length;
  prog.started = true;
  if (state.finished) { prog.ms = state.ms; if (!prog.finishedAt) prog.finishedAt = Date.parse(state.startedAt) + (state.ms ?? 0); }
  store.save(day, late, prog);
  if (mode.day === day && mode.late === late) {
    if (state.finished) { g = null; show('intro', false); show('play', false); renderDone(false); }
    else if (g) startGame();
  }
}

async function flush() {
  if (!api.enabled()) return;
  if (sync.busy) { sync.again = true; return; }
  const { day, late } = mode;
  const errId = () => (g ? 'play-error' : 'done-error');
  sync.busy = true;
  hideError('play-error'); hideError('done-error');
  try {
    let prog = store.progress(day, late);
    if (!prog.started) {
      const s = await api.start(day, api.savedName() || 'Player');
      prog = store.progress(day, late);
      const same = s.guesses.every((w, i) => prog.guesses[i] && guessKey(prog.guesses[i]) === guessKey(w));
      if (!same || s.guesses.length > prog.guesses.length) return adopt(day, late, s);
      prog.started = true;
      prog.synced = s.guesses.length;
      store.save(day, late, prog);
    }
    while (prog.synced < prog.guesses.length) {
      const i = prog.synced;
      let res;
      try { res = await api.guess(day, i, prog.guesses[i]); }
      catch (e) {
        if (e.data?.state) return adopt(day, late, e.data.state);
        throw e;
      }
      prog = store.progress(day, late);
      prog.synced = i + 1;
      if (res.finished) prog.ms = res.ms; // the server's time is the one on the board
      store.save(day, late, prog);
    }
    if (prog.finishedAt) {
      if (mode.day === day && mode.late === late && !$('done').hidden) $('done-sub').textContent = doneSub(day, late);
      renderBoard();
    }
  } catch (e) {
    showError(errId(), `Couldn't save to the leaderboard: ${e.message}`, true);
  } finally {
    sync.busy = false;
    if (sync.again) { sync.again = false; flush(); }
  }
}

async function renderBoard() {
  if (!api.enabled()) { show('lb', false); return; }
  const { day, late } = mode;
  show('lb', true);
  $('lb-title').textContent = late ? `Played later: ${day}` : "Today's leaderboard";
  let b;
  try { b = await api.board(day, late); }
  catch (e) { $('board-note').textContent = `Leaderboard unavailable: ${e.message}`; show('board-note', true); return; }
  if (mode.day !== day || mode.late !== late) return;
  show('board-note', false);
  $('players').textContent = b.players ? `${plural(b.players, 'player')}` : '';
  const rows = [...b.top];
  if (b.you) rows.push(null, b.you);
  $('rows').replaceChildren(...rows.map((r) => r === null ? el('li', { class: 'row-gap', text: '···' })
    : el('li', { class: `row${r.you ? ' me' : ''}` },
      el('span', { class: 'row-rank', text: `${r.rank}` }),
      el('div', { class: 'row-main' },
        el('div', { class: 'row-name', text: r.name, title: r.name ?? '', dir: 'auto' }),
        el('div', { class: 'row-sub' },
          el('span', { class: 'dots', 'aria-hidden': 'true' }, ...Array.from({ length: MAX_MISTAKES }, (_, i) => el('i', { class: i < MAX_MISTAKES - r.mistakes ? '' : 'used' }))),
          r.solved ? ` ${r.mistakes ? plural(r.mistakes, 'mistake') : 'perfect'}` : ` ${r.found}/${r.groups} groups`)),
      el('span', { class: 'row-score', text: fmtTime(r.ms ?? 0) }))));
  show('board-empty', !b.top.length);
}

// --- archive --------------------------------------------------------------------------------------

async function browseArchive() {
  const list = $('archive-list');
  if (!list.hidden) { list.hidden = true; return; }
  const items = [];
  for (let d = addDays(todayKey(), -1); d >= EPOCH; d = addDays(d, -1)) items.push(d);
  let summary = {};
  try { if (api.enabled() && items.length) summary = (await api.days(items[items.length - 1], items[0])).days || {}; }
  catch { /* the list works without counts */ }
  const mine = (d) => {
    for (const late of [false, true]) {
      const guesses = store.progress(d, late).guesses;
      if (!guesses.length) continue; // building a day costs time: only for days you've played
      const st = replay(puzzle(d), guesses);
      if (st.finished) return st.solved ? (st.mistakes ? plural(st.mistakes, 'mistake') : 'perfect') : `${st.found.length} groups`;
    }
    return null;
  };
  list.replaceChildren(...(items.length ? items.map((d) => {
    const s = summary[d], you = mine(d);
    return el('li', {}, el('button', { class: 'archive-list-item', type: 'button', onclick: () => openArchive(d) },
      el('span', { class: 'archive-list-day', text: `Groupyle #${dayNumber(d)} · ${d}` }),
      el('span', { class: 'archive-list-prompt', text: [
        s?.players ? `${plural(s.players, 'player')} on the day, ${s.solved} solved` : 'Nobody played on the day',
        you ? `you: ${you}` : null].filter(Boolean).join(' · ') })));
  }) : [el('li', { class: 'archive-list-empty', text: 'No past days yet. Groupyle started today.' })]));
  list.hidden = false;
}

function openArchive(d) {
  // a day you already finished on the day itself is shown as done; otherwise it's a replay
  mode = replay(puzzle(d), store.progress(d, false).guesses).finished ? { day: d, late: false } : { day: d, late: true };
  $('archive-list').hidden = true;
  render();
  scrollTo($('card'));
}

// --- errors ---------------------------------------------------------------------------------------

function showError(id, msg, retry = false) {
  $(id).replaceChildren(msg, retry ? el('button', { class: 'ghost retry', type: 'button', text: 'Retry', onclick: () => flush() }) : '');
  show(id, true);
}
function hideError(id) { show(id, false); }

// --- boot -----------------------------------------------------------------------------------------

$('start-form').addEventListener('submit', (e) => {
  e.preventDefault();
  hideError('start-error');
  const name = ($('name').value || api.savedName()).replace(/\s+/g, ' ').trim();
  if (!name) { showError('start-error', 'Enter a name for the leaderboard.'); return; }
  api.saveName(name.slice(0, 20));
  startGame();
});
$('submit').addEventListener('click', submitGuess);
$('deselect').addEventListener('click', () => { if (!g) return; g.selected.clear(); buildTiles(); message(''); });
$('shuffle').addEventListener('click', () => {
  if (!g) return;
  const a = [...g.order];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  g.order = a;
  buildTiles();
});
$('share').addEventListener('click', share);
$('archive-browse').addEventListener('click', browseArchive);

(async function boot() {
  await api.loadConfig();
  const q = new URLSearchParams(location.search).get('day');
  if (q && hasPuzzle(q) && q < todayKey()) openArchive(q);
  else render();
  tickCountdown();
  setInterval(tickCountdown, 1000);
})();
