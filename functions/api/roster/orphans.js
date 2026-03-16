import { ensureTablesExist } from '../../db-init.js';
import { getUserFromSession } from '../../utils/auth.js';

export async function onRequest({ request, env }) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  await ensureTablesExist(env);

  try {
    const user = await getUserFromSession(request, env);
    if (!user || user.is_admin !== 1) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    // Find names in ep_log, gp_log, and signups that are NOT in the roster table
    const query = `
      SELECT DISTINCT name FROM (
        SELECT name FROM ep_log
        UNION
        SELECT name FROM gp_log
        UNION
        SELECT character_name as name FROM signups
      ) 
      WHERE name NOT IN (SELECT name FROM roster)
      AND name != ''
      ORDER BY name ASC
    `;

    const { results } = await env.DB.prepare(query).all();
    const orphans = results.map(r => r.name);

    return new Response(JSON.stringify({ success: true, orphans }), { status: 200, headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
