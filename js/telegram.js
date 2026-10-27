// Telegram Mini App glue. Everything degrades gracefully in a plain browser.
const tg = window.Telegram?.WebApp ?? null;
const supports = (v) => !!tg && typeof tg.isVersionAtLeast === 'function' && tg.isVersionAtLeast(v);

export function initTelegram(bg) {
  if (!tg) return;
  try { tg.ready(); tg.expand(); } catch {}
  // Otherwise a vertical swipe in the game closes the mini app.
  if (supports('7.7')) try { tg.disableVerticalSwipes(); } catch {}
  if (supports('6.1')) try { tg.setHeaderColor(bg); tg.setBackgroundColor(bg); } catch {}
  if (supports('7.10')) try { tg.setBottomBarColor(bg); } catch {}
  // Bot API 8.0+: true fullscreen (no Telegram header / bottom bar) and portrait lock on phones.
  if (supports('8.0')) {
    const mobile = ['android', 'ios'].includes(tg.platform);
    try { if (mobile) tg.requestFullscreen(); } catch {}
    try { if (mobile) tg.lockOrientation(); } catch {}
  }
}

// Telegram tells us when the mini app goes to the background and comes back (Bot API 8.0+).
export function onAppHidden(cb) {
  if (!supports('8.0')) return;
  try {
    tg.onEvent('deactivated', () => cb(true));
    tg.onEvent('activated', () => cb(false));
  } catch {}
}

// numeric Telegram id of the player (null outside Telegram)
export const userId = () => tg?.initDataUnsafe?.user?.id ?? null;

export function haptic(kind) {
  if (!supports('6.1')) return;
  const h = tg.HapticFeedback;
  try {
    if (kind === 'error' || kind === 'success' || kind === 'warning') h.notificationOccurred(kind);
    else if (kind === 'select') h.selectionChanged();
    else h.impactOccurred(kind);
  } catch {}
}

// localStorage + Telegram CloudStorage (so the record follows the user between devices).
export const store = {
  get(key) {
    let local = null;
    try { local = localStorage.getItem(key); } catch {}
    if (!supports('6.9')) return Promise.resolve(local);
    return new Promise((resolve) => {
      try {
        tg.CloudStorage.getItem(key, (err, value) => resolve(err || !value ? local : value));
      } catch { resolve(local); }
    });
  },
  set(key, value, cloud = true) {
    try { localStorage.setItem(key, String(value)); } catch {}
    if (cloud && supports('6.9')) try { tg.CloudStorage.setItem(key, String(value)); } catch {}
  },
};
