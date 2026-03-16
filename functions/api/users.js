import { ensureTablesExist } from '../db-init.js';
import { getUserFromSession, hashPassword } from '../utils/auth.js';

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  await ensureTablesExist(env);

  try {
    const user = await getUserFromSession(request, env);
    if (!user || user.is_admin !== 1) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    if (request.method === 'GET') {
      const { results } = await env.DB.prepare(
        "SELECT id, username, is_admin, created_at FROM users ORDER BY created_at DESC"
      ).all();
      
      return new Response(JSON.stringify({ success: true, users: results }), { status: 200, headers });
    }

    if (request.method === 'POST') {
      const { username, password, is_admin } = await request.json();
      
      if (!username || !password) {
        return new Response(JSON.stringify({ error: 'Username and password required' }), { status: 400, headers });
      }

      // Check for existing user
      const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
      if (existing) {
        return new Response(JSON.stringify({ error: 'Username already exists' }), { status: 400, headers });
      }

      const hash = await hashPassword(password);
      const adminVal = is_admin ? 1 : 0;

      await env.DB.prepare(
        "INSERT INTO users (username, password_hash, is_admin) VALUES (?, ?, ?)"
      ).bind(username, hash, adminVal).run();

      return new Response(JSON.stringify({ success: true, message: 'User created' }), { status: 201, headers });
    }

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
