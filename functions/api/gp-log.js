/**
 * /api/gp-log
 * POST — adds an entry to the gp_log table
 */
import { ensureTablesExist } from '../db-init.js';

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

      return new Response(
        JSON.stringify({ success: true, message: 'GP entry added successfully' }),
        { headers }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
