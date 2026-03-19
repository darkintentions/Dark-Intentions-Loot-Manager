import { ensureTablesExist } from '../db-init.js';

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  await ensureTablesExist(env);

  try {
    // Check the latest timestamp across roster, ep_log, and gp_log
    const rosterRes = await env.DB.prepare('SELECT MAX(last_updated) as t FROM roster').first();
    const epRes = await env.DB.prepare('SELECT MAX(timestamp) as t FROM ep_log').first();
    const gpRes = await env.DB.prepare('SELECT MAX(timestamp) as t FROM gp_log').first();
    const syncRes = await env.DB.prepare("SELECT value FROM settings WHERE key = 'last_pr_sync'").first();

    const timestamps = [
      rosterRes?.t ? new Date(rosterRes.t).getTime() : 0,
      epRes?.t ? new Date(epRes.t).getTime() : 0,
      gpRes?.t ? new Date(gpRes.t).getTime() : 0,
      syncRes?.value ? new Date(syncRes.value).getTime() : 0,
    ];

    const maxTs = Math.max(...timestamps);
    const lastUpdated = maxTs > 0 ? new Date(maxTs).toISOString() : null;

    return new Response(
      JSON.stringify({ success: true, last_updated: lastUpdated }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message || 'Failed to get last updated timestamp' }),
      { status: 500, headers }
    );
  }
}
