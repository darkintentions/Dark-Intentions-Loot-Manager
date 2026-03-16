import { ensureTablesExist } from '../../db-init.js';

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  await ensureTablesExist(env);

  if (request.method === 'POST') {
    try {
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
      }

      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
