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
import { logEvent } from '../utils/logger.js';

export async function onRequest({ request, env }) {
  const headers = { 'Content-Type': 'application/json' };

  // Ensure database tables exist on first use
  await ensureTablesExist(env);

  // ── POST — delete all roster data ────────────────────────────
  if (request.method === 'POST') {
    try {
      let deletedCounts = {};

      // Delete all entries from ep_log
      try {
        const epResult = await env.DB.prepare('DELETE FROM ep_log').run();
        deletedCounts.ep_log = epResult.meta.changes ?? 0;
      } catch (e) {
        // ep_log table may not exist yet; ignore
        deletedCounts.ep_log = 0;
      }

      // Delete all entries from gp_log
      try {
        const gpResult = await env.DB.prepare('DELETE FROM gp_log').run();
        deletedCounts.gp_log = gpResult.meta.changes ?? 0;
      } catch (e) {
        // gp_log table may not exist yet; ignore
        deletedCounts.gp_log = 0;
      }

      try {
        const rosterResult = await env.DB.prepare('DELETE FROM roster').run();
        deletedCounts.roster = rosterResult.meta.changes ?? 0;
      } catch (e) {
        deletedCounts.roster = 0;
        throw new Error(`Failed to delete roster: ${e.message}`);
      }

      // Log the mass deletion
      await logEvent(env, 'warning', 'Admin', `Permanently deleted entire roster (${deletedCounts.roster} characters, ${deletedCounts.ep_log + deletedCounts.gp_log} EP/GP logs)`);

      return new Response(
        JSON.stringify({
          success: true,
          message: '✓ Roster and all related data permanently deleted',
          deleted: deletedCounts,
        }),
        { headers }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({
          success: false,
          error: err.message
        }),
        { status: 500, headers }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
