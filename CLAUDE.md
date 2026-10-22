# Groupyle: notes for coding agents

Sixteen words, four hidden groups of four (Sunday: twenty words, five groups). Four mistakes allowed. Ranked by
fewest mistakes, then fastest server-timed time. Start with README.md.

Critical rules:
- **jacob.gg house rules and shared kit:** read `../jacob.gg/PLAYBOOK.md` before changing the look, the results screen, the leaderboard flow or the leaderboard table. The page loads `jacob.gg/kit/jgg.css` + `jgg.js`: don't redefine the kit's base CSS here. If the `groupyle_games` table changes, update the hub's `worker/src/sources.js` so plays keep counting.
- **Never change a past or current day.** Puzzles are built in the browser from the date (`puzzle(day)` in `site/js/daily.js`) out of the bank in `site/js/bank/`. Never edit or delete a category once its `added` day has passed, never change `EPOCH`, `PLAN`, `ERA_DAYS`, `WINDOW` or the generator's choices for past days. Fix a live category with an erratum (`site/js/bank/errata.js`, `from` after tomorrow); add categories with `added` after tomorrow. `npm test` compares every day with `test/golden.json`; `npm run golden` re-records only days after tomorrow.
- **The bank** is hand-curated: format, tiers, families and the `also` safety net are in `docs/bank.md`. Run `npm run review` after any change, and read the overlaps it prints. No word on a board may fit two of the day's groups.
- **Room play:** inside the jacob.gg/play iframe the game posts `{ jgg: 'room', type: 'progress' | 'finish', ... }` to the parent with groups found and mistakes only, never words. The contract is `../jacob.gg/docs/room-contract.md`; the lobby reads `#done` and `#room-score`.
- **Shared database:** the worker uses the `words-leaderboard` D1, shared with Lettrle (the free plan's last D1). Every Groupyle table is named `groupyle_*`. Never touch another game's tables in it.
- After changing `site/js/daily.js` or `site/js/bank/*`, redeploy the worker (`cd worker && npx wrangler deploy`). It bundles them to judge guesses.
- Free project: ask the owner before adding any paid service. Commit as `biccyanzac-pixel <285977456+biccyanzac-pixel@users.noreply.github.com>` (repo-local config).
- Ports: site 8086, worker 8871.
- Tests: `npm test` (bank format, two years of puzzles, golden days, rules); `cd worker && rm -rf .wrangler && npm run db:init:local && npm run dev:local`, then `npm test` in `worker/`; `node tools/e2e-ui.mjs` (headless Chrome; needs the hub worker on 8831 for the rating box, or `HUB=off`).
