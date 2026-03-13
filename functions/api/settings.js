/**
 * /api/settings
 * GET  — returns the stored WoWAudit API key
 * POST — saves a key/value setting to D1
 */
import { ensureTablesExist } from '../db-init.js';

export async function onRequest({ request, env }) {
  const headers = { 'Content-Type': 'application/json' };

  // Ensure database tables exist on first use
  await ensureTablesExist(env);

  // ── GET ─────────────────────────────────────────────────────
  if (request.method === 'GET') {
    try {
      const row = await env.DB
        .prepare("SELECT value FROM settings WHERE key = 'wowaudit_api_key'")
        .first();
      return new Response(
        JSON.stringify({ api_key: row?.value ?? '' }),
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
      return new Response(
        JSON.stringify({ success: true, message: 'Setting saved successfully' }),
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
