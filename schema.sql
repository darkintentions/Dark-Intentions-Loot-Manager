-- ============================================================
--  Dark Intentions Loot Manager — D1 Schema
--  Run against remote:  npm run db:init:remote
--  Run against local:   npm run db:init
-- ============================================================

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

-- ─── Seed: WoWAudit API Key ───────────────────────────────────
INSERT OR REPLACE INTO settings (key, value)
VALUES ('wowaudit_api_key', '62581957225650bd6cd7902ea6f45b3d175a372c524083d3eb30696260bc672d');

-- ─── Seed: All 16 WoW Gear Slots ─────────────────────────────
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
  ('Ring 1',    0),
  ('Ring 2',    0),
  ('Trinket 1', 0),
  ('Trinket 2', 0),
  ('Main Hand', 0),
  ('Off Hand',  0);
