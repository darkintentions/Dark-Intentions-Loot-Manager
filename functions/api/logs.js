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

  if (request.method === 'GET') {
    try {
      // Implement pagination limits to keep responses relatively small (last 300 logs max)
      const { results } = await env.DB.prepare(
        'SELECT * FROM system_logs ORDER BY timestamp DESC LIMIT 300'
      ).all();

      return new Response(
        JSON.stringify({ success: true, logs: results }),
        { status: 200, headers }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message || 'Failed to retrieve logs' }),
        { status: 500, headers }
      );
    }
  }

  if (request.method === 'DELETE') {
    try {
      await env.DB.prepare('DELETE FROM system_logs').run();
      return new Response(
        JSON.stringify({ success: true, message: 'System logs cleared' }),
        { status: 200, headers }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message || 'Failed to clear logs' }),
        { status: 500, headers }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405, headers });
}
