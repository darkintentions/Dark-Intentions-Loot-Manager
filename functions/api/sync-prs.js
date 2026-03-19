import { ensureTablesExist } from '../db-init.js';

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers });
  }

  await ensureTablesExist(env);

  try {
    const now = new Date().toISOString();
    
    // Update the last_pr_sync setting
    await env.DB.prepare("UPDATE settings SET value = ? WHERE key = 'last_pr_sync'")
      .bind(now)
      .run();

    return new Response(
      JSON.stringify({ success: true, last_pr_sync: now }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to sync PRs' }),
      { status: 500, headers }
    );
  }
}
