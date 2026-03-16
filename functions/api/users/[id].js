import { ensureTablesExist } from '../../db-init.js';
import { getUserFromSession, hashPassword } from '../../utils/auth.js';

export async function onRequest({ request, params, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'PUT, DELETE, OPTIONS',
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

    const userId = params.id;

    if (request.method === 'PUT') {
      const data = await request.json();
      
      let query = "UPDATE users SET ";
      const bindings = [];
      const updates = [];

      if (data.is_admin !== undefined) {
        updates.push("is_admin = ?");
        bindings.push(data.is_admin ? 1 : 0);
      }

      if (data.password) {
        updates.push("password_hash = ?");
        bindings.push(await hashPassword(data.password));
      }

      if (updates.length === 0) {
        return new Response(JSON.stringify({ error: 'No fields to update' }), { status: 400, headers });
      }

      query += updates.join(', ') + " WHERE id = ?";
      bindings.push(userId);

      await env.DB.prepare(query).bind(...bindings).run();
      
      // If admin status changed and it's not the user themselves, or password changed, we might want to invalidate their sessions,
      // but simple approach is fine for now.

      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }

    if (request.method === 'DELETE') {
      if (parseInt(userId) === user.id) {
         return new Response(JSON.stringify({ error: 'Cannot delete your own account' }), { status: 400, headers });
      }
      await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(userId).run();
      await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId).run();
      return new Response(JSON.stringify({ success: true }), { status: 200, headers });
    }

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }

  return new Response('Method Not Allowed', { status: 405 });
}
