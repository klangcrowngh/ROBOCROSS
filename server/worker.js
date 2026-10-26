// Robo Cross leaderboard: Cloudflare Worker + D1.
//   GET  /top?limit=50&me=<telegram user id>  -> { top: [{ name, score }], me: { rank, score } | null }
//   POST /score { initData, score }           -> keeps the player's best score
// Players are identified only through Telegram's signed initData (checked with the bot token),
// so nobody can write a score for someone else. Editing the table is possible only from your
// Cloudflare account (D1 console).

const json = (data, headers, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, 'content-type': 'application/json' } });

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, typeof data === 'string' ? new TextEncoder().encode(data) : data));
}
const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');

// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
async function verify(initData, botToken) {
  if (!initData || !botToken) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = await hmac(new TextEncoder().encode('WebAppData'), botToken);
  if (hex(await hmac(secret, check)) !== hash) return null;
  try { return JSON.parse(params.get('user')); } catch { return null; }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });

    try {
      if (url.pathname === '/top' && req.method === 'GET') {
        const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 50));
        const { results } = await env.DB
          .prepare('SELECT name, score FROM scores ORDER BY score DESC, updated ASC LIMIT ?')
          .bind(limit).all();
        let me = null;
        const id = url.searchParams.get('me');
        if (id) {
          const row = await env.DB.prepare('SELECT score FROM scores WHERE user_id = ?').bind(id).first();
          if (row) {
            const above = await env.DB.prepare('SELECT COUNT(*) AS c FROM scores WHERE score > ?').bind(row.score).first();
            me = { rank: above.c + 1, score: row.score };
          }
        }
        return json({ top: results, me }, cors);
      }

      if (url.pathname === '/score' && req.method === 'POST') {
        const { initData, score } = await req.json();
        const user = await verify(initData, env.BOT_TOKEN);
        if (!user || !user.id) return json({ error: 'bad signature' }, cors, 403);
        const s = Math.floor(Number(score));
        if (!Number.isFinite(s) || s < 0) return json({ error: 'bad score' }, cors, 400);
        const name = ([user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Робот').slice(0, 40);
        await env.DB.prepare(
          `INSERT INTO scores (user_id, name, username, score, updated) VALUES (?1, ?2, ?3, ?4, ?5)
           ON CONFLICT(user_id) DO UPDATE SET
             name = ?2, username = ?3,
             updated = CASE WHEN ?4 > score THEN ?5 ELSE updated END,
             score = MAX(score, ?4)`,
        ).bind(user.id, name, user.username ?? null, s, Date.now()).run();
        return json({ ok: true }, cors);
      }

      return json({ error: 'not found' }, cors, 404);
    } catch (e) {
      return json({ error: 'server' }, cors, 500);
    }
  },
};
