/**
 * /api/epgp
 * GET  — returns all gear slot point values from D1
 * POST — saves updated point values for each gear slot
 */
import { ensureTablesExist } from '../db-init.js';
import { logEvent } from '../utils/logger.js';

export async function onRequest({ request, env }) {
  const headers = { 'Content-Type': 'application/json' };

  // Ensure database tables exist on first use
  await ensureTablesExist(env);

  // ── GET ─────────────────────────────────────────────────────
  if (request.method === 'GET') {
    try {
      const { results: gearValues } = await env.DB
        .prepare(
          'SELECT id, slot_name, point_value FROM epgp_gear_values ORDER BY id ASC'
        )
        .all();

      // Also get vault settings
      const settingKeys = ['min_vault_level', 'vault_1_ep', 'vault_2_ep', 'vault_3_ep', 'signup_ep', 'on_time_ep'];
      const vaultSettings = {};
      
      const { results: settingsRows } = await env.DB
        .prepare("SELECT key, value FROM settings WHERE key IN (?, ?, ?, ?, ?, ?)")
        .bind(...settingKeys)
        .all();

      settingsRows.forEach(row => {
        vaultSettings[row.key] = row.value;
      });

      return new Response(JSON.stringify({ 
        gear_values: gearValues,
        vault_settings: vaultSettings
      }), { headers });
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  // ── POST ─────────────────────────────────────────────────────
  if (request.method === 'POST') {
    try {
      const { gear_values, vault_settings } = await request.json();
      
      const statements = [];

      if (Array.isArray(gear_values)) {
        const gearStmt = env.DB.prepare(
          "UPDATE epgp_gear_values SET point_value = ?, updated_at = datetime('now') WHERE slot_name = ?"
        );
        for (const item of gear_values) {
          statements.push(gearStmt.bind(parseInt(item.point_value, 10) || 0, item.slot_name));
        }
      }

      if (vault_settings && typeof vault_settings === 'object') {
        const vaultStmt = env.DB.prepare(
          "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))"
        );
        for (const [key, value] of Object.entries(vault_settings)) {
          if (['min_vault_level', 'vault_1_ep', 'vault_2_ep', 'vault_3_ep', 'signup_ep', 'on_time_ep'].includes(key)) {
            statements.push(vaultStmt.bind(key, String(value)));
          }
        }
      }

      if (statements.length > 0) {
        await env.DB.batch(statements);
        await logEvent(env, 'info', 'System', 'EPGP gear values and/or vault settings were updated manually.');
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Settings saved successfully' }),
        { headers }
      );
    } catch (err) {
      await logEvent(env, 'error', 'API', `Failed to update gear values: ${err.message}`);
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
