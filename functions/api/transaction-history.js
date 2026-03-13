/**
 * /api/transaction-history
 * GET  — fetch EP and GP transaction history for a character
 * PUT  — update a single transaction (amount, reason, timestamp)
 * DELETE — delete a single transaction
 */
import { ensureTablesExist } from '../db-init.js';

export async function onRequest({ request, env }) {
  const headers = { 'Content-Type': 'application/json' };

  // Ensure database tables exist on first use
  await ensureTablesExist(env);

  // ── GET — return all transactions for a character ────────────────
  if (request.method === 'GET') {
    try {
      const url = new URL(request.url);
      const characterName = url.searchParams.get('name');

      if (!characterName) {
        return new Response(
          JSON.stringify({ error: 'Character name required' }),
          { status: 400, headers }
        );
      }

      // Fetch EP transactions
      const epResult = await env.DB
        .prepare('SELECT id, name, ep as amount, reason, timestamp FROM ep_log WHERE name = ? ORDER BY timestamp DESC')
        .bind(characterName)
        .all();

      // Fetch GP transactions
      const gpResult = await env.DB
        .prepare('SELECT id, name, gp as amount, reason, timestamp FROM gp_log WHERE name = ? ORDER BY timestamp DESC')
        .bind(characterName)
        .all();

      // Combine and sort by timestamp
      const transactions = [
        ...(epResult.results || []).map(t => ({ ...t, type: 'ep' })),
        ...(gpResult.results || []).map(t => ({ ...t, type: 'gp' })),
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

      return new Response(
        JSON.stringify({ transactions }),
        { headers }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  // ── PUT — update a transaction ─────────────────────────────────
  if (request.method === 'PUT') {
    try {
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/');
      const transactionId = pathParts[pathParts.length - 2];
      const transactionType = pathParts[pathParts.length - 1];

      // Validate type
      if (!['ep', 'gp'].includes(transactionType)) {
        return new Response(
          JSON.stringify({ error: 'Invalid transaction type. Must be "ep" or "gp".' }),
          { status: 400, headers }
        );
      }

      const body = await request.json();
      const { amount, reason, timestamp } = body;

      // Validate amount
      if (amount === undefined || isNaN(parseInt(amount))) {
        return new Response(
          JSON.stringify({ error: 'Valid amount is required' }),
          { status: 400, headers }
        );
      }

      // Determine table based on type
      const table = transactionType === 'ep' ? 'ep_log' : 'gp_log';
      const column = transactionType === 'ep' ? 'ep' : 'gp';

      // Verify transaction exists
      const checkResult = await env.DB
        .prepare(`SELECT id FROM ${table} WHERE id = ?`)
        .bind(parseInt(transactionId))
        .first();

      if (!checkResult) {
        return new Response(
          JSON.stringify({ error: 'Transaction not found' }),
          { status: 404, headers }
        );
      }

      // Update transaction
      await env.DB
        .prepare(`UPDATE ${table} SET ${column} = ?, reason = ?, timestamp = ? WHERE id = ?`)
        .bind(parseInt(amount), reason || '', timestamp || '', parseInt(transactionId))
        .run();

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Transaction updated successfully',
        }),
        { headers }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  // ── DELETE — delete a transaction ──────────────────────────────
  if (request.method === 'DELETE') {
    try {
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/');
      const transactionId = pathParts[pathParts.length - 2];
      const transactionType = pathParts[pathParts.length - 1];

      // Validate type
      if (!['ep', 'gp'].includes(transactionType)) {
        return new Response(
          JSON.stringify({ error: 'Invalid transaction type. Must be "ep" or "gp".' }),
          { status: 400, headers }
        );
      }

      // Determine table based on type
      const table = transactionType === 'ep' ? 'ep_log' : 'gp_log';

      // Verify transaction exists
      const checkResult = await env.DB
        .prepare(`SELECT id FROM ${table} WHERE id = ?`)
        .bind(parseInt(transactionId))
        .first();

      if (!checkResult) {
        return new Response(
          JSON.stringify({ error: 'Transaction not found' }),
          { status: 404, headers }
        );
      }

      // Delete transaction
      await env.DB
        .prepare(`DELETE FROM ${table} WHERE id = ?`)
        .bind(parseInt(transactionId))
        .run();

      return new Response(
        JSON.stringify({
          success: true,
          message: 'Transaction deleted successfully',
        }),
        { headers }
      );
    } catch (err) {
      return new Response(
        JSON.stringify({ error: err.message }),
        { status: 500, headers }
      );
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
}
