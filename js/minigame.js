// Flight-center training: the engineer explains what is going on, then a 2D "connect the wires"
// panel (like the Among Us task). Drag each wire from the left to the socket of the same colour
// on the right; when all are connected, the flight module comes online and the robot gets the
// jetpack for this run.
import { sfx } from './audio.js';
import { haptic } from './telegram.js';

const COLORS = [
  { c: '#ff3a5a', d: '#8a1426', name: 'RED' },
  { c: '#35e6ff', d: '#10607a', name: 'CYN' },
  { c: '#ffd21f', d: '#8a6a00', name: 'YEL' },
  { c: '#ff4fd8', d: '#7a1468', name: 'MAG' },
];

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
function dialog(root, lines) {
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

export function wiresGame(root) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'mini wires';
    el.innerHTML = '<canvas></canvas>';
    root.appendChild(el);
    const canvas = el.querySelector('canvas');
    const ctx = canvas.getContext('2d');

    // the right side is shuffled so no wire goes straight across
    const left = shuffle([0, 1, 2, 3]);
    let right;
    do right = shuffle([0, 1, 2, 3]); while (right.some((c, i) => c === left[i]));
    const done = new Set();
    const sparks = [];
    let drag = null; // { color, x, y }
    let active = false, raf = 0, t = 0, last = performance.now(), doneAt = 0, shake = 0, wrongAt = -9, wrongColor = -1;
    let dim = 1; // panel dimmed while the engineer talks

    let W = 0, H = 0, dpr = 1, L = null;
    function layout() {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      W = r.width; H = r.height;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
      const pw = Math.min(W - 24, 420), ph = Math.min(H * 0.64, pw * 1.32);
      const px = (W - pw) / 2, py = Math.max(60, (H - ph) / 2 - H * 0.06);
      const s = pw / 360;
      const ys = [0, 1, 2, 3].map((i) => py + ph * (0.34 + i * 0.15));
      L = { px, py, pw, ph, ys, lx: px + 58 * s, rx: px + pw - 58 * s, s };
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
        if (Math.abs(p.x - q.x) < 56 * L.s && Math.abs(p.y - q.y) < 0.07 * L.ph) {
          drag = { color, ...p };
          canvas.setPointerCapture(e.pointerId);
          sfx.click();
          haptic('select');
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
      const near = bd < 0.07 * L.ph + 26 * L.s;
      if (near && best === drag.color) {
        done.add(best);
        burst(rightPos(best), COLORS[best].c);
        sfx.coin();
        haptic('light');
        if (done.size === COLORS.length) {
          doneAt = t;
          active = false;
          sfx.newBest();
          haptic('success');
          setTimeout(win, 1100);
        }
      } else if (near) {
        // wrong colour: sparks, a jolt, the wire springs back
        shake = 0.3;
        wrongAt = t;
        wrongColor = best;
        burst(rightPos(best), '#ffffff');
        sfx.bump();
        haptic('error');
      }
      drag = null;
    });
    canvas.addEventListener('pointercancel', () => (drag = null));

    function burst(p, color) {
      for (let i = 0; i < 14; i++) {
        const a = Math.random() * Math.PI * 2, v = 60 + Math.random() * 140;
        sparks.push({ x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, life: 0.35 + Math.random() * 0.3, color });
      }
    }

    async function intro() {
      await dialog(el, [
        'Стой, железный! Это лётный центр RENT ROBOT.',
        'На спине у тебя джетпак, но модуль полёта отключён.',
        'Открыла щиток. Соедини провода одинаковых цветов — и полетишь!',
      ]);
      dim = 0;
      active = true;
    }
    async function win() {
      dim = 0.55;
      await dialog(el, [
        'Есть контакт! Модуль онлайн.',
        'Джетпак заряжается от шагов. Круг заполнился — жми кнопку и взлетай!',
      ]);
      close(true);
    }
    function close(ok) {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', layout);
      el.classList.add('out');
      setTimeout(() => { el.remove(); resolve(ok); }, 220);
    }

    // ---------------------------------------------------------------- drawing
    const rect = (x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };
    const vgrad = (y0, y1, a, b) => { const g = ctx.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };

    // a wire hangs a little between its ends
    function curve(a, b) {
      const sag = Math.min(60, Math.hypot(b.x - a.x, b.y - a.y) * 0.16) * L.s;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.bezierCurveTo(a.x + (b.x - a.x) * 0.35, a.y + sag, a.x + (b.x - a.x) * 0.65, b.y + sag, b.x, b.y);
    }
    function wire(a, b, col, live) {
      const s = L.s;
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
        ctx.lineDashOffset = -t * 90 * s;
        ctx.lineWidth = 3.5 * s; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    function plug(x, y, s) {
      // metal plug at the end of a wire
      rect(x - 12 * s, y - 9 * s, 24 * s, 18 * s, '#000');
      rect(x - 10 * s, y - 7 * s, 20 * s, 14 * s, '#b8bdd0');
      rect(x - 10 * s, y - 7 * s, 20 * s, 4 * s, '#e8ebf6');
      rect(x + 10 * s, y - 4 * s, 6 * s, 2 * s, '#e8ebf6');
      rect(x + 10 * s, y + 2 * s, 6 * s, 2 * s, '#e8ebf6');
    }
    function screw(x, y, s) {
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, 6 * s, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#8a90a8'; ctx.beginPath(); ctx.arc(x, y, 4.5 * s, 0, Math.PI * 2); ctx.fill();
      rect(x - 3 * s, y - 0.8 * s, 6 * s, 1.6 * s, '#3a3d52');
    }
    function lamp(x, y, r, on, color) {
      ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.fill();
      if (on) { ctx.shadowColor = color; ctx.shadowBlur = 14; }
      ctx.fillStyle = on ? color : '#2a2f45'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      if (on) { ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); ctx.fill(); }
    }

    function draw(dt) {
      if (!L) { layout(); if (!L) return; }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const { pw, ph, s } = L;
      const ok = done.size === COLORS.length;
      shake = Math.max(0, shake - dt);
      const px = L.px + (shake ? Math.sin(t * 90) * 6 * shake / 0.3 : 0), py = L.py;
      ctx.save();
      ctx.translate(px - L.px, 0);

      // cabinet: thick bevelled steel frame around a recessed board
      rect(L.px - 6, py - 6, pw + 12, ph + 12, '#000');
      rect(L.px, py, pw, ph, vgrad(py, py + ph, '#5a6084', '#2c2f48'));
      rect(L.px, py, pw, 3 * s, 'rgba(255,255,255,.35)');
      const ix = L.px + 14 * s, iy = py + 14 * s, iw = pw - 28 * s, ih = ph - 28 * s;
      rect(ix - 2, iy - 2, iw + 4, ih + 4, '#000');
      rect(ix, iy, iw, ih, vgrad(iy, iy + ih, '#191b33', '#0b0c1a'));
      rect(ix, iy, iw, 6 * s, 'rgba(0,0,0,.5)');
      // faint circuit traces on the board
      ctx.strokeStyle = 'rgba(53,230,255,.07)';
      ctx.lineWidth = 2 * s;
      for (let k = 0; k < 6; k++) {
        const yy = iy + ih * (0.3 + k * 0.12);
        ctx.beginPath(); ctx.moveTo(ix + 20 * s, yy); ctx.lineTo(ix + iw * 0.4, yy); ctx.lineTo(ix + iw * 0.48, yy - 14 * s); ctx.lineTo(ix + iw - 20 * s, yy - 14 * s); ctx.stroke();
      }
      // hazard stripes along the top and bottom of the frame
      const st = 14 * s;
      for (let i = 0; i < pw - 28 * s; i += st) {
        ctx.fillStyle = Math.round(i / st) % 2 ? '#ffd21f' : '#14141c';
        ctx.fillRect(ix + i, py + ph - 11 * s, Math.min(st, iw - i), 6 * s);
      }
      for (const [x, y] of [[L.px + 7 * s, py + 7 * s], [L.px + pw - 7 * s, py + 7 * s], [L.px + 7 * s, py + ph - 7 * s], [L.px + pw - 7 * s, py + ph - 7 * s]]) screw(x, y, s);

      // status screen
      const sx = ix + 16 * s, sy = iy + 14 * s, sw = iw - 32 * s, sh = 44 * s;
      rect(sx - 3, sy - 3, sw + 6, sh + 6, '#000');
      rect(sx, sy, sw, sh, ok ? '#062014' : '#120a14');
      for (let yy = sy; yy < sy + sh; yy += 3) rect(sx, yy, sw, 1, 'rgba(0,0,0,.35)');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${Math.max(8, Math.round(11 * s))}px "Press Start 2P", monospace`;
      ctx.fillStyle = ok ? '#6dffb0' : '#35e6ff';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8;
      ctx.fillText('МОДУЛЬ ПОЛЁТА', sx + sw / 2, sy + sh * 0.34);
      ctx.font = `${Math.max(7, Math.round(9 * s))}px "Press Start 2P", monospace`;
      ctx.fillStyle = ok ? '#6dffb0' : Math.floor(t * 2) % 2 ? '#ff3a5a' : '#ff8a9e';
      ctx.fillText(ok ? 'ОНЛАЙН' : `ОФФЛАЙН ${done.size}/4`, sx + sw / 2, sy + sh * 0.72);
      ctx.shadowBlur = 0;
      // power lamps under the screen
      for (let i = 0; i < 4; i++) lamp(L.px + pw / 2 + (i - 1.5) * 26 * s, sy + sh + 20 * s, 6 * s, i < done.size, '#6dffb0');

      // conduits on both sides
      rect(ix + 6 * s, L.ys[0] - 26 * s, 18 * s, L.ys[3] - L.ys[0] + 52 * s, '#23253e');
      rect(ix + iw - 24 * s, L.ys[0] - 26 * s, 18 * s, L.ys[3] - L.ys[0] + 52 * s, '#23253e');

      // left: coloured wire stubs coming out of the conduit, each ending in a plug
      for (const color of left) {
        const q = leftPos(color), col = COLORS[color];
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
        const q = rightPos(color), col = COLORS[color];
        const bad = color === wrongColor && t - wrongAt < 0.4;
        rect(q.x - 14 * s, q.y - 16 * s, 28 * s, 32 * s, '#000');
        rect(q.x - 12 * s, q.y - 14 * s, 24 * s, 28 * s, bad ? '#ff3a5a' : col.c);
        rect(q.x - 8 * s, q.y - 10 * s, 16 * s, 20 * s, '#0a0b16');
        rect(q.x - 3 * s, q.y - 5 * s, 6 * s, 3 * s, '#3a3d52');
        rect(q.x - 3 * s, q.y + 2 * s, 6 * s, 3 * s, '#3a3d52');
        rect(q.x + 14 * s, q.y - 4 * s, ix + iw - 10 * s - q.x - 14 * s, 8 * s, col.d);
        lamp(q.x - 30 * s, q.y, 5 * s, done.has(color), col.c);
      }
      // connected wires, then the one being dragged on top (with its plug at the finger)
      for (const color of done) { const a = leftPos(color), b = rightPos(color); wire(a, b, COLORS[color], true); plug(b.x - 4 * s, b.y, s); }
      if (drag) { wire(leftPos(drag.color), drag, COLORS[drag.color], false); plug(drag.x, drag.y, s); }

      // pulsing frames on the plugs until the first connection
      if (active && !drag && done.size === 0) {
        ctx.strokeStyle = `rgba(255,255,255,${0.3 + 0.35 * Math.sin(t * 6)})`;
        ctx.lineWidth = 2;
        for (const color of left) { const q = leftPos(color); ctx.strokeRect(q.x - 18 * s, q.y - 14 * s, 36 * s, 28 * s); }
      }
      // sparks
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt;
        if (p.life <= 0) { sparks.splice(i, 1); continue; }
        rect(p.x - 2 * s, p.y - 2 * s, 4 * s, 4 * s, p.color);
      }
      // green flash when everything is connected
      if (doneAt && t - doneAt < 0.9) rect(L.px, py, pw, ph, `rgba(109,255,176,${0.3 * (1 - (t - doneAt) / 0.9)})`);
      ctx.restore();
      if (dim > 0) rect(0, 0, W, H, `rgba(4,6,20,${0.55 * dim})`);
    }

    function loop(now) {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      t += dt;
      draw(dt);
    }
    raf = requestAnimationFrame(loop);
    requestAnimationFrame(() => el.classList.add('in'));
    intro();
  });
}
