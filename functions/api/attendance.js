import { ensureTablesExist } from '../db-init.js';

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  await ensureTablesExist(env);

  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const weekCode = url.searchParams.get('week_code');

      if (!weekCode) {
        return new Response(
          JSON.stringify({ error: 'week_code parameter required' }),
          { status: 400, headers }
        );
      }

      const records = await env.DB.prepare(
        `SELECT * FROM attendance WHERE week_code = ? ORDER BY character_name ASC`
      ).bind(weekCode).all();

      return new Response(
        JSON.stringify({
          success: true,
          week_code: weekCode,
          attendance: records.results || [],
        }),
        { status: 200, headers }
      );
    } catch (err) {
      console.error('Attendance fetch error:', err);
      return new Response(
        JSON.stringify({ error: err.message || 'Failed to fetch attendance' }),
        { status: 500, headers }
      );
    }
  }

  return new Response(
    JSON.stringify({ error: 'Method not allowed' }),
    { status: 405, headers }
  );
}
