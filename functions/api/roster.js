/**
 * /api/roster
 * GET  — returns the stored roster from D1
 * POST — syncs roster from WoWAudit API and stores it in D1
 *
 * WoWAudit API call:
 *   GET https://wowaudit.com/v1/characters
 *   Header: Authorization: <api_key>
 */
import { ensureTablesExist } from '../db-init.js';
import { logEvent } from '../utils/logger.js';

export async function onRequest({ request, env }) {
  const headers = { 'Content-Type': 'application/json' };

  // Ensure database tables exist on first use
  await ensureTablesExist(env);

  // ── GET — return stored roster with calculated EP/GP totals ──────
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB
        .prepare('SELECT * FROM roster ORDER BY name ASC')
        .all();

      // Calculate EP and GP totals from logs for each character
      const rosterWithTotals = await Promise.all(
        results.map(async (character) => {
          let ep = 0;
          let gp = 0;

          try {
            // Sum EP from ep_log
            const epResult = await env.DB
              .prepare('SELECT COALESCE(SUM(ep), 0) as total_ep FROM ep_log WHERE name = ?')
              .bind(character.name)
              .first();
            ep = epResult?.total_ep ?? 0;
          } catch (e) {
            // ep_log table may not exist yet; default to 0
            ep = 0;
          }

          try {
            // Sum GP from gp_log
            const gpResult = await env.DB
              .prepare('SELECT COALESCE(SUM(gp), 0) as total_gp FROM gp_log WHERE name = ?')
              .bind(character.name)
              .first();
            gp = gpResult?.total_gp ?? 0;
          } catch (e) {
            // gp_log table may not exist yet; default to 0
            gp = 0;
          }

          return {
            ...character,
            ep,
            gp,
          };
        })
      );

      const count = rosterWithTotals.length;
      await logEvent(env, 'info', 'API', `Roster data fetched (${count} character${count === 1 ? '' : 's'} found).`);
      return new Response(JSON.stringify({ roster: rosterWithTotals }), { headers });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  // ── POST — sync from WoWAudit ────────────────────────────────
  if (request.method === 'POST') {
    try {
      // Retrieve API key from settings
      const row = await env.DB
        .prepare("SELECT value FROM settings WHERE key = 'wowaudit_api_key'")
        .first();

      if (!row?.value) {
        return new Response(
          JSON.stringify({
            error: 'WoWAudit API key not configured. Set it in the Admin panel.'
          }),
          { status: 400, headers }
        );
      }

      // Call WoWAudit
      const wowRes = await fetch('https://wowaudit.com/v1/characters', {
        headers: {
          accept: 'application/json',
          Authorization: row.value,
        },
      });

      if (!wowRes.ok) {
        const body = await wowRes.text();
        return new Response(
          JSON.stringify({
            error: `WoWAudit API error: ${wowRes.status}`,
            details: body,
          }),
          { status: wowRes.status, headers }
        );
      }

      const payload = await wowRes.json();
      // API may return array or { characters: [...] }
      const chars = Array.isArray(payload)
        ? payload
        : (payload.characters ?? payload.data ?? []);

      // Get default GP value from settings
      const defaultGpRow = await env.DB
        .prepare("SELECT value FROM settings WHERE key = 'default_gp'")
        .first();
      const defaultGp = defaultGpRow?.value ? parseInt(defaultGpRow.value) : 2;

      // Get existing roster to check for new characters
      let existingRoster = [];
      try {
        const { results } = await env.DB
          .prepare('SELECT name FROM roster')
          .all();
        existingRoster = (results || []).map(r => r.name);
      } catch (e) {
        // Table doesn't exist yet, all characters are new
        existingRoster = [];
      }

      // Replace roster with fresh data
      await env.DB.prepare('DELETE FROM roster').run();

      const stmt = env.DB.prepare(`
        INSERT INTO roster
          (character_id, name, realm, class, spec, role, rank, rank_name, ilvl, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const now = new Date().toISOString();

      for (const c of chars) {
        const charName = c.name ?? 'Unknown';
        const isNewCharacter = !existingRoster.includes(charName);

        // Insert into roster
        await stmt
          .bind(
            c.id             ?? c.character_id          ?? null,
            charName,
            c.realm          ?? c.realm_slug             ?? null,
            c.class          ?? c.character_class         ?? null,
            c.spec           ?? c.active_spec_name        ?? null,
            c.role           ?? null,
            c.rank           ?? c.guild_rank              ?? null,
            c.rank_name      ?? null,
            c.ilvl           ?? c.item_level ?? c.average_item_level ?? null,
            c.status         ?? (c.is_inactive ? 'inactive' : 'active')
          )
          .run();

        // Add initial GP log entry ONLY for new characters
        if (isNewCharacter) {
          try {
            await env.DB.prepare(`
              INSERT INTO gp_log (name, gp, reason, timestamp)
              VALUES (?, ?, ?, ?)
            `)
              .bind(charName, defaultGp, 'Initial GP on roster sync', now)
              .run();
          } catch (e) {
            // gp_log table may not exist yet; ignore
          }
        }
      }

      await logEvent(env, 'success', 'Roster', `Synced ${chars.length} characters from WoWAudit`);
      return new Response(
        JSON.stringify({
          success: true,
          count: chars.length,
          message: `Synced ${chars.length} characters from WoWAudit with ${defaultGp} GP each`,
        }),
        { headers }
      );
    } catch (err) {
      await logEvent(env, 'error', 'API', `WoWAudit Roster sync failed: ${err.message}`);
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
