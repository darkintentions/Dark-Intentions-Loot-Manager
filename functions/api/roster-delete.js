/**
 * /api/roster-delete
 * POST — permanently deletes all roster data and related logs
 *
 * Deletes:
 * - All characters from roster table
 * - All entries from ep_log table
 * - All entries from gp_log table
 */
import { ensureTablesExist } from '../db-init.js';

export async function onRequest({ request, env }) {
  const headers = { 'Content-Type': 'application/json' };

  // Ensure database tables exist on first use
  await ensureTablesExist(env);

  // ── POST — delete all roster data ────────────────────────────
  if (request.method === 'POST') {
    try {
      // Delete all entries from the logs
      try {
        await env.DB.prepare('DELETE FROM ep_log').run();
      } catch (e) {
        // ep_log table may not exist yet; ignore
      }

      try {
        await env.DB.prepare('DELETE FROM gp_log').run();
      } catch (e) {
        // gp_log table may not exist yet; ignore
      }

      // Delete all characters from roster
      await env.DB.prepare('DELETE FROM roster').run();

      return new Response(
        JSON.stringify({
          success: true,
          message: '✓ Roster and all related data permanently deleted',
        }),
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
