// Browser end-to-end: plays today's puzzle in headless Chrome against a local worker, phone + desktop sizes, and checks
// the Play together messages from inside an iframe.
//   cd worker && rm -rf .wrangler && npm run db:init:local && npm run dev:local     (in another terminal)
//   jacob.gg hub worker on 8831 for the rating box (see ../jacob.gg/CLAUDE.md), or HUB=off
//   node tools/e2e-ui.mjs
import fs from 'node:fs';
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';
import { MIN_MS, puzzle, todayKey } from '../site/js/daily.js';

const API = process.env.API || 'http://127.0.0.1:8871';
const HUB = process.env.HUB || 'http://127.0.0.1:8831';
const SITE = 'http://localhost:8086/';
const today = todayKey();
const p = puzzle(today);
const G = p.groups.map((g) => g.words);
const n = G.length;
fs.mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
const shot = (pg, name, full = true) => pg.screenshot({ path: `tools/results/${name}.png`, fullPage: full });

const srv = await serve(8086);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
let failures = 0;
const check = (label, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`); if (!ok) failures++; };
const qs = `?api=${encodeURIComponent(API)}&hub=${encodeURIComponent(HUB)}`;
const pickAndSubmit = async (pg, words) => {
  for (const w of words) await pg.click(`#board .tile[data-word="${w}"]`);
  await pg.click('#submit');
};
const dotsLeft = (pg) => pg.$$eval('#dots i:not(.used)', (d) => d.length);

// --- phone: a full game ---------------------------------------------------------------------------------------
const page = await browser.newPage({ viewport: { width: 360, height: 760 }, deviceScaleFactor: 2, hasTouch: true });
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(SITE + qs);
await page.waitForSelector('#daynum:has-text("Groupyle #")');
check('day number shown', (await page.textContent('#daynum')).includes(`#${p.number}`));
check('weekday level shown (jacob.gg kit)', /·|Sunday special/.test(await page.textContent('#level')));
await shot(page, '1-intro-phone');
await page.fill('#name', 'Tester');
await page.click('#start');
await page.waitForSelector('#play:not([hidden]) #board .tile');
check(`board has ${n * 4} words`, (await page.$$('#board .tile')).length === n * 4);
const widest = await page.$$eval('#board .tile', (ts) => Math.max(...ts.map((t) => t.scrollWidth - t.clientWidth)));
check('every word fits its tile at 360 px', widest <= 0, `overflow ${widest}px`);
check('submit needs four', await page.isDisabled('#submit'));

await pickAndSubmit(page, [G[0][0], G[0][1], G[1][0], G[1][1]]);
check('a mistake: message and a dot gone', (await page.textContent('#message')).includes('Not a group') && (await dotsLeft(page)) === 3);
await page.click('#submit');
check('the same four again: "Already guessed", no dot lost', (await page.textContent('#message')).includes('Already') && (await dotsLeft(page)) === 3);
await page.click('#deselect');
check('deselect clears the picks', (await page.$$('#board .tile[aria-pressed="true"]')).length === 0);
await pickAndSubmit(page, [G[0][0], G[0][1], G[0][2], G[1][0]]);
check('one away', (await page.textContent('#message')).includes('One away') && (await dotsLeft(page)) === 2);
await page.click('#deselect');
await page.click('#shuffle');
check('shuffle keeps every word', (await page.$$('#board .tile')).length === n * 4);
await pickAndSubmit(page, G[1]);
await page.waitForSelector('#found .group');
check('a found group moves above the board', (await page.textContent('#found')).includes(p.groups[1].name) && (await page.$$('#board .tile')).length === (n - 1) * 4);
await shot(page, '2-play-phone');
await page.waitForTimeout(MIN_MS + 300); // the worker refuses solves faster than this
for (let i = 0; i < n; i++) if (i !== 1) await pickAndSubmit(page, G[i]);
await page.waitForSelector('#done:not([hidden])');
check(`result ${n}/${n}`, (await page.textContent('#daily-score')) === `${n}/${n}`);
check('room score element = groups + mistakes left', (await page.textContent('#room-score')) === String(n + 2));
check('every group listed at the end', (await page.$$('#done-groups .group')).length === n);
check('guess grid: one row per guess', (await page.$$('#guess-grid > span')).length === n + 2);
await page.waitForFunction(() => /Solved with 2 mistakes in \d+:\d\d/.test(document.querySelector('#done-sub').textContent));
await page.waitForFunction(() => [...document.querySelectorAll('#rows .row')].some((r) => r.textContent.includes('Tester')), null, { timeout: 8000 }).catch(() => {});
const board = await page.$$eval('#rows .row', (rs) => rs.map((r) => r.textContent));
check('leaderboard lists the player with 2 mistakes', board.some((t) => t.includes('Tester') && t.includes('2 mistakes')), JSON.stringify(board));
check('no sync error', await page.isHidden('#done-error') && await page.isHidden('#play-error'));
const mine = (await page.textContent('#rows .row.me').catch(() => '')) || '';
const serverTime = (mine.match(/(\d+:\d\d)/) || [])[1];
check('result shows the server-timed time', !!serverTime && (await page.textContent('#done-sub')).includes(serverTime), `${serverTime} vs ${await page.textContent('#done-sub')}`);
await shot(page, '3-done-phone');
if (HUB !== 'off') {
  await page.waitForSelector('#rate .jgg-rate', { timeout: 8000 }).catch(() => {});
  check('rating box shown', !!(await page.$('#rate .jgg-rate')));
}
await page.reload();
await page.waitForSelector('#done:not([hidden])');
check('finished state survives a reload', (await page.textContent('#daily-score')) === `${n}/${n}`);
await page.click('#archive-browse');
await page.waitForSelector('#archive-list:not([hidden])');
check('archive opens', (await page.textContent('#archive-list')).length > 0);
const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
check('no horizontal scroll at 360 px', scrollW <= 360, String(scrollW));

// --- Play together: groups found and mistakes, never words --------------------------------------------------
const room = await browser.newPage({ viewport: { width: 390, height: 844 } });
room.on('pageerror', (e) => errors.push(e.message));
await room.route(SITE + '__room.html', (r) => r.fulfill({ contentType: 'text/html', body:
  `<!doctype html><script>window.msgs=[];addEventListener('message',(e)=>{if(e.origin===location.origin&&e.data?.jgg==='room')msgs.push(e.data)});</script>
   <iframe id="f" style="width:380px;height:800px" src="./?api=off&hub=off"></iframe>` }));
await room.goto(SITE + '__room.html');
const frame = await (await room.waitForSelector('#f')).contentFrame();
await frame.waitForSelector('#daynum:has-text("Groupyle #")');
await frame.fill('#name', 'Roomie');
await frame.click('#start');
await frame.waitForSelector('#play:not([hidden])');
await pickAndSubmit(frame, [G[0][0], G[0][1], G[1][0], G[1][1]]);
await frame.click('#deselect');
for (const grp of G) await pickAndSubmit(frame, grp);
await frame.waitForSelector('#done:not([hidden])');
const msgs = await room.evaluate(() => window.msgs);
const progress = msgs.filter((m) => m.type === 'progress');
const fin = msgs.find((m) => m.type === 'finish');
check('room: progress at the start and after each guess', progress.length === n + 2 && progress.at(-1).found === n && progress[1].mistakes === 1,
  JSON.stringify(progress.map((m) => [m.found, m.mistakes])));
check('room: rows are colours only', progress.every((m) => m.rows.every((r) => /^[gyx]+$/.test(r))));
check('room: no message carries a word', !msgs.some((m) => p.board.some((w) => JSON.stringify(m).includes(w))), JSON.stringify(msgs.at(-1)));
check('room: finish score = groups + mistakes left', fin && fin.solved === true && fin.score === n + 3 && fin.game === 'groupyle' && fin.already === false, JSON.stringify(fin));
check('room: lobby selectors (#done visible, #room-score)', (await frame.textContent('#room-score')) === String(n + 3) && await frame.isVisible('#done'));
await frame.evaluate(() => location.reload());
await room.waitForFunction(() => window.msgs.some((m) => m.type === 'finish' && m.already));
check('room: a finished game says already on load', true);

// --- desktop, light theme, storage blocked ------------------------------------------------------------------
const desk = await browser.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
desk.on('pageerror', (e) => errors.push(e.message));
await desk.goto(SITE + '?api=off&hub=off');
await desk.waitForSelector('#daynum:has-text("Groupyle #")');
await desk.fill('#name', 'Desk');
await desk.click('#start');
await desk.waitForSelector('#board .tile');
await pickAndSubmit(desk, G[0]);
await shot(desk, '4-play-desktop-light', false);

const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, colorScheme: 'dark' });
await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } }); });
const blocked = await ctx.newPage();
const blockedErrors = []; blocked.on('pageerror', (e) => blockedErrors.push(e.message));
await blocked.goto(SITE + '?api=off&hub=off');
await blocked.waitForSelector('#daynum:has-text("Groupyle #")');
await blocked.fill('#name', 'NoStorage');
await blocked.click('#start');
await blocked.waitForSelector('#board .tile');
await pickAndSubmit(blocked, G[2]);
check('works with localStorage blocked', blockedErrors.length === 0 && (await blocked.$$('#found .group')).length === 1, blockedErrors.join(' | '));
await shot(blocked, '5-play-phone-dark');

check('no page errors', errors.length === 0, errors.join(' | '));
await browser.close(); srv.close();
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
