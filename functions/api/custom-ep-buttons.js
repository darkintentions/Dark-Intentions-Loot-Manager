import { ensureTablesExist } from '../db-init.js';

export async function onRequest(context) {
  const { request, env } = context;

  // Ensure database tables exist
  await ensureTablesExist(env);

  if (request.method === 'GET') {
    try {
      const buttons = await env.DB
        .prepare('SELECT id, name, description, ep FROM custom_ep_buttons ORDER BY id')
        .all();

      return new Response(JSON.stringify(buttons.results || []), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('Error fetching custom EP buttons:', err);
      return new Response(JSON.stringify({ error: 'Failed to fetch buttons' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (request.method === 'POST') {
    try {
      const body = await request.json();
      const { name, description, ep } = body;

      if (!name || ep === undefined) {
        return new Response(
          JSON.stringify({ error: 'Name and EP are required' }),
          {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      await env.DB
        .prepare(
          'INSERT INTO custom_ep_buttons (name, description, ep) VALUES (?, ?, ?)'
        )
        .bind(name, description || '', parseInt(ep))
        .run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('Error creating custom EP button:', err);
      return new Response(
        JSON.stringify({ error: err.message || 'Failed to create button' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  }

  return new Response('Method not allowed', { status: 405 });
}
