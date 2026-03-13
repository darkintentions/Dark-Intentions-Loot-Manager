/**
 * /api/loot-history
 * GET  — fetch all loot history from database
 * POST — store loot history items from RCLootCouncil
 */
import { ensureTablesExist } from '../db-init.js';

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
                name,
                icon,
                slot,
                quality,
                character_id,
                awarded_by_character_id,
                awarded_by_name,
                awarded_at,
                difficulty,
                discarded,
                same_response_amount,
                note,
                wish_value,
                response_type,
                bonus_ids,
                old_items,
                wish_data
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            )
            .bind(
              item.rclootcouncil_id,
              item.item_id,
              item.name,
              item.icon || '',
              item.slot || '',
              item.quality || '',
              item.character_id,
              item.awarded_by_character_id || null,
              item.awarded_by_name || '',
              item.awarded_at || '',
              item.difficulty || '',
              item.discarded ? 1 : 0,
              item.same_response_amount || 0,
              item.note || '',
              item.wish_value || 0,
              JSON.stringify(item.response_type || {}),
              JSON.stringify(item.bonus_ids || []),
              JSON.stringify(item.old_items || []),
              JSON.stringify(item.wish_data || [])
            )
            .run();
          insertedCount++;
        } catch (itemErr) {
          // Log error but continue with next item
          console.error(`Error inserting loot item ${item.rclootcouncil_id}:`, itemErr);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `✓ Stored ${insertedCount} loot history items`,
          inserted: insertedCount,
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
