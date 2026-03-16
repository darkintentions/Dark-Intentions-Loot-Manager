import { ensureTablesExist } from '../../db-init.js';
import { getUserFromSession } from '../../utils/auth.js';

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  await ensureTablesExist(env);

  if (request.method === 'GET') {
    try {
      const user = await getUserFromSession(request, env);
      
      if (!user) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
      }

      return new Response(JSON.stringify({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          is_admin: user.is_admin === 1
        }
      }), { status: 200, headers });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
