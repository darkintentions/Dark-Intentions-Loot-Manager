/**
 * Initialize D1 database tables on first use
 * Runs the schema automatically if tables don't exist
 *
 * ⚠️  IMPORTANT: Keep schema.sql in sync!
 * When modifying this schema, also update schema.sql to match.
 * schema.sql is used for manual remote database initialization.
 * Keeping them in sync ensures fresh deployments work correctly.
 */
export async function ensureTablesExist(env) {
  try {
    // Check if tables exist
    const result = await env.DB
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='epgp_gear_values'")
      .first();

    if (!result) {
      // Tables don't exist, create them
      await initializeDatabase(env);
    }
  } catch (err) {
    // If there's an error, try to initialize
    await initializeDatabase(env);
  }
}

async function initializeDatabase(env) {
  const schema = `
    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY NOT NULL,
      value      TEXT NOT NULL DEFAULT '',
      updated_at TEXT DEFAULT (datetime('now'))
    );

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

    CREATE TABLE IF NOT EXISTS epgp_gear_values (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      slot_name   TEXT NOT NULL UNIQUE,
      point_value INTEGER NOT NULL DEFAULT 0,
      updated_at  TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS ep_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT DEFAULT '',
      ep        INTEGER DEFAULT 0,
      reason    TEXT DEFAULT '',
      timestamp TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS gp_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      name      TEXT DEFAULT '',
      gp        INTEGER DEFAULT 0,
      reason    TEXT DEFAULT '',
      timestamp TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS custom_ep_buttons (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT DEFAULT '',
      ep          INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT DEFAULT (datetime('now'))
    );

    INSERT OR REPLACE INTO settings (key, value)
    VALUES
      ('wowaudit_api_key', '62581957225650bd6cd7902ea6f45b3d175a372c524083d3eb30696260bc672d'),
      ('default_gp', '2');

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
  `;

  // Execute each statement separately
  for (const statement of schema.split(';').filter(s => s.trim())) {
    try {
      await env.DB.prepare(statement.trim()).run();
    } catch (err) {
      // Ignore errors (likely duplicate key errors on INSERT OR IGNORE)
    }
  }
}
