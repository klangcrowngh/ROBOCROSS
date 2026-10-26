// Flight-center training: a 2D "connect the wires" panel (like the Among Us task).
// Drag each wire from the left to the socket of the same colour on the right; when all are
// connected, the flight module comes online and the robot gets the jetpack for this run.
import { sfx } from './audio.js';
import { haptic } from './telegram.js';

const COLORS = [
  { c: '#ff3a5a', d: '#8a1426' },
  { c: '#35e6ff', d: '#10607a' },
  { c: '#ffd21f', d: '#8a6a00' },
  { c: '#ff4fd8', d: '#7a1468' },
];

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export function wiresGame(root) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'mini wires';
    el.innerHTML = `
      <canvas></canvas>
      <div class="mini-card">
        <h2>ЛЁТНЫЙ ЦЕНТР</h2>
        <p>Модуль полёта отключён. Подключи его, чтобы получить джетпак.</p>
        <p class="hint">Соедини провода одинаковых цветов</p>
        <button class="go">НАЧАТЬ</button>
      </div>`;
    root.appendChild(el);
    const canvas = el.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const card = el.querySelector('.mini-card');

    // the right side is shuffled so no wire goes straight across
    const left = shuffle([0, 1, 2, 3]);
    let right;
    do right = shuffle([0, 1, 2, 3]); while (right.some((c, i) => c === left[i]));
    const done = new Set();
    let drag = null; // { color, x, y }
    let active = false, raf = 0, t = 0, last = performance.now(), doneAt = 0;

    let W = 0, H = 0, dpr = 1, L = null;
    function layout() {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      const pw = Math.min(W - 28, 420), ph = Math.min(H * 0.62, pw * 1.25);
      const px = (W - pw) / 2, py = (H - ph) / 2 + 10;
      const ys = [0, 1, 2, 3].map((i) => py + ph * (0.3 + i * 0.18));
      L = { px, py, pw, ph, ys, lx: px + 40 * (pw / 360), rx: px + pw - 64 * (pw / 360), s: pw / 360 };
    }
    layout();
    window.addEventListener('resize', layout);

    const leftPos = (color) => ({ x: L.lx, y: L.ys[left.indexOf(color)] });
    const rightPos = (color) => ({ x: L.rx, y: L.ys[right.indexOf(color)] });
    const point = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    canvas.addEventListener('pointerdown', (e) => {
      if (!active) return;
      const p = point(e);
      for (const color of left) {
        if (done.has(color)) continue;
        const q = leftPos(color);
        if (Math.abs(p.x - q.x) < 50 * L.s && Math.abs(p.y - q.y) < 0.09 * L.ph) {
          drag = { color, ...p };
          canvas.setPointerCapture(e.pointerId);
          sfx.click();
          return;
        }
      }
    });
    canvas.addEventListener('pointermove', (e) => { if (drag) Object.assign(drag, point(e)); });
    canvas.addEventListener('pointerup', () => {
      if (!drag) return;
      // the nearest socket on the right, if the wire was brought close to it
      let best = null, bd = 1e9;
      for (const color of right) {
        const q = rightPos(color);
        const d = Math.hypot(drag.x - q.x, drag.y - q.y);
        if (d < bd) { bd = d; best = color; }
      }
      const near = bd < 0.09 * L.ph + 20 * L.s;
      if (near && best === drag.color) {
        done.add(best);
        sfx.coin();
        haptic('light');
        if (done.size === COLORS.length) {
          doneAt = t;
          active = false;
          sfx.newBest();
          haptic('success');
          setTimeout(win, 900);
        }
      } else if (near) {
        // wrong colour: the wire springs back
        sfx.bump();
        haptic('error');
      }
      drag = null;
    });
    canvas.addEventListener('pointercancel', () => (drag = null));

    function win() {
      card.innerHTML = `<h2>МОДУЛЬ ПОДКЛЮЧЁН</h2><p class="big">ДЖЕТПАК</p><p>Заряжается на ходу. Нажми кнопку джетпака — робот взлетит над улицей. Свайпай влево-вправо и лови жетоны.</p><button class="go">ПРОДОЛЖИТЬ</button>`;
      card.classList.remove('hidden');
      card.querySelector('.go').onclick = () => { sfx.click(); close(true); };
    }
    function close(ok) {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', layout);
      el.remove();
      resolve(ok);
    }
    card.querySelector('.go').onclick = () => {
      sfx.click();
      card.classList.add('hidden');
      active = true;
    };

    // ---------------------------------------------------------------- drawing
    const rect = (x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };
    function wire(a, b, col, s) {
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.lineWidth = 17 * s; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.lineWidth = 12 * s; ctx.strokeStyle = col.d; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(a.x, a.y - 2 * s); ctx.lineTo(b.x, b.y - 2 * s);
      ctx.lineWidth = 6 * s; ctx.strokeStyle = col.c; ctx.stroke();
    }
    // metal clamp with the coloured wire end coming out of the panel side
    function socket(x, y, col, side, s, lit) {
      const w = 34 * s, h = 20 * s;
      const sx = side < 0 ? L.px + 8 * s : x + 14 * s;
      const sw = side < 0 ? x - 14 * s - sx : L.px + L.pw - 8 * s - sx;
      rect(sx, y - h / 2 - 3 * s, sw, h + 6 * s, '#000');
      rect(sx, y - h / 2, sw, h, col.d);
      rect(sx, y - h / 2, sw, h * 0.45, col.c);
      rect(x - w / 2, y - 12 * s, w, 24 * s, '#000');
      rect(x - w / 2 + 2 * s, y - 10 * s, w - 4 * s, 20 * s, '#9aa0b8');
      rect(x - w / 2 + 2 * s, y - 10 * s, w - 4 * s, 5 * s, '#d8dcec');
      rect(x - 9 * s, y - 4 * s, 18 * s, 8 * s, '#3a3d52');
      if (side > 0) {
        // status lamp next to each right socket
        const lx = x - w / 2 - 16 * s;
        rect(lx - 7 * s, y - 7 * s, 14 * s, 14 * s, '#000');
        rect(lx - 5 * s, y - 5 * s, 10 * s, 10 * s, lit ? '#6dffb0' : '#28304a');
      }
    }

    function draw() {
      if (!L) { layout(); if (!L) return; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const { px, py, pw, ph, s } = L;
      const ok = done.size === COLORS.length;
      // panel: dark steel with hazard stripes and rivets
      rect(px - 5, py - 5, pw + 10, ph + 10, '#000');
      rect(px, py, pw, ph, '#2e3146');
      rect(px + 8 * s, py + 8 * s, pw - 16 * s, ph - 16 * s, '#1a1c2a');
      const st = 16 * s;
      for (let i = 0; i < pw; i += st) {
        ctx.fillStyle = Math.round(i / st) % 2 ? '#ffd21f' : '#14141c';
        ctx.fillRect(px + i, py, Math.min(st, pw - i), 6 * s);
        ctx.fillRect(px + i, py + ph - 6 * s, Math.min(st, pw - i), 6 * s);
      }
      for (const [x, y] of [[px + 18 * s, py + 20 * s], [px + pw - 18 * s, py + 20 * s], [px + 18 * s, py + ph - 20 * s], [px + pw - 18 * s, py + ph - 20 * s]]) {
        rect(x - 4 * s, y - 4 * s, 8 * s, 8 * s, '#5a5e78');
        rect(x - 4 * s, y - 4 * s, 8 * s, 3 * s, '#a8aec8');
      }
      // header and progress lamps
      ctx.fillStyle = ok ? '#6dffb0' : '#35e6ff';
      ctx.font = `${Math.max(9, Math.round(12 * s))}px "Press Start 2P", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText(ok ? 'МОДУЛЬ ОНЛАЙН' : 'МОДУЛЬ ПОЛЁТА', px + pw / 2, py + 0.12 * ph);
      for (let i = 0; i < COLORS.length; i++) {
        const x = px + pw / 2 + (i - 1.5) * 24 * s;
        rect(x - 8 * s, py + 0.16 * ph, 16 * s, 8 * s, '#000');
        rect(x - 6 * s, py + 0.16 * ph + 2 * s, 12 * s, 4 * s, i < done.size ? '#6dffb0' : '#33364a');
      }
      for (const color of left) { const q = leftPos(color); socket(q.x, q.y, COLORS[color], -1, s, false); }
      for (const color of right) { const q = rightPos(color); socket(q.x, q.y, COLORS[color], 1, s, done.has(color)); }
      // connected wires, then the one being dragged on top
      for (const color of done) wire(leftPos(color), rightPos(color), COLORS[color], s);
      if (drag) wire(leftPos(drag.color), drag, COLORS[drag.color], s);
      // pulsing frames on the wire ends until the first connection
      if (active && !drag && done.size === 0) {
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(t * 6)})`;
        ctx.lineWidth = 2;
        for (const color of left) { const q = leftPos(color); ctx.strokeRect(q.x - 22 * s, q.y - 15 * s, 44 * s, 30 * s); }
      }
      if (doneAt && t - doneAt < 0.9) {
        ctx.fillStyle = `rgba(109,255,176,${0.3 * (1 - (t - doneAt) / 0.9)})`;
        ctx.fillRect(px, py, pw, ph);
      }
    }

    function loop(now) {
      raf = requestAnimationFrame(loop);
      t += Math.min(0.05, (now - last) / 1000);
      last = now;
      draw();
    }
    raf = requestAnimationFrame(loop);
  });
}
