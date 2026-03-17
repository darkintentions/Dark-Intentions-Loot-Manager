/**
 * /api/character-delete
 * POST — permanently deletes a single character and all their related data
 *
 * Query params:
 * - name: character name to delete
 *
 * Deletes:
 * - Character from roster table
 * - All entries from ep_log table for that character
 * - All entries from gp_log table for that character
 */
import { ensureTablesExist } from '../db-init.js';
import { logEvent } from '../utils/logger.js';

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle OPTIONS pre-flight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // Ensure database tables exist on first use
  await ensureTablesExist(env);

  // ── POST — delete a single character ────────────────────────────
  if (request.method === 'POST') {
    try {
      const url = new URL(request.url);
      const characterName = url.searchParams.get('name');

      if (!characterName || characterName.trim() === '') {
        return new Response(
          JSON.stringify({ error: 'Character name is required' }),
          { status: 400, headers }
        );
      }

      let deletedCounts = {};

      // Delete entries from ep_log
      try {
        const epResult = await env.DB
          .prepare('DELETE FROM ep_log WHERE name = ?')
          .bind(characterName)
          .run();
        deletedCounts.ep_log = epResult.meta.changes ?? 0;
      } catch (e) {
        deletedCounts.ep_log = 0;
      }

      // Delete entries from gp_log
      try {
        const gpResult = await env.DB
          .prepare('DELETE FROM gp_log WHERE name = ?')
          .bind(characterName)
          .run();
        deletedCounts.gp_log = gpResult.meta.changes ?? 0;
      } catch (e) {
        deletedCounts.gp_log = 0;
      }

      // Delete character from roster
      const checkResult = await env.DB
        .prepare('SELECT name FROM roster WHERE name = ?')
        .bind(characterName)
        .first();

      if (!checkResult) {
        return new Response(
          JSON.stringify({ error: 'Character not found' }),
          { status: 404, headers }
        );
      }

      const rosterResult = await env.DB
        .prepare('DELETE FROM roster WHERE name = ?')
        .bind(characterName)
        .run();
      deletedCounts.roster = rosterResult.meta.changes ?? 0;

      // Log the character deletion
      await logEvent(env, 'warning', 'Admin', `Permanently deleted character "${characterName}" (${deletedCounts.ep_log + deletedCounts.gp_log} EP/GP logs)`);

      return new Response(
        JSON.stringify({
          success: true,
          message: `✓ Character "${characterName}" and all related data permanently deleted`,
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
