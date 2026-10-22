-- D1 schema for Groupyle's leaderboard. It lives in the shared `words-leaderboard` database (the free plan's last D1
-- slot, shared with Lettrle and future word games). Every table here starts with `groupyle_`; never touch another
-- game's tables, and no other game touches these.
--
-- The browser sends only the four words of each guess. The worker rebuilds the day's puzzle from the date
-- (site/js/daily.js and site/js/bank/, bundled at deploy), judges each guess itself, counts the mistakes, and times the
-- game from its own clock: started at /api/start, finished at the guess that found the last group (or made the 4th mistake).

CREATE TABLE IF NOT EXISTS groupyle_players (
  id         TEXT PRIMARY KEY,   -- server-generated UUID
  token_hash TEXT NOT NULL,      -- SHA-256 of a server-issued session token
  created_at TEXT NOT NULL
);

-- One row per player per puzzle day, made at the start and updated as guesses arrive (the hub counts plays from
-- here: rowid, player_id, day_key, is_late, started_at).
CREATE TABLE IF NOT EXISTS groupyle_games (
  player_id    TEXT NOT NULL REFERENCES groupyle_players (id),
  day_key      TEXT NOT NULL,                  -- puzzle's UTC day, YYYY-MM-DD
  is_late      INTEGER NOT NULL DEFAULT 0,     -- 1 = started after its day (archive replay), decided by the server
  display_name TEXT NOT NULL,
  guesses      TEXT NOT NULL DEFAULT '',       -- guesses in order, ';'-separated; each is 4 board positions, ','-separated
  results      TEXT NOT NULL DEFAULT '',       -- one character per guess: group index found, 'o' one away, 'x' a miss
  n            INTEGER NOT NULL DEFAULT 0,     -- guesses made
  groups       INTEGER NOT NULL,               -- 4, or 5 on Sundays
  found        INTEGER NOT NULL DEFAULT 0,
  mistakes     INTEGER NOT NULL DEFAULT 0 CHECK (mistakes >= 0 AND mistakes <= 4),
  finished     INTEGER NOT NULL DEFAULT 0,
  solved       INTEGER NOT NULL DEFAULT 0,
  rank_n       INTEGER,                        -- rankKey() in daily.js, smaller is better; set when finished
  ms           INTEGER,                        -- server-timed, start to finish
  started_at   TEXT NOT NULL,
  finished_at  TEXT,
  UNIQUE (player_id, day_key)
);
CREATE INDEX IF NOT EXISTS groupyle_games_board ON groupyle_games (day_key, is_late, finished, rank_n, ms, finished_at);

-- Per-day counters for the board header and the archive list (D1 free plan: keep running totals, don't scan).
CREATE TABLE IF NOT EXISTS groupyle_day_stats (
  day_key  TEXT NOT NULL,
  is_late  INTEGER NOT NULL,
  players  INTEGER NOT NULL DEFAULT 0,   -- started
  finished INTEGER NOT NULL DEFAULT 0,
  solved   INTEGER NOT NULL DEFAULT 0,
  perfect  INTEGER NOT NULL DEFAULT 0,   -- solved with no mistakes
  PRIMARY KEY (day_key, is_late)
);
