/**
 * /api/settings
 * GET  — returns the stored WoWAudit API key and default GP value
 * POST — saves a key/value setting to D1
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
      const rows = await env.DB
        .prepare("SELECT key, value FROM settings")
        .all();

      const settingsMap = {};
      for (const row of rows.results) {
        settingsMap[row.key] = row.value;
      }

      return new Response(
        JSON.stringify({
          api_key: settingsMap['wowaudit_api_key'] ?? '',
          default_gp: settingsMap['default_gp'] ?? '',
          enable_logging: settingsMap['enable_logging'] ?? 'false'
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

  // ── POST ─────────────────────────────────────────────────────
  if (request.method === 'POST') {
    try {
      const { key, value } = await request.json();
      if (!key) {
        return new Response(
          JSON.stringify({ error: 'Missing key' }),
          { status: 400, headers }
        );
      }
      await env.DB
        .prepare(
          "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))"
        )
        .bind(key, String(value ?? ''))
        .run();

      await logEvent(env, 'info', 'System', `Setting '${key}' was updated.`, { key, value });

      return new Response(
        JSON.stringify({ success: true, message: 'Setting saved successfully' }),
        { headers }
      );
    } catch (err) {
      await logEvent(env, 'error', 'API', `Failed to save setting: ${err.message}`);
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
