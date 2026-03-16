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

      // We'll use the date from the first record as the snapshot date
      const snapshotDate = payload.length > 0 ? payload[0].date : new Date().toISOString();

      const statements = [];
      const presentNames = new Set(payload.map(p => p.name));

      for (const char of roster) {
        const fullName = `${char.name}-${char.realm}`;
        const attended = presentNames.has(fullName) ? 1 : 0;
        
        statements.push(
          env.DB.prepare(`
            INSERT OR REPLACE INTO attendance (name, realm, date, attended)
            VALUES (?, ?, ?, ?)
          `).bind(char.name, char.realm, snapshotDate, attended)
        );

        // Award +1 EP for being present
        if (attended) {
          statements.push(
            env.DB.prepare(`
              INSERT INTO ep_log (name, ep, reason, timestamp)
              VALUES (?, 1, ?, ?)
            `).bind(char.name, `On Time ${snapshotDate}`, snapshotDate)
          );
        }
      }

      await env.DB.batch(statements);
      await logEvent(env, 'info', 'Attendance', `Received attendance snapshot for ${snapshotDate}. ${payload.length} present out of ${roster.length} members.`);

      return new Response(JSON.stringify({ success: true, message: 'Attendance recorded' }), { status: 201, headers });
    }

    // ── GET — Fetch attendance records grouped by date ──────────
    if (request.method === 'GET') {
      // Get unique dates
      const { results: dates } = await env.DB.prepare(
        "SELECT DISTINCT date FROM attendance ORDER BY date DESC LIMIT 30"
      ).all();

      const snapshots = await Promise.all(dates.map(async (row) => {
        const { results: members } = await env.DB.prepare(
          "SELECT name, realm, attended FROM attendance WHERE date = ? ORDER BY name ASC"
        ).bind(row.date).all();
        
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
