import { ensureTablesExist } from '../../db-init.js';
import { hashPassword, generateSessionToken } from '../../utils/auth.js';

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  await ensureTablesExist(env);

  if (request.method === 'POST') {
    try {
      const { username, password } = await request.json();
      if (!username || !password) {
        return new Response(JSON.stringify({ error: 'Username and password are required' }), { status: 400, headers });
      }

      const hash = await hashPassword(password);
      
      const user = await env.DB.prepare(
        "SELECT id, username, is_admin FROM users WHERE username = ? AND password_hash = ?"
      ).bind(username, hash).first();

      if (!user) {
        return new Response(JSON.stringify({ error: 'Invalid username or password' }), { status: 401, headers });
      }

      // Generate session token valid for 7 days
      const token = await generateSessionToken();
      await env.DB.prepare(
        "INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, datetime('now', '+7 days'))"
      ).bind(token, user.id).run();

      return new Response(JSON.stringify({
        success: true,
        token,
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
