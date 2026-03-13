/**
 * /api/epgp
 * GET  — returns all gear slot point values from D1
 * POST — saves updated point values for each gear slot
 */
import { ensureTablesExist } from '../db-init.js';

export async function onRequest({ request, env }) {
  const headers = { 'Content-Type': 'application/json' };

  // Ensure database tables exist on first use
  await ensureTablesExist(env);

  // ── GET ─────────────────────────────────────────────────────
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB
        .prepare(
          'SELECT id, slot_name, point_value FROM epgp_gear_values ORDER BY id ASC'
        )
        .all();
      return new Response(JSON.stringify({ gear_values: results }), { headers });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  // ── POST ─────────────────────────────────────────────────────
  if (request.method === 'POST') {
    try {
      const { gear_values } = await request.json();
      if (!Array.isArray(gear_values)) {
        return new Response(
          JSON.stringify({ error: 'Expected gear_values array' }),
          { status: 400, headers }
        );
      }

      const stmt = env.DB.prepare(
        "UPDATE epgp_gear_values SET point_value = ?, updated_at = datetime('now') WHERE slot_name = ?"
      );

      for (const item of gear_values) {
        await stmt
          .bind(parseInt(item.point_value, 10) || 0, item.slot_name)
          .run();
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Gear values saved successfully' }),
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
