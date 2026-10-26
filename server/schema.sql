CREATE TABLE IF NOT EXISTS scores (
  user_id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS scores_by_score ON scores (score DESC, updated ASC);
