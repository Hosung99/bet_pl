CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL,
  nickname VARCHAR(20),
  password_hash TEXT NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'MEMBER' CHECK (role IN ('ADMIN', 'MEMBER')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  balance BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(100);

ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname VARCHAR(20);
UPDATE users SET nickname = LEFT(username, 20) WHERE nickname IS NULL;
ALTER TABLE users ALTER COLUMN nickname SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username));

CREATE TABLE IF NOT EXISTS sessions (
  token_hash CHAR(64) PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS matches (
  id BIGINT PRIMARY KEY,
  matchday INTEGER,
  utc_date TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL,
  home_team_id BIGINT,
  home_team_name TEXT NOT NULL,
  home_team_crest TEXT,
  away_team_id BIGINT,
  away_team_name TEXT NOT NULL,
  away_team_crest TEXT,
  home_score INTEGER,
  away_score INTEGER,
  winner VARCHAR(4) CHECK (winner IS NULL OR winner IN ('HOME', 'DRAW', 'AWAY')),
  carryover BIGINT NOT NULL DEFAULT 0 CHECK (carryover >= 0),
  settled_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS matches_utc_date_idx ON matches(utc_date);

CREATE TABLE IF NOT EXISTS bets (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  match_id BIGINT NOT NULL REFERENCES matches(id),
  prediction VARCHAR(4) NOT NULL CHECK (prediction IN ('HOME', 'DRAW', 'AWAY')),
  stake BIGINT NOT NULL CHECK (stake > 0),
  status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'WON', 'LOST', 'CANCELLED')),
  payout BIGINT NOT NULL DEFAULT 0 CHECK (payout >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, match_id)
);

CREATE INDEX IF NOT EXISTS bets_match_id_idx ON bets(match_id);
CREATE INDEX IF NOT EXISTS bets_user_id_idx ON bets(user_id);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  bet_id BIGINT NOT NULL REFERENCES bets(id) ON DELETE CASCADE,
  result VARCHAR(4) NOT NULL CHECK (result IN ('WON', 'LOST')),
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bet_id)
);

ALTER TABLE notifications DROP COLUMN IF EXISTS user_id;
CREATE INDEX IF NOT EXISTS notifications_created_idx ON notifications(created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS point_transactions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  amount BIGINT NOT NULL CHECK (amount <> 0),
  kind VARCHAR(30) NOT NULL,
  ref_type VARCHAR(20),
  ref_id TEXT,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS point_transactions_user_id_idx ON point_transactions(user_id, created_at DESC);

-- Legacy name retained so old and new server instances can coexist during deployment.
-- week_start stores the Seoul attendance date for the current daily grant rule.
CREATE TABLE IF NOT EXISTS weekly_grants (
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  amount BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, week_start)
);

DO $$
BEGIN
  IF to_regclass('attendance_grants') IS NOT NULL THEN
    INSERT INTO weekly_grants (user_id, week_start, amount)
    SELECT user_id, attendance_date, amount FROM attendance_grants
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS settlements (
  match_id BIGINT PRIMARY KEY REFERENCES matches(id),
  result VARCHAR(4) NOT NULL CHECK (result IN ('HOME', 'DRAW', 'AWAY')),
  bet_pool BIGINT NOT NULL,
  carryover_in BIGINT NOT NULL,
  carryover_out BIGINT NOT NULL,
  carryover_target_match_id BIGINT REFERENCES matches(id),
  settled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_state (key, value)
VALUES ('unassigned_carryover', '{"amount": 0}'::jsonb)
ON CONFLICT (key) DO NOTHING;
