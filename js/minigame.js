// Station minigames. Engineer Volta explains the task (once per session for each station), then
// a short 2D task on a steel cabinet unlocks an ability for the current run:
//  - wiresGame():  flight center, connect the wires by colour (like the Among Us task) -> jetpack
//  - shieldGame(): shield generator, stop the needle in the green zone three times -> shield
import { sfx } from './audio.js';
import { haptic } from './telegram.js';

// dialogs already shown in this session (a page load): repeat runs go straight to the task
const seen = new Set();

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// the engineer: yellow hard hat with goggles, headset, blue overalls (16x16 pixels)
const PORTRAIT = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" shape-rendering="crispEdges">
<path fill="#e0a800" d="M2 5h12v1H2z"/><path fill="#ffd21f" d="M4 1h8v1H4zM3 2h10v3H3z"/>
<path fill="#35e6ff" d="M5 3h2v2H5zM9 3h2v2H9z"/><path fill="#1a1a2a" d="M7 4h2v1H7z"/>
<path fill="#3a2a20" d="M3 6h1v5H3zM12 6h1v5h-1zM4 6h8v1H4z"/>
<path fill="#f0c090" d="M4 7h8v5H4z"/><path fill="#1a1a2a" d="M5 8h2v1H5zM9 8h2v1H9z"/>
<path fill="#b05a40" d="M7 10h2v1H7z"/><path fill="#2a2b33" d="M12 8h1v3h-1zM10 11h3v1h-3z"/>
<path fill="#2a4a9a" d="M2 12h12v4H2z"/><path fill="#ffd21f" d="M5 12h1v4H5zM10 12h1v4h-1z"/><path fill="#c9ccd8" d="M7 13h2v1H7z"/>
</svg>`)}`;

// A dialog box at the bottom: the text types itself out, a tap finishes the line or goes on.
// Each `key` is shown once per session.
function talk(root, key, lines) {
  if (seen.has(key)) return Promise.resolve();
  seen.add(key);
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'dlg';
    box.innerHTML = `<div class="dlg-face"><img src="${PORTRAIT}" alt=""></div>
      <div class="dlg-body"><div class="dlg-name">ИНЖЕНЕР ВОЛЬТА</div><div class="dlg-text"></div><i class="dlg-next"></i></div>`;
    root.appendChild(box);
    const text = box.querySelector('.dlg-text');
    let i = 0, shown = 0, timer = 0;
    const show = () => {
      shown = 0;
      box.classList.remove('done');
      clearInterval(timer);
      timer = setInterval(() => {
        shown++;
        text.textContent = lines[i].slice(0, shown);
        if (shown % 3 === 0) sfx.click();
        if (shown >= lines[i].length) { clearInterval(timer); box.classList.add('done'); }
      }, 28);
    };
    box.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (shown < lines[i].length) {
        // first tap: show the whole line
        shown = lines[i].length;
        text.textContent = lines[i];
        clearInterval(timer);
        box.classList.add('done');
        return;
      }
      if (++i < lines.length) { show(); return; }
      clearInterval(timer);
      box.classList.add('out');
      setTimeout(() => { box.remove(); resolve(); }, 200);
    });
    requestAnimationFrame(() => box.classList.add('in'));
    show();
  });
}

// ---------------------------------------------------------------- the steel cabinet
// Shared by both stations: overlay, canvas, layout, frame, status screen, lamps, sparks.
function cabinet(root, cls) {
  const el = document.createElement('div');
  el.className = `mini station ${cls}`;
  el.innerHTML = '<canvas></canvas>';
  root.appendChild(el);
  const canvas = el.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const C = { el, canvas, ctx, W: 0, H: 0, dpr: 1, L: null, t: 0, shake: 0, dim: 1, sparks: [], flashAt: 0 };

  C.layout = () => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    C.dpr = Math.min(2, window.devicePixelRatio || 1);
    C.W = r.width; C.H = r.height;
    canvas.width = C.W * C.dpr; canvas.height = C.H * C.dpr;
    canvas.style.width = `${C.W}px`; canvas.style.height = `${C.H}px`;
    const pw = Math.min(C.W - 24, 420), ph = Math.min(C.H * 0.64, pw * 1.32);
    const px = (C.W - pw) / 2, py = Math.max(60, (C.H - ph) / 2 - C.H * 0.06);
    const s = pw / 360;
    const ix = px + 14 * s, iy = py + 14 * s, iw = pw - 28 * s, ih = ph - 28 * s;
    C.L = { px, py, pw, ph, s, ix, iy, iw, ih, top: iy + 14 * s + 44 * s + 34 * s };
  };
  C.layout();
  window.addEventListener('resize', C.layout);
  C.point = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  const rect = C.rect = (x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };
  const vgrad = (y0, y1, a, b) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
  const screw = (x, y, s) => {
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, 6 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a90a8'; ctx.beginPath(); ctx.arc(x, y, 4.5 * s, 0, Math.PI * 2); ctx.fill();
    rect(x - 3 * s, y - 0.8 * s, 6 * s, 1.6 * s, '#3a3d52');
  };
  C.lamp = (x, y, r, on, color) => {
    ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fill();
    if (on) { ctx.shadowColor = color; ctx.shadowBlur = 14; }
    ctx.fillStyle = on ? color : '#2a2f45'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    if (on) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill(); }
  };
  C.burst = (p, color) => {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 140;
      C.sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.35 + Math.random() * 0.3, color });
    }
  };

  // frame + board + status screen + progress lamps; the game draws its own parts on top
  C.begin = (dt, { title, status, ok, lamps, total }) => {
    if (!C.L) { C.layout(); if (!C.L) return false; }
    ctx.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
    ctx.clearRect(0, 0, C.W, C.H);
    const { px, py, pw, ph, s, ix, iy, iw, ih } = C.L;
    C.shake = Math.max(0, C.shake - dt);
    ctx.save();
    ctx.translate(C.shake ? Math.sin(C.t * 90) * 6 * C.shake / 0.3 : 0, 0);

    rect(px - 6, py - 6, pw + 12, ph + 12, '#000');
    rect(px, py, pw, ph, vgrad(py, py + ph, '#5a6084', '#2c2f48'));
    rect(px, py, pw, 3 * s, 'rgba(255,255,255,.35)');
    rect(ix - 2, iy - 2, iw + 4, ih + 4, '#000');
    rect(ix, iy, iw, ih, vgrad(iy, iy + ih, '#191b33', '#0b0c1a'));
    rect(ix, iy, iw, 6 * s, 'rgba(0,0,0,.5)');
    ctx.strokeStyle = 'rgba(53,230,255,.07)';
    ctx.lineWidth = 2 * s;
    for (let k = 0; k < 6; k++) {
      const yy = iy + ih * (0.3 + k * 0.12);
      ctx.beginPath(); ctx.moveTo(ix + 20 * s, yy); ctx.lineTo(ix + iw * 0.4, yy); ctx.lineTo(ix + iw * 0.48, yy - 14 * s); ctx.lineTo(ix + iw - 20 * s, yy - 14 * s); ctx.stroke();
    }
    const st = 14 * s;
    for (let i = 0; i < iw; i += st) {
      ctx.fillStyle = Math.round(i / st) % 2 ? '#ffd21f' : '#14141c';
      ctx.fillRect(ix + i, py + ph - 11 * s, Math.min(st, iw - i), 6 * s);
    }
    for (const [x, y] of [[px + 7 * s, py + 7 * s], [px + pw - 7 * s, py + 7 * s], [px + 7 * s, py + ph - 7 * s], [px + pw - 7 * s, py + ph - 7 * s]]) screw(x, y, s);

    const sx = ix + 16 * s, sy = iy + 14 * s, sw = iw - 32 * s, sh = 44 * s;
    rect(sx - 3, sy - 3, sw + 6, sh + 6, '#000');
    rect(sx, sy, sw, sh, ok ? '#062014' : '#120a14');
    for (let yy = sy; yy < sy + sh; yy += 3) rect(sx, yy, sw, 1, 'rgba(0,0,0,.35)');
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(8, Math.round(11 * s))}px "Press Start 2P", monospace`;
    ctx.fillStyle = ok ? '#6dffb0' : '#35e6ff';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
    ctx.fillText(title, sx + sw / 2, sy + sh * 0.34);
    ctx.font = `${Math.max(7, Math.round(9 * s))}px "Press Start 2P", monospace`;
    ctx.fillStyle = ok ? '#6dffb0' : Math.floor(C.t * 2) % 2 ? '#ff3a5a' : '#ff8a9e';
    ctx.fillText(status, sx + sw / 2, sy + sh * 0.72);
    ctx.shadowBlur = 0;
    for (let i = 0; i < total; i++) C.lamp(px + pw / 2 + (i - (total - 1) / 2) * 26 * s, sy + sh + 20 * s, 6 * s, i < lamps, '#6dffb0');
    return true;
  };
  C.end = (dt) => {
    const { px, py, pw, ph, s } = C.L;
    for (let i = C.sparks.length - 1; i >= 0; i--) {
      const p = C.sparks[i];
      p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt;
      if (p.life <= 0) { C.sparks.splice(i, 1); continue; }
      rect(p.x - 2 * s, p.y - 2 * s, 4 * s, 4 * s, p.color);
    }
    if (C.flashAt && C.t - C.flashAt < 0.9) rect(px, py, pw, ph, `rgba(109,255,176,${0.3 * (1 - (C.t - C.flashAt) / 0.9)})`);
    ctx.restore();
    if (C.dim > 0) rect(0, 0, C.W, C.H, `rgba(4,6,20,${0.55 * C.dim})`);
  };

  let raf = 0, last = performance.now();
  C.run = (draw) => {
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      C.t += dt;
      draw(dt);
    };
    raf = requestAnimationFrame(loop);
    requestAnimationFrame(() => el.classList.add('in'));
  };
  C.close = (resolve, ok) => {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', C.layout);
    el.classList.add('out');
    setTimeout(() => { el.remove(); resolve(ok); }, 220);
  };
  return C;
}

// ---------------------------------------------------------------- flight center: wires
const WIRES = [
  { c: '#ff3a5a', d: '#8a1426' },
  { c: '#35e6ff', d: '#10607a' },
  { c: '#ffd21f', d: '#8a6a00' },
  { c: '#ff4fd8', d: '#7a1468' },
];

export function wiresGame(root) {
  return new Promise((resolve) => {
    const C = cabinet(root, 'wires');
    const { ctx, rect } = C;
    // the right side is shuffled so no wire goes straight across
    const left = shuffle([0, 1, 2, 3]);
    let right;
    do right = shuffle([0, 1, 2, 3]); while (right.some((c, i) => c === left[i]));
    const done = new Set();
    let drag = null, active = false, wrongAt = -9, wrongColor = -1;

    const ys = () => [0, 1, 2, 3].map((i) => C.L.py + C.L.ph * (0.34 + i * 0.15));
    const lx = () => C.L.px + 58 * C.L.s, rx = () => C.L.px + C.L.pw - 58 * C.L.s;
    const leftPos = (color) => ({ x: lx(), y: ys()[left.indexOf(color)] });
    const rightPos = (color) => ({ x: rx(), y: ys()[right.indexOf(color)] });

    C.canvas.addEventListener('pointerdown', (e) => {
      if (!active) return;
      const p = C.point(e);
      for (const color of left) {
        if (done.has(color)) continue;
        const q = leftPos(color);
        if (Math.abs(p.x - q.x) < 56 * C.L.s && Math.abs(p.y - q.y) < 0.07 * C.L.ph) {
          drag = { color, ...p };
          C.canvas.setPointerCapture(e.pointerId);
          sfx.click();
          haptic('select');
          return;
        }
      }
    });
    C.canvas.addEventListener('pointermove', (e) => { if (drag) Object.assign(drag, C.point(e)); });
    C.canvas.addEventListener('pointerup', () => {
      if (!drag) return;
      // the nearest socket on the right, if the wire was brought close to it
      let best = null, bd = 1e9;
      for (const color of right) {
        const q = rightPos(color);
        const d = Math.hypot(drag.x - q.x, drag.y - q.y);
        if (d < bd) { bd = d; best = color; }
      }
      const near = bd < 0.07 * C.L.ph + 26 * C.L.s;
      if (near && best === drag.color) {
        done.add(best);
        C.burst(rightPos(best), WIRES[best].c);
        sfx.coin();
        haptic('light');
        if (done.size === WIRES.length) {
          C.flashAt = C.t;
          active = false;
          sfx.newBest();
          haptic('success');
          setTimeout(finish, 1100);
        }
      } else if (near) {
        // wrong colour: sparks, a jolt, the wire springs back
        C.shake = 0.3;
        wrongAt = C.t;
        wrongColor = best;
        C.burst(rightPos(best), '#ffffff');
        sfx.bump();
        haptic('error');
      }
      drag = null;
    });
    C.canvas.addEventListener('pointercancel', () => (drag = null));

    (async () => {
      await talk(C.el, 'wires-in', [
        'Стой, железный! Это лётный центр RENT ROBOT.',
        'На спине у тебя джетпак, но модуль полёта отключён.',
        'Открыла щиток. Соедини провода одинаковых цветов — и полетишь!',
      ]);
      C.dim = 0;
      active = true;
    })();
    async function finish() {
      C.dim = 0.55;
      await talk(C.el, 'wires-out', [
        'Есть контакт! Модуль онлайн.',
        'Джетпак заряжается от шагов. Круг заполнился — жми кнопку и взлетай!',
      ]);
      C.close(resolve, true);
    }

    // a wire hangs a little between its ends
    const curve = (a, b) => {
      const sag = Math.min(60, Math.hypot(b.x - a.x, b.y - a.y) * 0.16) * C.L.s;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(a.x + (b.x - a.x) * 0.35, a.y + sag, a.x + (b.x - a.x) * 0.65, b.y + sag, b.x, b.y);
    };
    const wire = (a, b, col, live) => {
      const s = C.L.s;
      ctx.lineCap = 'round';
      curve(a, b);
      ctx.lineWidth = 18 * s; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.lineWidth = 13 * s; ctx.strokeStyle = col.d; ctx.stroke();
      ctx.lineWidth = 8 * s; ctx.strokeStyle = col.c; ctx.stroke();
      ctx.save();
      ctx.translate(0, -2.5 * s);
      curve(a, b);
      ctx.lineWidth = 2.5 * s; ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.stroke();
      ctx.restore();
      if (live) {
        // current running along a connected wire
        curve(a, b);
        ctx.setLineDash([6 * s, 16 * s]);
        ctx.lineDashOffset = -C.t * 90 * s;
        ctx.lineWidth = 3.5 * s; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
        ctx.setLineDash([]);
      }
    };
    const plug = (x, y, s) => {
      rect(x - 12 * s, y - 9 * s, 24 * s, 18 * s, '#000');
      rect(x - 10 * s, y - 7 * s, 20 * s, 14 * s, '#b8bdd0');
      rect(x - 10 * s, y - 7 * s, 20 * s, 4 * s, '#e8ebf6');
      rect(x + 10 * s, y - 4 * s, 6 * s, 2 * s, '#e8ebf6');
      rect(x + 10 * s, y + 2 * s, 6 * s, 2 * s, '#e8ebf6');
    };

    C.run((dt) => {
      const ok = done.size === WIRES.length;
      if (!C.begin(dt, { title: 'МОДУЛЬ ПОЛЁТА', status: ok ? 'ОНЛАЙН' : `ОФФЛАЙН ${done.size}/4`, ok, lamps: done.size, total: 4 })) return;
      const { s, ix, iw } = C.L;
      const Y = ys();
      // conduits on both sides
      rect(ix + 6 * s, Y[0] - 26 * s, 18 * s, Y[3] - Y[0] + 52 * s, '#23253e');
      rect(ix + iw - 24 * s, Y[0] - 26 * s, 18 * s, Y[3] - Y[0] + 52 * s, '#23253e');
      // left: coloured wire stubs coming out of the conduit, each ending in a plug
      for (const color of left) {
        const q = leftPos(color), col = WIRES[color];
        if (done.has(color) || (drag && drag.color === color)) {
          rect(ix + 14 * s, q.y - 6 * s, q.x - ix - 14 * s, 12 * s, '#000');
          rect(ix + 14 * s, q.y - 4 * s, q.x - ix - 14 * s, 8 * s, col.c);
        } else {
          wire({ x: ix + 14 * s, y: q.y }, { x: q.x, y: q.y }, col, false);
          plug(q.x, q.y, s);
        }
      }
      // right: sockets with a colour ring and a lamp
      for (const color of right) {
        const q = rightPos(color), col = WIRES[color];
        const bad = color === wrongColor && C.t - wrongAt < 0.4;
        rect(q.x - 14 * s, q.y - 16 * s, 28 * s, 32 * s, '#000');
        rect(q.x - 12 * s, q.y - 14 * s, 24 * s, 28 * s, bad ? '#ff3a5a' : col.c);
        rect(q.x - 8 * s, q.y - 10 * s, 16 * s, 20 * s, '#0a0b16');
        rect(q.x - 3 * s, q.y - 5 * s, 6 * s, 3 * s, '#3a3d52');
        rect(q.x - 3 * s, q.y + 2 * s, 6 * s, 3 * s, '#3a3d52');
        rect(q.x + 14 * s, q.y - 4 * s, ix + iw - 10 * s - q.x - 14 * s, 8 * s, col.d);
        C.lamp(q.x - 30 * s, q.y, 5 * s, done.has(color), col.c);
      }
      // connected wires, then the one being dragged on top (with its plug at the finger)
      for (const color of done) { const a = leftPos(color), b = rightPos(color); wire(a, b, WIRES[color], true); plug(b.x - 4 * s, b.y, s); }
      if (drag) { wire(leftPos(drag.color), drag, WIRES[drag.color], false); plug(drag.x, drag.y, s); }
      // pulsing frames on the plugs until the first connection
      if (active && !drag && done.size === 0) {
        ctx.strokeStyle = `rgba(255,255,255,${0.3 + 0.35 * Math.sin(C.t * 6)})`;
        ctx.lineWidth = 2;
        for (const color of left) { const q = leftPos(color); ctx.strokeRect(q.x - 18 * s, q.y - 14 * s, 36 * s, 28 * s); }
      }
      C.end(dt);
    });
  });
}

// ---------------------------------------------------------------- shield generator: calibration
// A needle sweeps over a dial; tap when it is inside the green zone. Three hits, each zone is
// narrower and the needle faster. A miss only jolts the cabinet.
const SHIELD_HITS = 3;
const ZONE = [0.24, 0.17, 0.12];
const SPEED = [0.5, 0.65, 0.8]; // sweeps per second

export function shieldGame(root) {
  return new Promise((resolve) => {
    const C = cabinet(root, 'shield');
    const { ctx, rect } = C;
    let active = false, hits = 0, u = 0, dir = 1, missAt = -9, hitAt = -9;
    let zone = newZone();
    function newZone() { return 0.15 + Math.random() * 0.7; }

    const dial = () => {
      const { px, pw, ph, py, s } = C.L;
      return { cx: px + pw / 2, cy: py + ph * 0.66, R: Math.min(pw * 0.36, ph * 0.36), s };
    };
    const angle = (v) => Math.PI + v * Math.PI; // 0 = left, 1 = right, over the top

    C.canvas.addEventListener('pointerdown', () => {
      if (!active) return;
      const w = ZONE[hits];
      if (Math.abs(u - zone) <= w / 2) {
        hits++;
        hitAt = C.t;
        const d = dial();
        C.burst({ x: d.cx + Math.cos(angle(u)) * d.R, y: d.cy + Math.sin(angle(u)) * d.R }, '#6dffb0');
        sfx.coin();
        haptic('light');
        if (hits >= SHIELD_HITS) {
          active = false;
          C.flashAt = C.t;
          sfx.newBest();
          haptic('success');
          setTimeout(finish, 1100);
        } else {
          let z;
          do z = newZone(); while (Math.abs(z - zone) < 0.25);
          zone = z;
        }
      } else {
        missAt = C.t;
        C.shake = 0.3;
        sfx.bump();
        haptic('error');
      }
    });

    (async () => {
      await talk(C.el, 'shield-in', [
        'А это генератор энергощита RENT ROBOT.',
        'Щит выдержит один удар: машину, поезд, лазер или балку.',
        'Останови стрелку в зелёной зоне три раза — жми в нужный момент!',
      ]);
      C.dim = 0;
      active = true;
    })();
    async function finish() {
      C.dim = 0.55;
      await talk(C.el, 'shield-out', [
        'Щит откалиброван!',
        'После удара он заряжается от шагов. Заряд видно на кнопке щита справа.',
      ]);
      C.close(resolve, true);
    }

    C.run((dt) => {
      const ok = hits >= SHIELD_HITS;
      if (!C.begin(dt, { title: 'ЭНЕРГОЩИТ', status: ok ? 'ГОТОВ' : `КАЛИБРОВКА ${hits}/${SHIELD_HITS}`, ok, lamps: hits, total: SHIELD_HITS })) return;
      if (active) {
        u += dir * dt * SPEED[hits] * 2;
        if (u > 1) { u = 2 - u; dir = -1; }
        if (u < 0) { u = -u; dir = 1; }
      }
      const { cx, cy, R, s } = dial();
      // dial: dark track, ticks, the green zone, the needle
      ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI);
      ctx.lineWidth = 34 * s; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.lineWidth = 28 * s; ctx.strokeStyle = '#1d2040'; ctx.stroke();
      for (let k = 0; k <= 20; k++) {
        const a = angle(k / 20), r0 = R - 22 * s, r1 = R - (k % 5 ? 28 : 34) * s;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineWidth = 2 * s; ctx.strokeStyle = 'rgba(200,210,255,.45)'; ctx.stroke();
      }
      if (!ok) {
        const w = ZONE[Math.min(hits, SHIELD_HITS - 1)];
        const miss = C.t - missAt < 0.35;
        ctx.beginPath(); ctx.arc(cx, cy, R, angle(zone - w / 2), angle(zone + w / 2));
        ctx.lineWidth = 26 * s;
        ctx.shadowColor = miss ? '#ff3a5a' : '#6dffb0'; ctx.shadowBlur = 16;
        ctx.strokeStyle = miss ? '#ff3a5a' : `rgba(109,255,176,${0.75 + 0.25 * Math.sin(C.t * 8)})`;
        ctx.stroke();
        ctx.shadowBlur = 0;
      } else {
        ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, 2 * Math.PI);
        ctx.lineWidth = 26 * s; ctx.strokeStyle = '#6dffb0'; ctx.stroke();
      }
      // needle
      const a = angle(u);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * (R + 10 * s), cy + Math.sin(a) * (R + 10 * s));
      ctx.lineWidth = 9 * s; ctx.strokeStyle = '#000'; ctx.stroke();
      ctx.lineWidth = 5 * s; ctx.strokeStyle = C.t - hitAt < 0.25 ? '#6dffb0' : '#ffd21f'; ctx.stroke();
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(cx, cy, 16 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a90a8'; ctx.beginPath(); ctx.arc(cx, cy, 12 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd21f'; ctx.beginPath(); ctx.arc(cx, cy, 5 * s, 0, Math.PI * 2); ctx.fill();
      // shield emblem above the dial: a hexagon that fills up with every hit
      const ey = cy - R * 0.55, er = 22 * s;
      ctx.beginPath();
      for (let k = 0; k < 6; k++) { const b = Math.PI / 6 + k * Math.PI / 3; ctx.lineTo(cx + Math.cos(b) * er, ey + Math.sin(b) * er); }
      ctx.closePath();
      ctx.fillStyle = `rgba(109,255,176,${0.15 + 0.85 * (hits / SHIELD_HITS)})`;
      ctx.fill();
      ctx.lineWidth = 3 * s; ctx.strokeStyle = '#000'; ctx.stroke();
      // hint under the dial
      if (active) {
        ctx.font = `${Math.max(7, Math.round(9 * s))}px "Press Start 2P", monospace`;
        ctx.fillStyle = `rgba(255,255,255,${0.55 + 0.35 * Math.sin(C.t * 5)})`;
        ctx.fillText('ЖМИ, КОГДА СТРЕЛКА В ЗЕЛЁНОМ', cx, cy + 40 * s);
      }
      C.end(dt);
    });
  });
}
