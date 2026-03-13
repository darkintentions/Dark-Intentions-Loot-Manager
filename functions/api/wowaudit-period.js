/**
 * /api/wowaudit-period
 * GET  — fetch current WoWAudit period and store in database
 */
import { ensureTablesExist } from '../db-init.js';

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle OPTIONS pre-flight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  // Ensure database tables exist on first use
  await ensureTablesExist(env);

  // ── GET — fetch period from WoWAudit and store in database ────────────
  if (request.method === 'GET') {
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

      // Call WoWAudit API
      const wowauditUrl = 'https://wowaudit.com/v1/period';
      const response = await fetch(wowauditUrl, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'Authorization': apiKey,
        },
      });

      if (!response.ok) {
        return new Response(
          JSON.stringify({ error: `WoWAudit API error: ${response.status}` }),
          { status: response.status, headers }
        );
      }

      const periodData = await response.json();

      // Store in database using current_season.id
      const pId = periodData.current_season?.id;
      if (periodData && pId) {
        await env.DB
          .prepare(
            'INSERT OR REPLACE INTO wowaudit_period (period_id, data) VALUES (?, ?)'
          )
          .bind(pId, JSON.stringify(periodData))
          .run();
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: 'WoWAudit period data stored successfully',
          period: periodData,
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
