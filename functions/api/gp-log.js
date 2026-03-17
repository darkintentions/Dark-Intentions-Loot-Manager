/**
 * /api/gp-log
 * POST — adds an entry to the gp_log table
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
      const { name, gp, reason, timestamp } = await request.json();

      if (!name || gp === undefined) {
        return new Response(
          JSON.stringify({ error: 'Name and GP value are required' }),
          { status: 400, headers }
        );
      }

      await env.DB
        .prepare(
          'INSERT INTO gp_log (name, gp, reason, timestamp) VALUES (?, ?, ?, ?)'
        )
        .bind(name, gp, reason || '', timestamp || new Date().toISOString())
        .run();

      await logEvent(env, 'success', 'EPGP', `Added ${gp} GP to ${name} (Reason: ${reason || 'Manual Update'})`, { reason, timestamp });

      return new Response(
        JSON.stringify({ success: true, message: 'GP entry added successfully' }),
        { headers }
      );
    } catch (err) {
      await logEvent(env, 'error', 'API', `Failed to add GP to ${name || 'Unknown'}`, { error: err.message });
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
