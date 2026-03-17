import { ensureTablesExist } from '../db-init.js';
import { getUserFromSession } from '../utils/auth.js';
import { logEvent } from '../utils/logger.js';

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

  try {
    const user = await getUserFromSession(request, env);
    if (!user || user.is_admin !== 1) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const { oldName, newName } = await request.json();

    if (!oldName || !newName) {
      return new Response(JSON.stringify({ error: 'Source (orphan) and target (roster) names are required' }), { status: 400, headers });
    }

    // Start a transaction-like sequence (Cloudflare D1 batch)
    // We ONLY update logs because 'oldName' is an orphan and 'newName' already exists in the roster.
    
    const statements = [
      // Update EP logs
      env.DB.prepare("UPDATE ep_log SET name = ? WHERE name = ?")
        .bind(newName, oldName),
      
      // Update GP logs
      env.DB.prepare("UPDATE gp_log SET name = ? WHERE name = ?")
        .bind(newName, oldName),
      
      // Update Signups
      env.DB.prepare("UPDATE signups SET character_name = ? WHERE character_name = ?")
        .bind(newName, oldName)
    ];

    const results = await env.DB.batch(statements);

    // results[0] -> EP logs, results[1] -> GP logs, results[2] -> Signups
    const epChanges = results[0]?.meta?.changes ?? 0;
    const gpChanges = results[1]?.meta?.changes ?? 0;
    const signupChanges = results[2]?.meta?.changes ?? 0;

    await logEvent(env, 'info', 'Admin', `Merged historical logs from orphan "${oldName}" into "${newName}" (${epChanges} EP logs, ${gpChanges} GP logs, ${signupChanges} signups).`);

    return new Response(JSON.stringify({ 
      success: true, 
      message: `Successfully merged ${oldName}'s history into ${newName}` 
    }), { status: 200, headers });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
}
