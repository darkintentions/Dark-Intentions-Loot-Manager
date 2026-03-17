import { ensureTablesExist } from '../db-init.js';
import { getUserFromSession } from '../utils/auth.js';
import { logEvent } from '../utils/logger.js';

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  await ensureTablesExist(env);

  try {
    // ── POST — Receive data from DI Monitor ──────────────────────
    if (request.method === 'POST') {
      const payload = await request.json(); // Array: [{ name: "Char-Server", date: "..." }]
      
      if (!Array.isArray(payload)) {
        return new Response(JSON.stringify({ error: 'Payload must be an array' }), { status: 400, headers });
      }

      // Get current roster to determine who is "missing"
      const { results: roster } = await env.DB.prepare("SELECT name, realm FROM roster").all();
      
      if (roster.length === 0) {
        return new Response(JSON.stringify({ error: 'Roster is empty. Sync roster first.' }), { status: 400, headers });
      }

      // Normalize dates
      const snapshotTimestamp = payload.length > 0 ? payload[0].date : new Date().toISOString();
      const onlyDate = snapshotTimestamp.split(' ')[0]; // Assumes "YYYY-MM-DD HH:MM:SS"

      // 1. Filter Snapshot re-upload (exactly the same file)
      const existingSnapshot = await env.DB.prepare("SELECT id FROM attendance WHERE snapshot_timestamp = ? LIMIT 1")
        .bind(snapshotTimestamp)
        .first();

      if (existingSnapshot) {
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'This exact snapshot has already been processed.' 
        }), { status: 200, headers });
      }

      const statements = [];
      const presentNames = new Set(payload.map(p => p.name));

      for (const char of roster) {
        const fullName = `${char.name}-${char.realm}`;
        const isPresent = presentNames.has(fullName);
        const attended = isPresent ? 1 : 0;
        
        // 2. Check if this character already has an entry for this calendar day
        const existingDaily = await env.DB.prepare(`
          SELECT id FROM attendance 
          WHERE name = ? AND realm = ? AND date = ? 
          LIMIT 1
        `).bind(char.name, char.realm, onlyDate).first();

        // If a record for this person + day already exists, skip processing them entirely
        if (existingDaily) continue;

        // Record attendance for this day
        statements.push(
          env.DB.prepare(`
            INSERT INTO attendance (name, realm, date, snapshot_timestamp, attended)
            VALUES (?, ?, ?, ?, ?)
          `).bind(char.name, char.realm, onlyDate, snapshotTimestamp, attended)
        );

        // Award Configured EP for being present (only once per day)
        if (isPresent) {
          statements.push(
            env.DB.prepare(`
              INSERT INTO ep_log (name, ep, reason, timestamp)
              VALUES (?, ?, ?, ?)
            `).bind(char.name, onTimeEp, `${onTimeReason} ${onlyDate}`, onlyDate)
          );
        }
      }

      // Fetch settings
      const { results: settingsRows } = await env.DB
        .prepare("SELECT key, value FROM settings WHERE key IN ('on_time_ep', 'on_time_reason')")
        .all();
      const settings = {};
      settingsRows.forEach(row => settings[row.key] = row.value);
      const onTimeEp = parseInt(settings.on_time_ep, 10) || 1;
      const onTimeReason = settings.on_time_reason || 'Early Sign Up';

      const presentNamesList = payload.map(p => p.name);

      if (statements.length > 0) {
        await env.DB.batch(statements);
        const logMsg = `Awarded ${onTimeEp} EP to ${presentNamesList.length} characters (Reason: ${onTimeReason} ${onlyDate})`;
        await logEvent(env, 'info', 'On Time', logMsg, { names: presentNamesList, snapshot: snapshotTimestamp });
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: statements.length > 0 ? 'Attendance recorded' : 'All members already processed for this day' 
      }), { status: 201, headers });
    }

    // ── GET — Fetch attendance records grouped by date ──────────
    if (request.method === 'GET') {
      // Get unique dates
      const { results: dates } = await env.DB.prepare(
        "SELECT DISTINCT date FROM attendance ORDER BY date DESC LIMIT 30"
      ).all();

      const snapshots = await Promise.all(dates.map(async (row) => {
        const { results: members } = await env.DB.prepare(`
          SELECT a.name, a.realm, a.attended, r.class 
          FROM attendance a
          LEFT JOIN roster r ON a.name = r.name AND (a.realm = r.realm OR a.realm IS NULL OR r.realm IS NULL)
          WHERE a.date = ? 
          ORDER BY a.name ASC
        `).bind(row.date).all();
        
        return {
          date: row.date,
          members
        };
      }));

      return new Response(JSON.stringify({ success: true, snapshots }), { status: 200, headers });
    }

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
