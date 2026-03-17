-- ============================================================
--  Dark Intentions Loot Manager — D1 Schema
--  Run against remote:  npm run db:init:remote
--  Run against local:   npm run db:init
-- ============================================================
--
-- ⚠️  IMPORTANT: Keep in sync with functions/db-init.js!
-- When modifying the database schema, update BOTH files:
--   1. functions/db-init.js (automatic initialization on first request)
--   2. schema.sql (manual initialization for fresh deployments)
-- Keeping them in sync ensures all environments (local, dev, prod) work correctly.
--

-- ─── Settings (key/value store) ──────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY NOT NULL,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TEXT DEFAULT (datetime('now'))
);

-- ─── Guild Roster ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roster (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER,
  name         TEXT NOT NULL,
  realm        TEXT,
  class        TEXT,
  spec         TEXT,
  role         TEXT,
  rank         INTEGER,
  rank_name    TEXT,
  ilvl         REAL,
  status       TEXT DEFAULT 'active',
  last_updated TEXT DEFAULT (datetime('now'))
);

-- ─── EPGP Gear Slot Point Values ──────────────────────────────
CREATE TABLE IF NOT EXISTS epgp_gear_values (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slot_name   TEXT NOT NULL UNIQUE,
  point_value INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ─── EP Transaction Log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS ep_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT DEFAULT '',
  ep        INTEGER DEFAULT 0,
  reason    TEXT DEFAULT '',
  timestamp TEXT DEFAULT ''
);

-- ─── GP Transaction Log ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS gp_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  name      TEXT DEFAULT '',
  gp        INTEGER DEFAULT 0,
  reason    TEXT DEFAULT '',
  timestamp TEXT DEFAULT ''
);

-- ─── Custom EP Buttons ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS custom_ep_buttons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  ep          INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

-- ─── Seed: WoWAudit API Key ──────────────────────────────────
INSERT OR REPLACE INTO settings (key, value)
VALUES
  ('wowaudit_api_key', '62581957225650bd6cd7902ea6f45b3d175a372c524083d3eb30696260bc672d'),
  ('default_gp', '2'),
  ('min_vault_level', '272'),
  ('vault_1_ep', '1'),
  ('vault_2_ep', '1'),
  ('vault_3_ep', '1'),
  ('signup_ep', '1'),
  ('on_time_ep', '1');

-- ─── Seed: All 15 WoW Gear Slots ─────────────────────────────
INSERT OR IGNORE INTO epgp_gear_values (slot_name, point_value) VALUES
  ('Head',      0),
  ('Neck',      0),
  ('Shoulder',  0),
  ('Back',      0),
  ('Chest',     0),
  ('Wrist',     0),
  ('Hands',     0),
  ('Waist',     0),
  ('Legs',      0),
  ('Feet',      0),
  ('Ring',      0),
  ('Trinket',   0),
  ('Main Hand', 0),
  ('Off Hand',  0),
  ('Tier',      0),
  ('Ranged',    0);

-- ─── WoWAudit Period ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wowaudit_period (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id   INTEGER NOT NULL UNIQUE,
  data        TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ─── Loot History ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loot_history (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  rclootcouncil_id        TEXT NOT NULL UNIQUE,
  item_id                 INTEGER NOT NULL,
  name                    TEXT NOT NULL,
  icon                    TEXT,
  slot                    TEXT,
  quality                 TEXT,
  character_id            INTEGER NOT NULL,
  awarded_by_character_id INTEGER,
  awarded_by_name         TEXT,
  awarded_at              TEXT,
  difficulty              TEXT,
  discarded               BOOLEAN DEFAULT 0,
  same_response_amount    INTEGER DEFAULT 0,
  note                    TEXT,
  wish_value              INTEGER DEFAULT 0,
  response_type           TEXT,
  bonus_ids               TEXT,
  old_items               TEXT,
  wish_data               TEXT,
  updated_at              TEXT DEFAULT (datetime('now'))
);

-- ─── Signups ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS signups (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  raid_id        INTEGER NOT NULL,
  date           TEXT NOT NULL,
  character_name TEXT NOT NULL,
  class          TEXT,
  status         TEXT,
  ep_awarded     BOOLEAN DEFAULT 0,
  UNIQUE(raid_id, character_name)
);

-- ─── Historical Activity ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS historical_activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  period_id   INTEGER NOT NULL UNIQUE,
  data        TEXT NOT NULL,
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- ─── Authentication & Users ───────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin      BOOLEAN DEFAULT 0,
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token         TEXT PRIMARY KEY,
  user_id       INTEGER NOT NULL,
  expires_at    TEXT NOT NULL
);

-- ─── System Logs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS system_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp  TEXT DEFAULT (datetime('now')),
  level      TEXT DEFAULT 'info',
  category   TEXT NOT NULL,
  message    TEXT NOT NULL,
  details    TEXT
);

-- ─── Attendance Tracking ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  name               TEXT NOT NULL,
  realm              TEXT NOT NULL,
  date               TEXT NOT NULL,
  snapshot_timestamp TEXT,
  attended           BOOLEAN NOT NULL,
  UNIQUE(name, realm, date)
);
