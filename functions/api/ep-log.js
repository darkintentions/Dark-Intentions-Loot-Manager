/**
 * /api/ep-log
 * POST — adds an entry to the ep_log table
 */
import { ensureTablesExist } from '../db-init.js';
import { logEvent } from '../utils/logger.js';

export async function onRequest({ request, env }) {
  const headers = { 'Content-Type': 'application/json' };

  // Ensure database tables exist on first use
  await ensureTablesExist(env);

  // ── POST ─────────────────────────────────────────────────────
  if (request.method === 'POST') {
    try {
      const { name, ep, reason, timestamp, isSpecial, specialDate } = await request.json();

      if (!name || ep === undefined) {
        return new Response(
          JSON.stringify({ error: 'Name and EP value are required' }),
          { status: 400, headers }
        );
      }

      const statements = [];
      const awardDate = specialDate || (timestamp ? timestamp.split('T')[0] : new Date().toISOString().split('T')[0]);

      // 1. Insert into ep_log
      statements.push(
        env.DB.prepare(
          'INSERT INTO ep_log (name, ep, reason, timestamp) VALUES (?, ?, ?, ?)'
        ).bind(name, ep, reason || '', timestamp || new Date().toISOString())
      );

      // 2. Cross-integration logic
      if (isSpecial) {
        // Fetch settings to know which reason is which
        const { results: settingsRows } = await env.DB
          .prepare("SELECT key, value FROM settings WHERE key IN ('signup_reason', 'on_time_reason')")
          .all();
        const signupReason = settingsRows.find(r => r.key === 'signup_reason')?.value || 'On Time';
        const onTimeReason = settingsRows.find(r => r.key === 'on_time_reason')?.value || 'Early Sign Up';

        const characterRes = await env.DB.prepare("SELECT name, realm, class FROM roster WHERE name = ?").bind(name).first();

        if (reason === signupReason) {
            // A simple numeric hash for raid_id based on the date string
            const raidId = Math.abs(awardDate.split('').reduce((a,b)=>{a=((a<<5)-a)+b.charCodeAt(0);return a&a},0));
            statements.push(
                env.DB.prepare(`
                    INSERT OR REPLACE INTO signups (raid_id, date, character_name, class, status, ep_awarded)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).bind(raidId, awardDate, name, characterRes?.class || 'Unknown', 'Accepted', 1)
            );
        } else if (reason === onTimeReason) {
            statements.push(
                env.DB.prepare(`
                    INSERT OR REPLACE INTO attendance (name, realm, date, snapshot_timestamp, attended)
                    VALUES (?, ?, ?, ?, ?)
                `).bind(name, characterRes?.realm || 'Unknown', awardDate, new Date().toISOString(), 1)
            );
        }
      }

      await env.DB.batch(statements);

      await logEvent(env, 'success', 'EPGP', `Awarded ${ep} EP to ${name} (Reason: ${reason || 'Manual Update'})`, { reason, timestamp });

      return new Response(
        JSON.stringify({ success: true, message: 'EP entry added successfully' }),
        { headers }
      );
    } catch (err) {
      await logEvent(env, 'error', 'API', `Failed to award EP to ${name || 'Unknown'}`, { error: err.message });
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
