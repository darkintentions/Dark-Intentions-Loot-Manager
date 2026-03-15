import { ensureTablesExist } from '../db-init.js';
import { logEvent } from '../utils/logger.js';

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  await ensureTablesExist(env);

  // Allow GET and POST for cron/testing flexibility
  if (request.method === 'POST' || request.method === 'GET') {
    try {
      // 1. Get WoWAudit API key
      const settingsRow = await env.DB
        .prepare("SELECT value FROM settings WHERE key = 'wowaudit_api_key'")
        .first();
      const apiKey = settingsRow?.value;

      if (!apiKey) {
        return new Response(JSON.stringify({ error: 'WoWAudit API key not configured' }), { status: 400, headers });
      }

      // 2. Fetch current period to check start_date
      const periodUrl = 'https://wowaudit.com/v1/period';
      const pRes = await fetch(periodUrl, {
        headers: { 'accept': 'application/json', 'Authorization': apiKey }
      });

      if (!pRes.ok) {
        throw new Error(`WoWAudit Period API error: ${pRes.status}`);
      }

      const periodData = await pRes.json();
      const currentPeriodId = periodData.current_season?.id;
      const startDateStr = periodData.current_season?.start_date; // Expected "YYYY-MM-DD"

      if (!currentPeriodId) {
        throw new Error('Could not find current period ID from WoWAudit.');
      }

      // Check if today is the start_date
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];

      if (startDateStr === todayStr) {
        await logEvent(env, 'info', 'API', 'Historical Sync: Skipped because today is the start of a new raid week.');
        return new Response(JSON.stringify({ 
          success: true, 
          message: 'Skipped: Today matches the start_date of the new period.',
          today: todayStr,
          start_date: startDateStr
        }), { status: 200, headers });
      }

      // 3. Fetch Historical Data for previous period (period_id - 1)
      const historicalPeriodId = currentPeriodId - 1;
      const historicalUrl = `https://wowaudit.com/v1/historical_data?period=${historicalPeriodId}`;
      const hRes = await fetch(historicalUrl, {
        headers: { 'accept': 'application/json', 'Authorization': apiKey }
      });

      if (!hRes.ok) {
        throw new Error(`WoWAudit Historical API error: ${hRes.status}`);
      }

      const historicalData = await hRes.json();
      const characters = historicalData.characters || [];

      // 4. Save raw historical data to DB
      await env.DB.prepare(
        'INSERT OR REPLACE INTO historical_activity (period_id, data) VALUES (?, ?)'
      ).bind(historicalPeriodId, JSON.stringify(historicalData)).run();

      // 5. Calculate EP and Award
      let charactersProcessed = 0;
      let totalEpAwarded = 0;

      for (const char of characters) {
        const dungeons = char.data?.vault_options?.dungeons || {};
        let epToAward = 0;

        // Check option_1, option_2, option_3 for value 272
        if (dungeons.option_1 === 272) epToAward++;
        if (dungeons.option_2 === 272) epToAward++;
        if (dungeons.option_3 === 272) epToAward++;

        const reason = epToAward > 0 
          ? `${epToAward} Maxed Dungeon Vault Slots Filled` 
          : "No level 10 Keys Ran";

        // Award EP if character is in roster
        const rosterChar = await env.DB.prepare(
          "SELECT id, ep FROM roster WHERE name = ?"
        ).bind(char.name).first();

        if (rosterChar) {
          const newEp = (rosterChar.ep || 0) + epToAward;
          
          // Update Roster EP
          await env.DB.prepare(
            "UPDATE roster SET ep = ? WHERE id = ?"
          ).bind(newEp, rosterChar.id).run();

          // Log transaction
          await env.DB.prepare(
             "INSERT INTO ep_log (name, ep, reason, timestamp) VALUES (?, ?, ?, datetime('now'))"
          ).bind(char.name, epToAward, reason).run();

          charactersProcessed++;
          totalEpAwarded += epToAward;
        }
      }

      const summary = `Processed ${charactersProcessed} characters. Total EP Awarded: ${totalEpAwarded}.`;
      await logEvent(env, 'success', 'Roster', `Historical Activity Sync Complete: Period ${historicalPeriodId}`, { 
        period: historicalPeriodId,
        processed: charactersProcessed,
        total_ep: totalEpAwarded
      });

      return new Response(JSON.stringify({
        success: true,
        message: summary,
        period: historicalPeriodId,
        processed: charactersProcessed,
        total_ep: totalEpAwarded
      }), { status: 200, headers });

    } catch (err) {
      console.error('Historical sync error:', err);
      await logEvent(env, 'error', 'API', `Historical Activity Sync failed: ${err.message}`);
      return new Response(JSON.stringify({ error: err.message || 'Failed to sync historical activity' }), { status: 500, headers });
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers });
}
