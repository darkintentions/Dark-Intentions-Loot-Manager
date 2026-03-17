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
      const { name, names, gp, reason, timestamp } = await request.json();

      if ((!name && !names) || gp === undefined) {
        return new Response(
          JSON.stringify({ error: 'Name(s) and GP value are required' }),
          { status: 400, headers }
        );
      }

      const targetNames = names || [name];
      const statements = [];

      for (const charName of targetNames) {
        statements.push(
          env.DB.prepare(
            'INSERT INTO gp_log (name, gp, reason, timestamp) VALUES (?, ?, ?, ?)'
          ).bind(charName, gp, reason || '', timestamp || new Date().toISOString())
        );
      }

      await env.DB.batch(statements);

      const logMsg = targetNames.length > 1
        ? `Added ${gp} GP to ${targetNames.length} characters (Reason: ${reason || 'Manual Update'})`
        : `Added ${gp} GP to ${targetNames[0]} (Reason: ${reason || 'Manual Update'})`;

      await logEvent(env, 'success', 'EPGP', logMsg, { names: targetNames, reason, timestamp });

      return new Response(
        JSON.stringify({ success: true, message: 'GP entries added successfully' }),
        { headers }
      );
    } catch (err) {
      await logEvent(env, 'error', 'API', `Failed to add GP to bulk characters`, { error: err.message });
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
