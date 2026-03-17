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
      const { name, ep, reason, timestamp } = await request.json();

      if (!name || ep === undefined) {
        return new Response(
          JSON.stringify({ error: 'Name and EP value are required' }),
          { status: 400, headers }
        );
      }

      await env.DB
        .prepare(
          'INSERT INTO ep_log (name, ep, reason, timestamp) VALUES (?, ?, ?, ?)'
        )
        .bind(name, ep, reason || '', timestamp || new Date().toISOString())
        .run();

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
