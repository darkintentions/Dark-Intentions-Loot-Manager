/**
 * /api/loot-history
 * GET  — fetch all loot history from database
 * POST — store loot history items from RCLootCouncil
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

  // ── GET — fetch all loot history ────────────────────────────────────
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const characterId = url.searchParams.get('character_id');

      let query = 'SELECT * FROM loot_history ORDER BY awarded_at DESC';
      let params = [];

      if (characterId) {
        query += ' WHERE character_id = ?';
        params = [parseInt(characterId)];
      }

      const result = params.length > 0
        ? await env.DB.prepare(query).bind(...params).all()
        : await env.DB.prepare(query).all();

      // Parse JSON fields for each item
      const items = (result.results || []).map(item => ({
        ...item,
        response_type: item.response_type ? JSON.parse(item.response_type) : null,
        bonus_ids: item.bonus_ids ? JSON.parse(item.bonus_ids) : [],
        old_items: item.old_items ? JSON.parse(item.old_items) : [],
        wish_data: item.wish_data ? JSON.parse(item.wish_data) : [],
      }));

      return new Response(
        JSON.stringify({ history_items: items }),
        { headers }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  // ── POST — store loot history items ──────────────────────────────────
  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const historyItems = body.history_items || [];

      if (!Array.isArray(historyItems)) {
        return new Response(
          JSON.stringify({ error: 'history_items must be an array' }),
          { status: 400, headers }
        );
      }

      let insertedCount = 0;

      for (const item of historyItems) {
        try {
          await env.DB
            .prepare(
              `INSERT OR REPLACE INTO loot_history (
                rclootcouncil_id,
                item_id,
                slot,
                character_id,
                awarded_by_name,
                awarded_at,
                difficulty,
                instance,
                boss,
                typeCode,
                note,
                wish_value,
                bonus_ids,
                wish_data
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              item.rclootcouncil_id,
              item.item_id,
              item.slot || '',
              item.character_id,
              item.awarded_by_name || '',
              item.awarded_at || '',
              item.difficulty || '',
              item.instance || '',
              item.boss || '',
              item.typeCode || '',
              item.note || '',
              item.wish_value || 0,
              JSON.stringify(item.bonus_ids || []),
              JSON.stringify(item.wish_data || [])
            )
            .run();
          insertedCount++;
        } catch (itemErr) {
          // Log error but continue with next item
          console.error(`Error inserting loot item ${item.rclootcouncil_id}:`, itemErr);
        }
      }

      await logEvent(env, 'success', 'Loot', `Stored ${insertedCount} loot history items`, { inserted: insertedCount });

      return new Response(
        JSON.stringify({
          success: true,
          message: `✓ Stored ${insertedCount} loot history items`,
          inserted: insertedCount,
        }),
        { headers }
      );
    } catch (err) {
      await logEvent(env, 'error', 'API', `Loot history manual storage failed: ${err.message}`);
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
