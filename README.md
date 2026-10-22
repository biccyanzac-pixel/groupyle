# Groupyle

A jacob.gg daily game: sixteen words hide four groups of four. Find them all with four mistakes or fewer.
Sunday is a special with twenty words and five groups.

Play: https://biccyanzac-pixel.github.io/groupyle/ · Hub: https://biccyanzac-pixel.github.io/jacob.gg/

- **Puzzles** are built in the browser from the date (`site/js/daily.js`), out of a hand-curated bank of categories
  (`site/js/bank/`, rules in [docs/bank.md](docs/bank.md), generator in [docs/generator.md](docs/generator.md)).
  The same day is the same board for everyone, and a past day never changes.
- **Weekday curve**: Monday's categories are obvious and never look alike; look-alike groups (red herrings) and
  wordplay groups increase through to Saturday. Sunday: five groups.
- **Leaderboard**: fewest mistakes, ties by fastest time, then whoever finished first. The worker (`worker/`) rebuilds
  the puzzle from the date, judges every guess and times the game itself. Archive replays go on a separate "played
  later" board.
- **Play together**: inside the jacob.gg/play lobby the game posts groups found and mistakes (never words) to the room.

## Run it locally

```
npm install
npm run serve                                    # site on http://localhost:8086/
cd worker && npm install && rm -rf .wrangler && npm run db:init:local && npm run dev:local   # worker on 8871
```

Open `http://localhost:8086/?api=http://127.0.0.1:8871` (and `&hub=off` without the jacob.gg hub worker).

## Tests

```
npm test                       # bank format, two years of puzzles, golden days, judging and ranking
npm run review                 # bank overlaps to read by eye; --shared, --days 30
cd worker && npm test          # worker API, against dev:local
node tools/e2e-ui.mjs          # headless Chrome, phone + desktop, Play together iframe
```

## Deploy

- Database: the shared `words-leaderboard` D1 (also Lettrle's). `cd worker && npm run db:init` adds the `groupyle_*`
  tables (`CREATE TABLE IF NOT EXISTS`; it never touches other tables).
- Worker: `cd worker && npx wrangler deploy`. Redeploy whenever `site/js/daily.js` or `site/js/bank/` changes.
- Site: `git subtree split --prefix site -b gh-pages && git push -f origin gh-pages`.
