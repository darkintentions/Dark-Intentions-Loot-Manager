/**
 * /api/sync-loot-from-wowaudit
 * POST — fetch loot history from WoWAudit and store in database
 *
 * Process:
 * 1. Fetch WoWAudit API key from settings
 * 2. Call https://wowaudit.com/v1/period to get the current period
 * 3. Store the period data in wowaudit_period table
 * 4. Call https://wowaudit.com/v1/loot_history/{period_id}
 * 5. Parse response and store in loot_history table
 */
import { ensureTablesExist } from '../db-init.js';

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle OPTIONS pre-flight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // Ensure database tables exist on first use
  await ensureTablesExist(env);

  // ── POST — sync loot from WoWAudit ──────────────────────────────────
  if (request.method === 'POST') {
    try {
      // Get WoWAudit API key from settings
      const settingsResult = await env.DB
        .prepare('SELECT value FROM settings WHERE key = ?')
        .bind('wowaudit_api_key')
        .first();

      if (!settingsResult || !settingsResult.value) {
        return new Response(
          JSON.stringify({ error: 'WoWAudit API key not configured' }),
          { status: 400, headers }
        );
      }

      const apiKey = settingsResult.value;

      // Step 1: Fetch current period from WoWAudit
      const periodResponse = await fetch('https://wowaudit.com/v1/period', {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'Authorization': apiKey,
        },
      });

      if (!periodResponse.ok) {
        return new Response(
          JSON.stringify({ error: `WoWAudit period API error: ${periodResponse.status}` }),
          { status: periodResponse.status, headers }
        );
      }

      const periodData = await periodResponse.json();

      // Extract season id from WoWAudit response (under current_season.id)
      const periodId = periodData.current_season?.id;

      if (!periodId) {
        return new Response(
          JSON.stringify({
            error: 'Could not determine period ID from WoWAudit response',
            periodData,
          }),
          { status: 400, headers }
        );
      }

      // Store the period data in the database
      try {
        await env.DB
          .prepare('INSERT OR REPLACE INTO wowaudit_period (period_id, data) VALUES (?, ?)')
          .bind(periodId, JSON.stringify(periodData))
          .run();
      } catch (e) {
        // Non-fatal, continue with loot sync
        console.error('Failed to store period data:', e);
      }

      // Step 2: Fetch loot history using the period_id
      const lootUrl = `https://wowaudit.com/v1/loot_history/${periodId}`;
      const lootResponse = await fetch(lootUrl, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'Authorization': apiKey,
        },
      });

      if (!lootResponse.ok) {
        return new Response(
          JSON.stringify({ error: `WoWAudit loot API error: ${lootResponse.status}` }),
          { status: lootResponse.status, headers }
        );
      }

      const lootData = await lootResponse.json();
      const historyItems = lootData.history_items || [];

      if (!Array.isArray(historyItems)) {
        return new Response(
          JSON.stringify({ error: 'Invalid loot history format from WoWAudit' }),
          { status: 400, headers }
        );
      }

      // Store each loot item in database
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
          console.error(
            `Error inserting loot item ${item.rclootcouncil_id}:`,
            itemErr
          );
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `✓ Synced ${insertedCount} loot items from WoWAudit (Period ${periodId})`,
          inserted: insertedCount,
          periodId,
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
