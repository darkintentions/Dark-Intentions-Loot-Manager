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
import { logEvent } from '../utils/logger.js';

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
        await logEvent(env, 'error', 'System', 'Attempted Loot Sync but WoWAudit API key is missing.');
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
        await logEvent(env, 'error', 'API', `Loot Sync: WoWAudit period API error ${periodResponse.status}`);
        return new Response(
          JSON.stringify({ error: `WoWAudit period API error: ${periodResponse.status}` }),
          { status: periodResponse.status, headers }
        );
      }

      const periodData = await periodResponse.json();

      // Extract season id from WoWAudit response (using keystone_season_id for loot mapping)
      const periodId = periodData.keystone_season_id;

      if (!periodId) {
        await logEvent(env, 'error', 'API', 'Loot Sync: Could not determine period ID.', { periodData });
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

      // Pre-fetch roster for name lookup (ID -> Name)
      const { results: rosterRows } = await env.DB.prepare("SELECT character_id, name FROM roster WHERE character_id IS NOT NULL").all();
      const characterMap = new Map();
      for (const row of rosterRows) {
        characterMap.set(Number(row.character_id), row.name);
      }

      // Pre-fetch gear values for GP lookup (Slot -> Points)
      const { results: gearRows } = await env.DB.prepare("SELECT slot_name, point_value FROM epgp_gear_values").all();
      const gearMap = new Map();
      for (const row of gearRows) {
        gearMap.set(row.slot_name.toLowerCase(), row.point_value);
      }

      // Check for already processed items to avoid double charging GP
      const { results: existingLoot } = await env.DB.prepare("SELECT rclootcouncil_id FROM loot_history").all();
      const existingIds = new Set(existingLoot.map(l => l.rclootcouncil_id));

      let insertedCount = 0;
      let gpAwardedCount = 0;
      const now = new Date().toISOString();

      for (const item of historyItems) {
        // Skip loot with "Normal" difficulty
        /* Temporarily disabled for testing
        if (item.difficulty && item.difficulty.toLowerCase() === 'normal') {
          continue;
        }
        */

        // Only process and award GP for NEW items
        if (existingIds.has(item.rclootcouncil_id)) {
          continue;
        }

        try {
          const charName = characterMap.get(Number(item.character_id));
          const slotKey = (item.slot || '').toLowerCase();
          const gpAmount = gearMap.get(slotKey) || 0;

          // Award GP if we have a character and a non-zero GP value
          if (charName && gpAmount > 0) {
            await env.DB.prepare(`
              INSERT INTO gp_log (name, gp, reason, timestamp)
              VALUES (?, ?, ?, ?)
            `)
              .bind(charName, gpAmount, `Awarded ${item.name} (Loot History)`, now)
              .run();
            gpAwardedCount++;
          }

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
                instance,
                boss,
                discarded,
                same_response_amount,
                note,
                wish_value,
                response_type,
                bonus_ids,
                old_items,
                wish_data
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
              item.instance_name || item.zone || '',
              item.encounter_name || item.boss || '',
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

      await logEvent(env, 'success', 'Loot', `Synced ${insertedCount} loot items from WoWAudit (${gpAwardedCount} GP awards)`, { periodId, insertedCount, gpAwardedCount });

      return new Response(
        JSON.stringify({
          success: true,
          message: `✓ Synced ${insertedCount} loot items and awarded GP for ${gpAwardedCount} items (Period ${periodId})`,
          inserted: insertedCount,
          gpAwarded: gpAwardedCount,
          periodId,
        }),
        { headers }
      );
    } catch (err) {
      await logEvent(env, 'error', 'API', `Loot sync failed: ${err.message}`);
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
