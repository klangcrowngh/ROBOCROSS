// Global leaderboard on a Cloudflare Worker (see server/). Scores are sent with Telegram's signed
// initData, so the server knows the player is real; only the best score per player is kept.
export const LB_URL = 'https://robocross-leaderboard.klangcrown.workers.dev';

const tg = window.Telegram?.WebApp ?? null;
const userId = () => tg?.initDataUnsafe?.user?.id ?? null;

export const enabled = () => !!LB_URL;

export async function submit(score) {
  if (!LB_URL || !tg?.initData || score <= 0) return;
  try {
    await fetch(`${LB_URL}/score`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData, score }),
    });
  } catch {}
}

// -> { top: [{ name, score }], me: { rank, score } | null }
export async function load(limit = 50) {
  if (!LB_URL) return null;
  const me = userId();
  const r = await fetch(`${LB_URL}/top?limit=${limit}${me ? `&me=${me}` : ''}`);
  if (!r.ok) throw new Error('leaderboard');
  return r.json();
}
