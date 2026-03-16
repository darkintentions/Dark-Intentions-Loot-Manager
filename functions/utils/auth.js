export async function hashPassword(password) {
  const myText = new TextEncoder().encode(password);
  const myDigest = await crypto.subtle.digest({name: 'SHA-256'}, myText);
  const hashArray = Array.from(new Uint8Array(myDigest));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function generateSessionToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function getUserFromSession(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null; // No token provided
  }
  const token = authHeader.split(' ')[1];

  try {
    const session = await env.DB.prepare(`
      SELECT users.id, users.username, users.is_admin
      FROM sessions
      JOIN users ON sessions.user_id = users.id
      WHERE sessions.token = ? AND sessions.expires_at > datetime('now')
    `).bind(token).first();

    return session || null;
  } catch (err) {
    console.error('Session validation error:', err);
    return null;
  }
}
