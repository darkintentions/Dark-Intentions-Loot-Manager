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

export async function onRequest({ request, env }) {
  const headers = { 'Content-Type': 'application/json' };

  // Ensure database tables exist on first use
  await ensureTablesExist(env);

  // ── GET — return stored roster ───────────────────────────────
  if (request.method === 'GET') {
    try {
      const { results } = await env.DB
        .prepare('SELECT * FROM roster ORDER BY name ASC')
        .all();
      return new Response(JSON.stringify({ roster: results }), { headers });
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

      // Replace roster with fresh data
      await env.DB.prepare('DELETE FROM roster').run();

      const stmt = env.DB.prepare(`
        INSERT INTO roster
          (character_id, name, realm, class, spec, role, rank, rank_name, ilvl, ep, gp, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const c of chars) {
        await stmt
          .bind(
            c.id             ?? c.character_id          ?? null,
            c.name           ?? 'Unknown',
            c.realm          ?? c.realm_slug             ?? null,
            c.class          ?? c.character_class         ?? null,
            c.spec           ?? c.active_spec_name        ?? null,
            c.role           ?? null,
            c.rank           ?? c.guild_rank              ?? null,
            c.rank_name      ?? null,
            c.ilvl           ?? c.item_level ?? c.average_item_level ?? null,
            0,               // ep: default to 0
            defaultGp,       // gp: use default from settings
            c.status         ?? (c.is_inactive ? 'inactive' : 'active')
          )
          .run();
      }

      return new Response(
        JSON.stringify({
          success: true,
          count: chars.length,
          message: `Synced ${chars.length} characters from WoWAudit`,
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
