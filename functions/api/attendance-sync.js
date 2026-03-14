import { ensureTablesExist } from '../db-init.js';

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

  if (request.method === 'POST') {
    try {
      // Get the WoWAudit API key from settings
      const settingsRow = await env.DB
        .prepare("SELECT value FROM settings WHERE key = 'wowaudit_api_key'")
        .first();

      const apiKey = settingsRow?.value;
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: 'WoWAudit API key not configured' }),
          { status: 400, headers }
        );
      }

      // Get week code from query parameters
      const url = new URL(request.url);
      const weekCode = url.searchParams.get('week_code');

      if (!weekCode) {
        return new Response(
          JSON.stringify({ error: 'week_code parameter required' }),
          { status: 400, headers }
        );
      }

      // Fetch raid data from WoWAudit
      const wowauditUrl = `https://wowaudit.com/v1/raids/${weekCode}`;
      const raidResponse = await fetch(wowauditUrl, {
        headers: {
          'accept': 'application/json',
          'Authorization': apiKey,
        },
      });

      if (!raidResponse.ok) {
        return new Response(
          JSON.stringify({ error: `WoWAudit API error: ${raidResponse.status}` }),
          { status: raidResponse.status, headers }
        );
      }

      const raidData = await raidResponse.json();

      // Extract signups
      const signups = raidData.signups || [];
      if (signups.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: 'No signups found', inserted: 0 }),
          { status: 200, headers }
        );
      }

      const raidDate = raidData.date || new Date().toISOString().split('T')[0];
      const raidInstance = raidData.instance || 'Unknown';

      let insertedCount = 0;

      // Store each signup
      for (const signup of signups) {
        const character = signup.character;
        try {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO attendance
            (week_code, raid_date, raid_instance, character_id, character_name, realm, class, role, status, selected, comment)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            weekCode,
            raidDate,
            raidInstance,
            character.id,
            character.name,
            character.realm,
            character.class,
            character.role,
            signup.status || 'Unknown',
            signup.selected ? 1 : 0,
            signup.comment || null
          ).run();
          insertedCount++;
        } catch (err) {
          console.error(`Error inserting signup for ${character.name}:`, err);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: `✓ Synced ${insertedCount} attendance records`,
          inserted: insertedCount,
        }),
        { status: 200, headers }
      );
    } catch (err) {
      console.error('Attendance sync error:', err);
      return new Response(
        JSON.stringify({ error: err.message || 'Failed to sync attendance' }),
        { status: 500, headers }
      );
    }
  }

  return new Response(
    JSON.stringify({ error: 'Method not allowed' }),
    { status: 405, headers }
  );
}
