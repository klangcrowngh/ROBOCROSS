// Procedural pixel-art textures drawn on canvases (no image files to load).
// Geometry from models.js has world-scaled UVs, so `tile` = world units per texture repeat.
import * as THREE from 'three';

function rng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function toTex(c, tile = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 8;
  t.repeat.set(1 / tile, 1 / tile);
  return t;
}

function grain(ctx, w, h, amount, r) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

// k in -1..1: darken / lighten
function shade(c, k) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return `rgb(${f((c >> 16) & 255)},${f((c >> 8) & 255)},${f(c & 255)})`;
}

// ---------------------------------------------------------------- RENT ROBOT logo (paths from default-logo.svg)
const RR = [
  'M160.44,240.93l-21.21-43.330h-15.26v43.33h-21.21v-108.63h42.57c5.19,0,9.94.82,14.27,2.44,4.32,1.63,8.03,3.92,11.14,6.87,3.1,2.95,5.52,6.46,7.25,10.53,1.73,4.07,2.59,8.54,2.59,13.43,0,8.85-3.05,16.17-9.15,21.97-1.43,1.43-2.85,2.6-4.27,3.51-1.43.92-3.56,1.93-6.41,3.05l24.26,46.84h-24.56ZM143.96,180.06c4.58,0,8.29-1.33,11.14-3.99,2.85-2.66,4.27-6.13,4.27-10.43s-1.43-7.77-4.27-10.43c-2.85-2.66-6.56-3.99-11.14-3.99h-19.99v28.83h19.99Z',
  'M260.21,240.93l-21.21-43.33h-15.26v43.33h-21.21v-108.63h42.57c5.19,0,9.94.82,14.27,2.44,4.32,1.63,8.03,3.92,11.14,6.87,3.1,2.95,5.52,6.46,7.250,10.53,1.73,4.07,2.59,8.54,2.59,13.43,0,8.85-3.05,16.17-9.15,21.97-1.43,1.43-2.85,2.6-4.27,3.51-1.43.92-3.56,1.93-6.41,3.05l24.26,46.84h-24.56ZM243.74,180.06c4.58,0,8.29-1.33,11.14-3.99,2.85-2.66,4.27-6.13,4.27-10.43s-1.43-7.77-4.27-10.43c-2.85-2.66-6.56-3.99-11.14-3.99h-19.99v28.83h19.99Z',
];
const WORD = [
  'M580.93,252.5h-32.2l-27.8-56.8h-20v56.8h-27.8V110.1h55.8c13.6,0,24.7,4.07,33.3,12.2,8.6,8.13,12.9,18.6,12.9,31.4,0,11.6-4,21.2-12,28.8-3.6,3.47-8.27,6.33-14,8.6l31.8,61.4ZM500.93,172.5h26.2c6,0,10.87-1.73,14.6-5.2,3.73-3.47,5.6-8,5.6-13.6s-1.87-10.13-5.6-13.6c-3.73-3.47-8.6-5.2-14.6-5.2h-26.2v37.6Z',
  'M697.73,252.5h-93.8V110.1h93.8v24.8h-66v33.4h56.2v24.8h-56.2v34.6h66v24.8Z',
  'M833.93,252.5h-24.8l-56.4-87.4v87.4h-27.8V110.1h24.8l56.4,87.2v-87.2h27.8v142.4Z',
  'M958.73,134.9h-37.2v117.6h-27.8v-117.6h-37.2v-24.8h102.2v24.8Z',
  'M1135.53,252.5h-32.2l-27.8-56.8h-20v56.8h-27.8V110.1h55.8c13.6,0,24.7,4.07,33.3,12.2,8.6,8.13,12.9,18.6,12.9,31.4,0,11.6-4,21.2-12,28.8-3.6,3.47-8.27,6.33-14,8.6l31.8,61.4ZM1055.53,172.5h26.2c6,0,10.87-1.73,14.6-5.2,3.73-3.47,5.6-8,5.6-13.6s-1.87-10.130-5.6-13.6c-3.73-3.47-8.6-5.2-14.6-5.2h-26.2v37.6Z',
  'M1258.93,181.3c0,16.13-.67,27.27-2,33.4-2.13,9.33-6.2,17.13-12.2,23.4-10,10.4-22.8,15.6-38.4,15.6s-28.47-5.2-38.6-15.6c-4.4-4.4-7.7-10.07-9.9-17-2.2-6.93-3.43-12.63-3.7-17.1-.27-4.47-.4-10.43-.4-17.9v-10.6c0-14.27.97-24.93,2.9-32,1.93-7.07,5.63-13.4,11.1-19,10.13-10.4,23-15.6,38.6-15.6s28.27,5.2,38.4,15.6c9.47,9.6,14.2,25.2,14.2,46.8v10ZM1231.13,178.7c0-11.73-.47-20.13-1.4-25.2-.93-5.070-2.8-9.13-5.6-12.2-4.4-5.07-10.33-7.6-17.8-7.6s-13.6,2.53-18,7.6c-2.93,3.2-4.8,7.7-5.6,13.5-.8,5.8-1.2,13.97-1.2,24.5v11.6c0,.93.03,2.67.1,5.2.07,2.53.17,4.33.3,5.4.13,1.07.3,2.63.5,4.7.2,2.07.47,3.67.8,4.8.33,1.13.73,2.43,1.2,3.9.47,1.47,1.03,2.7,1.7,3.7.67,1,1.4,1.9,2.2,2.7,5.07,5.07,11.07,7.6,18,7.6,7.46,0,13.4-2.53,17.8-7.6,2.93-3.33,4.83-7.67,5.7-13,.87-5.33,1.3-15.2,1.3-29.6Z',
  'M1370.93,179.5c4.53,2.4,8.13,4.93,10.8,7.6,5.87,6.27,8.8,14.47,8.8,24.6,0,12.53-3.93,22.47-11.8,29.8-7.87,7.33-18.47,11-31.8,11h-59.6V110.1h57.2c13.47,0,24.17,3.53,32.1,10.6,7.93,7.07,11.9,16.6,11.9,28.6,0,13.6-5.870,23.67-17.6,30.2ZM1315.13,167.7h27.2c5.73,0,10.23-1.47,13.5-4.4,3.27-2.93,4.9-6.93,4.9-12s-1.63-9.07-4.9-12c-3.27-2.93-7.77-4.4-13.5-4.4h-27.2v32.8ZM1315.13,227.7h29c5.73,0,10.27-1.6,13.6-4.8,3.33-3.2,5-7.47,5-12.8s-1.67-9.57-5-12.7c-3.33-3.13-7.87-4.7-13.6-4.7h-29v35Z',
  'M1519.32,181.3c0,16.13-.67,27.27-2,33.4-2.13,9.33-6.2,17.13-12.2,23.4-10,10.4-22.8,15.6-38.4,15.6s-28.47-5.2-38.6-15.6c-4.4-4.4-7.7-10.07-9.9-17-2.2-6.93-3.43-12.63-3.7-17.1-.27-4.47-.4-10.43-.4-17.9v-10.6c0-14.27.97-24.93,2.9-32,1.93-7.07,5.63-13.4,11.1-19,10.13-10.4,23-15.6,38.6-15.6s28.27,5.2,38.4,15.6c9.47,9.6,14.2,25.2,14.2,46.8v10ZM1491.52,178.7c0-11.73-.47-20.13-1.4-25.2-.93-5.07-2.8-9.13-5.6-12.2-4.4-5.07-10.33-7.6-17.8-7.6s-13.6,2.53-18,7.6c-2.93,3.2-4.8,7.7-5.6,13.5-.8,5.8-1.2,13.97-1.2,24.5v11.6c0,.93.03,2.67.1,5.2.07,2.53.17,4.33.3,5.4.13,1.07.3,2.63.5,4.7.2,2.07.47,3.67.8,4.8.33,1.13.73,2.43,1.2,3.9.47,1.47,1.03,2.7,1.7,3.7.67,1,1.4,1.9,2.2,2.7,5.07,5.07,11.07,7.6,18,7.6,7.46,0,13.4-2.53,17.8-7.6,2.93-3.33,4.83-7.67,5.7-13,.87-5.33,1.3-15.2,1.3-29.6Z',
  'M1635.33,134.9h-37.2v117.6h-27.8v-117.6h-37.2v-24.8h102.2v24.8Z',
];
let rrPaths, wordPaths;

// RR in a circle, centered at (cx, cy).
export function drawEmblem(x, cx, cy, size, color) {
  rrPaths ??= RR.map((d) => new Path2D(d));
  const s = size / 370;
  x.save();
  x.translate(cx - 185 * s, cy - 185 * s);
  x.scale(s, s);
  x.fillStyle = x.strokeStyle = color;
  rrPaths.forEach((p) => x.fill(p));
  x.lineWidth = 22;
  x.beginPath();
  x.arc(185, 185, 175, 0, Math.PI * 2);
  x.stroke();
  x.restore();
}

// "RENT ROBOT" wordmark, top-left at (left, top).
export function drawWordmark(x, left, top, width, color) {
  wordPaths ??= WORD.map((d) => new Path2D(d));
  const s = width / 1162.4;
  x.save();
  x.translate(left - 472.93 * s, top - 110.1 * s);
  x.scale(s, s);
  x.fillStyle = color;
  wordPaths.forEach((p) => x.fill(p));
  x.restore();
  return 142.4 * s; // height
}

// ---------------------------------------------------------------- ground
const GROUND = {
  sidewalk: () => {
    const [c, x] = canvas(32, 32);
    const r = rng(7);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      x.fillStyle = shade(0xcfd1e6, (r() - 0.5) * 0.08);
      x.fillRect(i * 16, j * 16, 16, 16);
      x.fillStyle = '#a2a5c3';
      x.fillRect(i * 16 + 15, j * 16, 1, 16);
      x.fillRect(i * 16, j * 16 + 15, 16, 1);
      x.fillStyle = 'rgba(255,255,255,.45)';
      x.fillRect(i * 16, j * 16, 15, 1);
      x.fillRect(i * 16, j * 16, 1, 15);
    }
    grain(x, 32, 32, 14, r);
    return toTex(c, 1);
  },
  plaza: () => {
    const [c, x] = canvas(64, 64);
    const r = rng(11);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      x.fillStyle = (i + j) % 2 ? '#b7b9da' : '#a7aad0';
      x.fillRect(i * 32, j * 32, 32, 32);
      x.fillStyle = '#8c8fb8';
      x.fillRect(i * 32 + 31, j * 32, 1, 32);
      x.fillRect(i * 32, j * 32 + 31, 32, 1);
      x.fillStyle = 'rgba(255,255,255,.3)';
      x.fillRect(i * 32 + 14, j * 32 + 14, 4, 4);
    }
    grain(x, 64, 64, 12, r);
    return toTex(c, 2);
  },
  asphalt: () => {
    const [c, x] = canvas(64, 64);
    const r = rng(3);
    x.fillStyle = '#3b3f6b';
    x.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 6; i++) {
      x.fillStyle = r() < 0.5 ? 'rgba(20,22,45,.25)' : 'rgba(110,115,170,.18)';
      x.fillRect(r() * 56, r() * 56, 6 + r() * 14, 4 + r() * 10);
    }
    for (let i = 0; i < 500; i++) {
      x.fillStyle = r() < 0.5 ? '#2c2e50' : '#4b5080';
      x.fillRect(Math.floor(r() * 64), Math.floor(r() * 64), 1, 1);
    }
    // Wet road: neon reflections.
    for (let i = 0; i < 7; i++) {
      const sx = Math.floor(r() * 62), sy = Math.floor(r() * 40), len = 10 + Math.floor(r() * 22);
      const col = ['255,79,216', '53,230,255', '180,107,255'][i % 3];
      for (let k = 0; k < len; k++) {
        x.fillStyle = `rgba(${col},${(0.3 * (1 - k / len)).toFixed(3)})`;
        x.fillRect(sx, (sy + k) % 64, 2, 1);
      }
    }
    grain(x, 64, 64, 8, r);
    return toTex(c, 2);
  },
  grass: () => {
    const [c, x] = canvas(32, 32);
    const r = rng(23);
    x.fillStyle = '#5cc463';
    x.fillRect(0, 0, 32, 32);
    for (let i = 0; i < 160; i++) {
      x.fillStyle = ['#4fb356', '#6ad46e', '#46a64e', '#7ae07a'][Math.floor(r() * 4)];
      const px = Math.floor(r() * 32), py = Math.floor(r() * 32);
      x.fillRect(px, py, 1, 1 + Math.floor(r() * 2));
    }
    for (let i = 0; i < 4; i++) {
      x.fillStyle = r() < 0.5 ? '#ffffff' : '#ffe066';
      x.fillRect(Math.floor(r() * 32), Math.floor(r() * 32), 1, 1);
    }
    return toTex(c, 1);
  },
  concrete: () => {
    const [c, x] = canvas(32, 32);
    const r = rng(5);
    x.fillStyle = '#8b8fb0';
    x.fillRect(0, 0, 32, 32);
    x.fillStyle = '#6f7395';
    x.fillRect(0, 15, 32, 1);
    x.fillRect(15, 0, 1, 15);
    x.fillRect(7, 16, 1, 16);
    x.fillRect(23, 16, 1, 16);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = 'rgba(40,40,70,.12)';
      x.fillRect(r() * 28, r() * 28, 3 + r() * 6, 2 + r() * 5);
    }
    grain(x, 32, 32, 14, r);
    return toTex(c, 2);
  },
  // Lights of the lower city levels seen deep down.
  abyss: () => {
    const [c, x] = canvas(96, 96);
    const r = rng(17);
    const g = x.createLinearGradient(0, 0, 0, 96);
    g.addColorStop(0, '#0b0e2c');
    g.addColorStop(1, '#05061a');
    x.fillStyle = g;
    x.fillRect(0, 0, 96, 96);
    for (let i = 0; i < 40; i++) {
      const w = 6 + Math.floor(r() * 12), h = 6 + Math.floor(r() * 14);
      const bx = Math.floor(r() * 96), by = Math.floor(r() * 96);
      x.fillStyle = r() < 0.5 ? '#12153a' : '#191c48';
      x.fillRect(bx, by, w, h);
      for (let k = 0; k < 6; k++) {
        x.fillStyle = ['#35e6ff', '#ff4fd8', '#ffd27a', '#8a7dff'][Math.floor(r() * 4)];
        x.globalAlpha = 0.4 + r() * 0.6;
        x.fillRect(bx + Math.floor(r() * w), by + Math.floor(r() * h), 1, 1);
      }
      x.globalAlpha = 1;
    }
    for (let i = 0; i < 6; i++) {
      x.fillStyle = r() < 0.5 ? 'rgba(53,230,255,.5)' : 'rgba(255,79,216,.5)';
      x.fillRect(0, Math.floor(r() * 96), 96, 1);
    }
    return toTex(c, 6);
  },
};

const texCache = new Map();
function tex(name) {
  if (!texCache.has(name)) texCache.set(name, GROUND[name]());
  return texCache.get(name);
}

const matCache = new Map();
export function groundMat(name, tint = 0xffffff) {
  const k = `${name}|${tint}`;
  if (!matCache.has(k)) {
    matCache.set(k, name === 'abyss'
      ? new THREE.MeshBasicMaterial({ map: tex(name), color: tint, fog: false })
      : new THREE.MeshLambertMaterial({ map: tex(name), color: tint }));
  }
  return matCache.get(k);
}

// ---------------------------------------------------------------- facades
// 32px tile = 2x2 world units, one window cell = 8px = 0.5 units (one floor).
const FACADES = ['glass', 'stone', 'dark', 'brick', 'white', 'glass2', 'stone2', 'red', 'eco', 'rust', 'plate'];

function facade(style, seed) {
  const r = rng(seed);
  const [c, x] = canvas(32, 32);
  const [ce, e] = canvas(32, 32);
  e.fillStyle = '#000';
  e.fillRect(0, 0, 32, 32);
  const lit = (px, py, w, h, color, chance) => {
    if (r() > chance) return false;
    x.fillStyle = e.fillStyle = color;
    x.fillRect(px, py, w, h);
    e.fillRect(px, py, w, h);
    return true;
  };
  const cells = (fn) => { for (let cy = 0; cy < 32; cy += 8) for (let cx = 0; cx < 32; cx += 8) fn(cx, cy); };

  switch (style) {
    case 'glass':
    case 'glass2': {
      const base = style === 'glass' ? 0x4a7cc4 : 0x3fa0b8;
      x.fillStyle = shade(base, -0.3);
      x.fillRect(0, 0, 32, 32);
      cells((cx, cy) => {
        x.fillStyle = shade(base, (r() - 0.5) * 0.25);
        x.fillRect(cx + 1, cy + 1, 7, 7);
        x.fillStyle = 'rgba(255,255,255,.25)';
        x.fillRect(cx + 2, cy + 2, 2, 1);
        x.fillRect(cx + 2, cy + 3, 1, 1);
        lit(cx + 1, cy + 1, 7, 7, '#7fefff', 0.1);
      });
      x.fillStyle = '#c8d6f0';
      for (let y = 0; y < 32; y += 8) x.fillRect(0, y, 32, 1);
      break;
    }
    case 'stone':
    case 'stone2': {
      const wall = style === 'stone' ? 0xc4b2d4 : 0xd4c2a4;
      x.fillStyle = shade(wall, 0);
      x.fillRect(0, 0, 32, 32);
      cells((cx, cy) => {
        x.fillStyle = shade(wall, -0.15);
        x.fillRect(cx + 1, cy + 6, 6, 1);
        x.fillStyle = shade(wall, 0.25);
        x.fillRect(cx + 1, cy, 6, 1);
        if (!lit(cx + 2, cy + 1, 4, 5, '#ffd27a', 0.3)) {
          x.fillStyle = '#272b4e';
          x.fillRect(cx + 2, cy + 1, 4, 5);
          x.fillStyle = '#4a5488';
          x.fillRect(cx + 2, cy + 1, 1, 2);
        }
        x.fillStyle = shade(wall, -0.3);
        x.fillRect(cx + 4, cy + 1, 1, 5);
      });
      break;
    }
    case 'dark': {
      x.fillStyle = '#2a2c52';
      x.fillRect(0, 0, 32, 32);
      cells((cx, cy) => {
        if (!lit(cx, cy + 3, 8, 3, r() < 0.5 ? '#35e6ff' : '#ff4fd8', 0.25)) {
          x.fillStyle = '#14163a';
          x.fillRect(cx, cy + 3, 8, 3);
        }
      });
      x.fillStyle = e.fillStyle = '#ff4fd8';
      x.fillRect(0, 0, 1, 32);
      e.fillRect(0, 0, 1, 32);
      break;
    }
    case 'brick': {
      x.fillStyle = '#7a3f5e';
      x.fillRect(0, 0, 32, 32);
      x.fillStyle = '#5e2d48';
      for (let y = 0; y < 32; y += 2) {
        x.fillRect(0, y, 32, 1);
        for (let bx = (y / 2) % 2 ? 0 : 2; bx < 32; bx += 4) x.fillRect(bx, y + 1, 1, 1);
      }
      cells((cx, cy) => {
        x.fillStyle = '#d8c8d8';
        x.fillRect(cx + 1, cy + 7, 6, 1);
        if (!lit(cx + 2, cy + 1, 4, 6, '#ffb86b', 0.22)) {
          x.fillStyle = '#1e2040';
          x.fillRect(cx + 2, cy + 1, 4, 6);
        }
      });
      break;
    }
    case 'red': {
      // Neo-Tokyo: dark red with lantern-lit windows
      x.fillStyle = '#5a1a2a';
      x.fillRect(0, 0, 32, 32);
      cells((cx, cy) => {
        x.fillStyle = '#3a0e1a';
        x.fillRect(cx, cy + 6, 8, 2);
        if (!lit(cx + 1, cy + 1, 6, 4, r() < 0.6 ? '#ff6a4a' : '#ffd27a', 0.4)) {
          x.fillStyle = '#1a0a14';
          x.fillRect(cx + 1, cy + 1, 6, 4);
        }
      });
      break;
    }
    case 'eco': {
      // glass with hanging gardens
      x.fillStyle = '#2f6a6a';
      x.fillRect(0, 0, 32, 32);
      cells((cx, cy) => {
        x.fillStyle = shade(0x5ab8b0, (r() - 0.5) * 0.3);
        x.fillRect(cx + 1, cy + 1, 7, 5);
        lit(cx + 1, cy + 1, 7, 5, '#c8fff0', 0.12);
        x.fillStyle = r() < 0.5 ? '#3fae49' : '#5ad15a';
        x.fillRect(cx, cy + 6, 8, 2);
        if (r() < 0.4) x.fillRect(cx + Math.floor(r() * 6), cy + 4, 2, 2);
      });
      break;
    }
    case 'rust': {
      // industrial corrugated metal
      x.fillStyle = '#8a5a3a';
      x.fillRect(0, 0, 32, 32);
      for (let i = 0; i < 32; i += 2) {
        x.fillStyle = '#6e4430';
        x.fillRect(i, 0, 1, 32);
      }
      cells((cx, cy) => {
        if (cy % 16) return;
        if (!lit(cx + 1, cy + 2, 6, 3, '#ffb24a', 0.25)) {
          x.fillStyle = '#2a2026';
          x.fillRect(cx + 1, cy + 2, 6, 3);
        }
      });
      break;
    }
    case 'plate': {
      x.fillStyle = '#7d8296';
      x.fillRect(0, 0, 32, 32);
      x.fillStyle = '#5d6276';
      for (let i = 0; i < 32; i += 16) { x.fillRect(i, 0, 1, 32); x.fillRect(0, i, 32, 1); }
      cells((cx, cy) => {
        if ((cx + cy) % 16) return;
        if (!lit(cx + 2, cy + 2, 4, 4, '#ffd21f', 0.3)) {
          x.fillStyle = '#2a2d3a';
          x.fillRect(cx + 2, cy + 2, 4, 4);
        }
      });
      break;
    }
    case 'white': {
      x.fillStyle = '#e4e6f2';
      x.fillRect(0, 0, 32, 32);
      cells((cx, cy) => {
        if (!lit(cx, cy + 3, 8, 3, '#8ff0ff', 0.15)) {
          x.fillStyle = '#2a3a6a';
          x.fillRect(cx, cy + 3, 8, 3);
        }
        x.fillStyle = '#c4c7da';
        x.fillRect(cx + 7, cy, 1, 3);
      });
      break;
    }
  }
  grain(x, 32, 32, 10, r);
  return { map: toTex(c, 2), emissiveMap: toTex(ce, 2) };
}

const facadeCache = [];
export const FACADE_COUNT = FACADES.length;
let glowLevel = 0.7;
export function facadeMat(i) {
  if (!facadeCache[i]) {
    const { map, emissiveMap } = facade(FACADES[i], 100 + i * 37);
    facadeCache[i] = new THREE.MeshLambertMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: glowLevel });
  }
  return facadeCache[i];
}

// Windows light up at night.
export function setWindowGlow(k) {
  glowLevel = k;
  for (const m of facadeCache) if (m) m.emissiveIntensity = k;
}

// ---------------------------------------------------------------- neon sign atlas (one material for every sign)
const FONT = '"Press Start 2P", monospace';
const ATLAS = 1024;

// kind: [cell w, cell h, cells per row, top y, designs]
const SIGNS = {
  h: [128, 64, 8, 0, [
    { text: 'ROBO', fg: '#ffd21f', bg: '#1a1840', border: '#35e6ff' },
    { text: 'NEO', fg: '#35e6ff', bg: '#20103a', border: '#ff4fd8' },
    { text: '24/7', fg: '#ff4fd8', bg: '#12122e', border: '#ff4fd8' },
    { text: 'CYBER', fg: '#6dffb0', bg: '#0f1d2e', border: '#6dffb0' },
    { text: 'HOTEL', fg: '#ffffff', bg: '#3a1050', border: '#b46bff' },
    { text: 'TAXI', fg: '#1a1a1a', bg: '#ffd21f', border: '#1a1a1a' },
    { text: 'BAR', fg: '#ff6f6f', bg: '#1d0f22', border: '#ff6f6f' },
    { face: true, fg: '#35e6ff', bg: '#123070', border: '#35e6ff' },
    { arrows: true, fg: '#35e6ff', bg: '#123070', border: '#35e6ff' },
    { text: 'NYC', fg: '#ffffff', bg: '#2b6bff', border: '#ffffff' },
    { combo: true, fg: '#ffffff', bg: '#2b6bff', border: '#35e6ff' },
    { combo: true, fg: '#ffd21f', bg: '#1a1840', border: '#ff4fd8' },
  ]],
  v: [32, 128, 32, 128, [
    { text: 'ROBO', fg: '#ffd21f', bg: '#1a1840', border: '#35e6ff' },
    { text: 'NEO', fg: '#35e6ff', bg: '#20103a', border: '#ff4fd8' },
    { text: 'CYBER', fg: '#6dffb0', bg: '#0f1d2e', border: '#6dffb0' },
    { text: 'HOTEL', fg: '#ffffff', bg: '#3a1050', border: '#b46bff' },
    { text: 'BAR', fg: '#ff6f6f', bg: '#1d0f22', border: '#ff6f6f' },
    { text: 'RENT', fg: '#ffffff', bg: '#e0307a', border: '#ffd0f0' },
    { text: 'ROBOT', fg: '#35e6ff', bg: '#123070', border: '#35e6ff' },
  ]],
  tower: [64, 96, 16, 256, [
    { tower: true, fg: '#ff7fe0', bg: '#5a1060', border: '#ff4fd8' },
    { tower: true, fg: '#ffffff', bg: '#e0307a', border: '#ffd0f0' },
    { emblem: true, fg: '#ffffff', bg: '#e0307a', border: '#ffd0f0' },
    { emblem: true, fg: '#35e6ff', bg: '#123070', border: '#35e6ff' },
  ]],
  logo: [128, 128, 8, 352, [
    { emblem: true, fg: '#35e6ff', bg: '#102a66', border: '#35e6ff' },
    { emblem: true, fg: '#ffffff', bg: '#c0287a', border: '#ff9be0' },
    { emblem: true, fg: '#ffd21f', bg: '#1a1840', border: '#ffd21f' },
    { face: true, fg: '#35e6ff', bg: '#123070', border: '#35e6ff' },
  ]],
  word: [256, 64, 4, 480, [
    { word: true, fg: '#ffffff', bg: '#2b6bff', border: '#ffffff' },
    { word: true, fg: '#35e6ff', bg: '#141436', border: '#35e6ff' },
    { word: true, fg: '#ffd21f', bg: '#3a1050', border: '#ff4fd8' },
  ]],
};
export const SIGN_COUNT = Object.fromEntries(Object.entries(SIGNS).map(([k, v]) => [k, v[4].length]));

function drawSign(x, s, ox, oy, w, h, vertical) {
  x.save();
  x.translate(ox, oy);
  x.beginPath();
  x.rect(0, 0, w, h);
  x.clip();
  x.fillStyle = s.bg;
  x.fillRect(0, 0, w, h);
  x.fillStyle = s.border;
  x.fillRect(0, 0, w, 3); x.fillRect(0, h - 3, w, 3);
  x.fillRect(0, 0, 3, h); x.fillRect(w - 3, 0, 3, h);
  x.fillStyle = s.fg;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  const u = Math.min(w, h) / 16;
  if (s.emblem) {
    drawEmblem(x, w / 2, h / 2, Math.min(w, h) * 0.78, s.fg);
  } else if (s.word) {
    const ww = w * 0.86;
    const hh = 142.4 * (ww / 1162.4);
    drawWordmark(x, (w - ww) / 2, (h - hh) / 2, ww, s.fg);
  } else if (s.combo) {
    drawEmblem(x, h / 2 + 2, h / 2, h * 0.76, s.fg);
    const ww = w - h - 8;
    const hh = 142.4 * (ww / 1162.4);
    drawWordmark(x, h + 2, (h - hh) / 2, ww, s.fg);
  } else if (s.face) {
    const k = u * 2;
    x.fillRect(w / 2 - 3 * k, h / 2 - 2.5 * k, 6 * k, 5 * k);
    x.fillStyle = s.bg;
    x.fillRect(w / 2 - 2.4 * k, h / 2 - 1.9 * k, 4.8 * k, 3.8 * k);
    x.fillStyle = s.fg;
    x.fillRect(w / 2 - 1.4 * k, h / 2 - 1 * k, 0.8 * k, 1.8 * k);
    x.fillRect(w / 2 + 0.6 * k, h / 2 - 1 * k, 0.8 * k, 1.8 * k);
  } else if (s.tower) {
    const cx = Math.floor(w / 2);
    x.fillRect(cx - 0.5 * u, h / 2 - 7 * u, u, 3 * u);
    x.fillRect(cx - 3 * u, h / 2 - 4 * u, 6 * u, 1.5 * u);
    x.fillRect(cx - 2 * u, h / 2 - 2.5 * u, 4 * u, u);
    x.fillRect(cx - 0.75 * u, h / 2 - 1.5 * u, 1.5 * u, 6 * u);
    x.fillRect(cx - 2.5 * u, h / 2 + 4.5 * u, 5 * u, 1.2 * u);
    x.fillRect(cx - 1.75 * u, h / 2 + 2 * u, u, 2.5 * u);
    x.fillRect(cx + 0.75 * u, h / 2 + 2 * u, u, 2.5 * u);
  } else if (s.arrows) {
    x.font = `${Math.floor(h * 0.45)}px ${FONT}`;
    x.fillText('>>>', w / 2, h / 2 + 2);
  } else if (vertical) {
    const step = (h - 12) / s.text.length;
    x.font = `${Math.floor(Math.min(w * 0.6, step * 0.8))}px ${FONT}`;
    [...s.text].forEach((ch, i) => x.fillText(ch, w / 2, 8 + step * (i + 0.5)));
  } else {
    x.font = `${Math.floor(Math.min(h * 0.45, (w * 1.4) / s.text.length / 1.2))}px ${FONT}`;
    x.fillText(s.text, w / 2, h / 2 + 2);
  }
  x.restore();
}

let atlasMat = null;
export function signMaterial() {
  if (!atlasMat) {
    const [c, x] = canvas(ATLAS, ATLAS);
    for (const [kind, [w, h, per, top, list]] of Object.entries(SIGNS)) {
      list.forEach((s, i) => drawSign(x, s, (i % per) * w, top + Math.floor(i / per) * h, w, h, kind === 'v'));
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.anisotropy = 8;
    atlasMat = new THREE.MeshBasicMaterial({ map: t });
  }
  return atlasMat;
}

// UV rectangle of a sign in the atlas.
export function signRect(kind, i) {
  const [w, h, per, top] = SIGNS[kind];
  const x = (i % per) * w, y = top + Math.floor(i / per) * h;
  return [x / ATLAS, 1 - (y + h) / ATLAS, (x + w) / ATLAS, 1 - y / ATLAS];
}

// ---------------------------------------------------------------- RR token
let coinMaterial = null;
export function coinMat() {
  if (!coinMaterial) {
    const [c, x] = canvas(64, 64);
    x.fillStyle = '#f2b31b';
    x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#ffe066';
    x.fillRect(4, 4, 56, 56);
    drawEmblem(x, 32, 32, 50, '#9a5a00');
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    coinMaterial = new THREE.MeshBasicMaterial({ map: t });
  }
  return coinMaterial;
}

// ---------------------------------------------------------------- sky (time of day), redrawn when it changes
export const FOG_COLOR = 0xb3c9ff;

// o: { top, mid, hor, tower1, tower2, stars 0..1, lights 0..1, clouds 0..1, cloud 'r,g,b' }
export function skyTexture(aspect, horizon, o) {
  const W = 256, H = Math.max(64, Math.round(W / aspect));
  const [c, x] = canvas(W, H);
  const hy = Math.round(H * horizon);
  const r = rng(29);
  const g = x.createLinearGradient(0, 0, 0, hy);
  g.addColorStop(0, o.top);
  g.addColorStop(0.7, o.mid);
  g.addColorStop(1, o.hor);
  x.fillStyle = g;
  x.fillRect(0, 0, W, hy);
  x.fillStyle = o.hor;
  x.fillRect(0, hy, W, H - hy);

  // stars and moon
  for (let i = 0; i < 90; i++) {
    const sx = Math.floor(r() * W), sy = Math.floor(r() * hy * 0.8), a = r();
    if (o.stars <= 0.02) continue;
    x.fillStyle = `rgba(255,255,255,${(o.stars * (0.3 + a * 0.7)).toFixed(2)})`;
    x.fillRect(sx, sy, 1, 1);
  }
  if (o.stars > 0.1) {
    x.globalAlpha = o.stars;
    x.fillStyle = '#f0f0ff';
    x.fillRect(Math.floor(W * 0.78), Math.floor(hy * 0.18), 10, 10);
    x.fillStyle = o.top;
    x.fillRect(Math.floor(W * 0.78) + 4, Math.floor(hy * 0.18) - 1, 8, 8);
    x.globalAlpha = 1;
  }

  // pixel clouds
  for (let i = 0; i < 5; i++) {
    const cx = r() * W, cy = hy * (0.15 + r() * 0.45), s = 6 + r() * 8;
    x.fillStyle = `rgba(${o.cloud ?? '255,255,255'},${(0.85 * o.clouds).toFixed(2)})`;
    x.fillRect(cx - s * 2, cy, s * 4, s);
    x.fillRect(cx - s, cy - s * 0.7, s * 2.2, s);
    x.fillRect(cx - s * 2.6, cy + s * 0.5, s * 5, s * 0.6);
  }

  // two layers of distant towers; windows glow more at night
  const layer = (color, windows, maxH, count) => {
    for (let i = 0; i < count; i++) {
      const w = 6 + Math.floor(r() * 14);
      const h = Math.floor(hy * (0.08 + r() * maxH));
      const bx = Math.floor(r() * W);
      x.fillStyle = color;
      x.fillRect(bx, hy - h, w, h + 1);
      if (r() < 0.4) x.fillRect(bx + Math.floor(w / 2), hy - h - 8, 1, 8);
      const n = Math.round(windows * (1 + o.lights * 3));
      for (let k = 0; k < n; k++) {
        x.fillStyle = ['#e8f2ff', '#8ff0ff', '#ff9be0', '#ffd27a'][Math.floor(r() * 4)];
        x.globalAlpha = Math.min(1, (0.25 + r() * 0.4) * (0.6 + o.lights));
        x.fillRect(bx + 1 + Math.floor(r() * (w - 2)), hy - h + 2 + Math.floor(r() * (h - 3)), 1, 1);
      }
      x.globalAlpha = 1;
      if (r() < 0.2 && h > 20) {
        x.fillStyle = r() < 0.5 ? '#ff6fd8' : '#4fe6ff';
        x.globalAlpha = Math.min(1, 0.5 + o.lights * 0.5);
        x.fillRect(bx + 1, hy - h + 4, w - 2, 5);
        x.globalAlpha = 1;
      }
    }
  };
  layer(o.tower1, 4, 0.45, 26);
  layer(o.tower2, 8, 0.3, 30);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

// ---------------------------------------------------------------- reaction bubbles over pedestrians
const iconCache = new Map();
export function iconMaterial(name) {
  if (!iconCache.has(name)) {
    const [c, x] = canvas(32, 32);
    x.fillStyle = '#1a1a2a';
    x.fillRect(3, 2, 26, 22);
    x.fillRect(12, 24, 6, 3);
    x.fillRect(14, 27, 3, 2);
    x.fillStyle = '#ffffff';
    x.fillRect(4, 3, 24, 20);
    x.fillRect(13, 23, 4, 3);
    x.fillRect(14, 26, 2, 1);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    const txt = (t, col, size = 12) => { x.fillStyle = col; x.font = `${size}px ${FONT}`; x.fillText(t, 16, 14); };
    switch (name) {
      case '!': txt('!', '#ff2b4a', 14); break;
      case '?': txt('?', '#2b6bff', 14); break;
      case 'hi': txt('HI', '#1a8a4a', 9); break;
      case 'wow': txt('!!', '#ff7a1a', 11); break;
      case 'angry': txt('#', '#d82a2a', 13); break;
      case 'note':
        x.fillStyle = '#b46bff';
        x.fillRect(17, 6, 2, 10); x.fillRect(19, 6, 4, 2); x.fillRect(12, 14, 7, 5);
        break;
      case 'heart':
        x.fillStyle = '#ff4f8a';
        x.fillRect(9, 8, 5, 4); x.fillRect(18, 8, 5, 4);
        x.fillRect(8, 10, 16, 4); x.fillRect(10, 14, 12, 3); x.fillRect(13, 17, 6, 2);
        break;
      case 'hand':
        // raised palm: "give me five"
        x.fillStyle = '#f1c7a0';
        x.fillRect(11, 9, 10, 9);
        for (const fx of [11, 14, 17, 20]) x.fillRect(fx, 5, 2, 5);
        x.fillRect(8, 11, 3, 4);
        x.fillStyle = '#c68e64';
        x.fillRect(11, 17, 10, 1);
        break;
      case 'photo':
        x.fillStyle = '#2a2d3a';
        x.fillRect(8, 9, 16, 10); x.fillRect(12, 7, 6, 3);
        x.fillStyle = '#35e6ff';
        x.fillRect(13, 11, 6, 6);
        break;
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    iconCache.set(name, new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false }));
  }
  return iconCache.get(name);
}

// Big neon gate sign with the district name (Cyrillic text in the pixel font).
const gateCache = new Map();
export function gateMat(text, fg, bg) {
  if (!gateCache.has(text)) {
    const [c, x] = canvas(256, 48);
    x.fillStyle = bg;
    x.fillRect(0, 0, 256, 48);
    x.fillStyle = fg;
    x.fillRect(0, 0, 256, 3); x.fillRect(0, 45, 256, 3);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `${Math.min(18, Math.floor(230 / text.length))}px ${FONT}`;
    x.fillText(text, 128, 26);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.magFilter = THREE.NearestFilter;
    t.anisotropy = 8;
    gateCache.set(text, new THREE.MeshBasicMaterial({ map: t }));
  }
  return gateCache.get(text);
}

// ---------------------------------------------------------------- distant skyline windows (additive, black = no light)
let winTex = null;
export function windowTexture() {
  if (!winTex) {
    const [c, x] = canvas(32, 32);
    const r = rng(41);
    x.fillStyle = '#000';
    x.fillRect(0, 0, 32, 32);
    for (let y = 1; y < 32; y += 4) {
      for (let wx = 1; wx < 32; wx += 3) {
        if (r() > 0.42) continue;
        x.fillStyle = ['#ffd27a', '#bfe8ff', '#8ff0ff', '#ffffff', '#ff9be0'][Math.floor(r() * 5)];
        x.globalAlpha = 0.4 + r() * 0.6;
        x.fillRect(wx, y, 2, 2);
      }
    }
    x.globalAlpha = 1;
    winTex = toTex(c, 6);
  }
  return winTex;
}

// ---------------------------------------------------------------- canal water (each lane gets its own copy to scroll)
let waterCanvas = null;
export function waterMaterial() {
  if (!waterCanvas) {
    const [c, x] = canvas(64, 64);
    const r = rng(53);
    const g = x.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, '#2468d0');
    g.addColorStop(0.5, '#1f5cc0');
    g.addColorStop(1, '#2468d0');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    // wavy ripples running along the flow (x)
    for (let i = 0; i < 14; i++) {
      const y0 = Math.floor(r() * 64), len = 10 + Math.floor(r() * 22), x0 = Math.floor(r() * 64);
      x.fillStyle = r() < 0.6 ? 'rgba(90,170,255,.55)' : 'rgba(160,215,255,.45)';
      for (let k = 0; k < len; k++) x.fillRect((x0 + k) % 64, (y0 + Math.round(Math.sin(k / 3) * 1.5) + 64) % 64, 1, 1);
    }
    for (let i = 0; i < 18; i++) {
      x.fillStyle = 'rgba(255,255,255,.8)';
      x.fillRect(Math.floor(r() * 64), Math.floor(r() * 64), 1, 1);
    }
    waterCanvas = c;
  }
  const map = toTex(waterCanvas, 2);
  const material = new THREE.MeshLambertMaterial({ map, emissive: 0x0b2c7a, emissiveIntensity: 1 });
  return { material, map };
}
