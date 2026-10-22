# How a day's puzzle is built

`puzzle(day)` in `site/js/daily.js`. Everything is seeded from the date, so every browser and the worker build the
same board, and nothing outside the repo is needed.

## The weekday plan

| Day | Groups | Tiers (1 obvious … 4 wordplay) | Look-alike pairs |
| --- | --- | --- | --- |
| Monday | 4 | 1 1 1 2 | exactly 0 |
| Tuesday | 4 | 1 1 2 2 | 0–1 |
| Wednesday | 4 | 1 2 2 3 | exactly 1 |
| Thursday | 4 | 1 2 3 3 | 1–2 |
| Friday | 4 | 2 2 3 4 | 2–3 |
| Saturday | 4 | 2 3 4 4 | 3 or more |
| Sunday special | 5 | 1 2 2 3 4 | 2 or more |

A look-alike pair is two of the day's categories that share a family (docs/bank.md), such as Roman gods and Planets,
or two hidden-word groups. They are the red herrings: the groups look as if they could swap words. They never actually
can, because no word on the board fits two groups.

## Picking the categories

1. **Queues.** Each tier has a queue of its categories, shuffled from the start of an *era* (13 weeks from `EPOCH`).
   Every day has its own place in each tier's queue, one day after another, so a category comes round again only
   after the whole queue has (about 11–14 weeks, depending on the tier). When an era ends, the next one carries the
   queue on from where it stopped and slots newly added categories in at seeded places, so a bank that grows never
   reshuffles past days.
2. **Own pick or stand-in.** Each slot takes the category at its own place if that keeps the day fair: every chosen
   group still has at least four words that fit no other chosen group, and the look-alike pairs stay within the day's
   maximum. If not, it takes a stand-in from as far round the queue as possible (half a lap), which is nobody's turn
   for weeks either way.
3. **Red herrings.** While the day has fewer look-alike pairs than its minimum, one slot is swapped for a stand-in
   that shares a family with the others, again from as far round the queue as possible.
4. **No recent repeats.** Days are grouped in blocks of seven from `EPOCH`. A day never uses a category that an
   earlier day of its block used, nor one used in the three blocks before. Knowing exactly what the earlier blocks used
   would chain every day back to `EPOCH`, so the earlier blocks are looked at as a slightly simpler build saw them
   (the same rule with one level less of looking back, four levels deep). The work stays bounded (about 150 ms the
   first time in a browser, then cached), and in two years of days no category comes back within 16 days.
5. **Words.** For each group, the words that fit no other chosen group (not in its `words`, `also` or `rule`) are
   shuffled and four are shown. The board is shuffled.

The worker doesn't build days live: building a day cold costs more CPU than the Workers free plan allows per request.
`worker/build-days.mjs` bakes three years of days from this same code into `worker/src/days.js` before every deploy
(wrangler's `[build]` step), and the worker builds a day live only outside that range.

The tests (`test/daily.test.mjs`) check two years of days: tiers follow the plan, no word fits two groups, Mondays
have no look-alikes, at most 2% of days fall short of their minimum look-alikes, no category comes back within two
weeks, and at most 10 within three.

## Changing the bank without changing the past

A day depends only on the bank as it stood on that day (`added` dates and errata up to the day) and on the queues of
its era, which were fixed at the era's start. So:
- **New categories** get an `added` day after tomorrow. They join the queues at the next era start.
- **Fixes** to a live category go in `site/js/bank/errata.js` with a `from` day after tomorrow: `remove` a member (it
  stays a clash guard), add `also` words, or `retire` the category.
- `npm run golden` re-records `test/golden.json` for days after tomorrow, and refuses if an earlier day would change.
  `npm test` fails if any recorded day changed.
