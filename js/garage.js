// Garage: robots and cosmetic items, bought with RR tokens. Each robot keeps its own look
// (colours, paint scheme and head item); bought items can be used on any robot. Stored local +
// Telegram cloud.
import * as THREE from 'three';
import * as M from './models.js';
import { store } from './telegram.js';

export const CATEGORIES = [
  {
    id: 'model', name: 'РОБОТ', items: [
      { id: 'rr', name: 'Agibot', price: 0, color: 0xd6a124 },
      { id: 'titan', name: 'PM01', price: 800, color: 0xe0202c },
      { id: 'dog', name: 'Go2', price: 1200, color: 0x9a9eae },
    ],
  },
  {
    id: 'body', name: 'КОРПУС', items: [
      { id: 'classic', name: 'Классика', price: 0, color: 0xd9dce4 },
      { id: 'snow', name: 'Снег', price: 120, color: 0xf6f8ff },
      { id: 'graphite', name: 'Графит', price: 150, color: 0x4a4e62 },
      { id: 'red', name: 'Алый', price: 200, color: 0xe8202e },
      { id: 'lava', name: 'Лава', price: 200, color: 0xff5a14 },
      { id: 'lemon', name: 'Лимон', price: 200, color: 0xffd400 },
      { id: 'lime', name: 'Лайм', price: 200, color: 0x7cdc1c },
      { id: 'emerald', name: 'Изумруд', price: 220, color: 0x0fb862 },
      { id: 'mint', name: 'Мята', price: 200, color: 0x4ff0b4 },
      { id: 'teal', name: 'Бирюза', price: 220, color: 0x0cc4c0 },
      { id: 'sky', name: 'Небо', price: 200, color: 0x3ea4ff },
      { id: 'cobalt', name: 'Кобальт', price: 250, color: 0x2552ff },
      { id: 'violet', name: 'Фиалка', price: 250, color: 0x7d3cff },
      { id: 'magenta', name: 'Пурпур', price: 250, color: 0xd42ad8 },
      { id: 'rose', name: 'Розовый', price: 200, color: 0xff5aa8 },
      { id: 'night', name: 'Ночь', price: 350, color: 0x23263c },
      { id: 'chrome', name: 'Хром', price: 450, color: 0xeef2ff },
      { id: 'gold', name: 'Золото', price: 600, color: 0xf2b81e },
    ],
  },
  {
    id: 'accent', name: 'АКЦЕНТ', items: [
      { id: 'mustard', name: 'Горчица', price: 0, color: 0xf0a400 },
      { id: 'yellow', name: 'Жёлтый', price: 100, color: 0xffe100 },
      { id: 'orange', name: 'Оранж', price: 100, color: 0xff6a00 },
      { id: 'red', name: 'Красный', price: 100, color: 0xff1e30 },
      { id: 'pink', name: 'Розовый', price: 100, color: 0xff2ec8 },
      { id: 'magenta', name: 'Пурпур', price: 120, color: 0xd21eff },
      { id: 'purple', name: 'Фиолет', price: 120, color: 0x8a3cff },
      { id: 'blue', name: 'Синий', price: 120, color: 0x2a62ff },
      { id: 'cyan', name: 'Неон', price: 100, color: 0x14e4ff },
      { id: 'teal', name: 'Бирюза', price: 120, color: 0x00d6b8 },
      { id: 'green', name: 'Зелёный', price: 120, color: 0x14d850 },
      { id: 'lime', name: 'Лайм', price: 100, color: 0x8cff1e },
      { id: 'white', name: 'Белый', price: 120, color: 0xffffff },
      { id: 'black', name: 'Чёрный', price: 150, color: 0x16171c },
    ],
  },
  {
    // the dark joints and plates
    id: 'trim', name: 'ДЕТАЛИ', items: [
      { id: 'stock', name: 'Стандарт', price: 0, color: 0x2a2b33 },
      { id: 'carbon', name: 'Карбон', price: 120, color: 0x111216 },
      { id: 'navy', name: 'Синие', price: 120, color: 0x1e33a0 },
      { id: 'wine', name: 'Бордо', price: 120, color: 0x8a1230 },
      { id: 'red', name: 'Красные', price: 150, color: 0xc0141e },
      { id: 'orange', name: 'Рыжие', price: 150, color: 0xd0560a },
      { id: 'olive', name: 'Хаки', price: 120, color: 0x4f6e18 },
      { id: 'teal', name: 'Морские', price: 150, color: 0x087c78 },
      { id: 'purple', name: 'Лиловые', price: 150, color: 0x4a1fa0 },
      { id: 'gold', name: 'Латунь', price: 200, color: 0xb88a12 },
      { id: 'steel', name: 'Сталь', price: 150, color: 0x7d88a8 },
      { id: 'white', name: 'Белые', price: 200, color: 0xe4e8f2 },
    ],
  },
  {
    // which parts carry which colour; nothing is added to the robots, they are painted
    // differently: the light bands and shaded sides are where the accent shows best
    id: 'scheme', name: 'СХЕМА', items: [
      { id: 'classic', name: 'Классика', price: 0 },
      { id: 'twotone', name: 'Двухцвет', price: 150 },
      { id: 'mono', name: 'Моно', price: 150 },
      { id: 'inverse', name: 'Инверсия', price: 250 },
      { id: 'neon', name: 'Неон', price: 300 },
      { id: 'stealth', name: 'Стелс', price: 350 },
    ],
  },
  {
    id: 'eyes', name: 'ГЛАЗА', items: [
      { id: 'white', name: 'Белые', price: 0, color: 0xf4f6ff },
      { id: 'cyan', name: 'Голубые', price: 80, color: 0x14e4ff },
      { id: 'blue', name: 'Синие', price: 80, color: 0x3a7bff },
      { id: 'pink', name: 'Розовые', price: 80, color: 0xff2ec8 },
      { id: 'yellow', name: 'Жёлтые', price: 80, color: 0xffd400 },
      { id: 'green', name: 'Зелёные', price: 80, color: 0x30ff90 },
      { id: 'lime', name: 'Лайм', price: 80, color: 0xb4ff2a },
      { id: 'orange', name: 'Оранж', price: 80, color: 0xff8a10 },
      { id: 'violet', name: 'Фиолет', price: 100, color: 0xa86cff },
      { id: 'red', name: 'Красные', price: 120, color: 0xff2030 },
      { id: 'rainbow', name: 'Радуга', price: 300, color: 0xff4fd8 },
    ],
  },
  {
    id: 'acc', name: 'ГОЛОВА', items: [
      { id: 'none', name: 'Нет', price: 0 },
      { id: 'antenna', name: 'Антенна', price: 120 },
      { id: 'cone', name: 'Конус', price: 120 },
      { id: 'shades', name: 'Очки', price: 150 },
      { id: 'cap', name: 'Кепка', price: 150 },
      { id: 'bulb', name: 'Лампочка', price: 150 },
      { id: 'party', name: 'Колпак', price: 150 },
      { id: 'wifi', name: 'Wi-Fi', price: 180 },
      { id: 'mohawk', name: 'Ирокез', price: 200 },
      { id: 'catears', name: 'Ушки', price: 200 },
      { id: 'headphones', name: 'Наушники', price: 200 },
      { id: 'dish', name: 'Тарелка', price: 200 },
      { id: 'arrow', name: 'Стрела', price: 200 },
      { id: 'radar', name: 'Радар', price: 220 },
      { id: 'horns', name: 'Рога', price: 250 },
      { id: 'siren', name: 'Мигалка', price: 250 },
      { id: 'exhaust', name: 'Выхлоп', price: 250 },
      { id: 'halo', name: 'Нимб', price: 300 },
      { id: 'propeller', name: 'Пропеллер', price: 300 },
      { id: 'unicorn', name: 'Рог', price: 300 },
      { id: 'tophat', name: 'Цилиндр', price: 350 },
      { id: 'tesla', name: 'Тесла', price: 400 },
      { id: 'dome', name: 'Мозг', price: 450 },
      { id: 'crown', name: 'Корона', price: 500 },
    ],
  },
];

// the look each robot starts with (PM01 comes with its red core, Go2 with green lights)
const LOOKS = {
  rr: { body: 'classic', accent: 'mustard', trim: 'stock', scheme: 'classic', eyes: 'white', acc: 'none' },
  titan: { body: 'classic', accent: 'red', trim: 'stock', scheme: 'classic', eyes: 'white', acc: 'none' },
  dog: { body: 'classic', accent: 'lime', trim: 'stock', scheme: 'classic', eyes: 'yellow', acc: 'none' },
};
const DEFAULT = {
  owned: ['model:rr', 'body:classic', 'accent:mustard', 'trim:stock', 'scheme:classic', 'eyes:white', 'acc:none'],
  model: 'rr',
  looks: structuredClone(LOOKS),
};
export let garage = structuredClone(DEFAULT);

export async function loadGarage() {
  try {
    const g = JSON.parse((await store.get('garage')) || 'null');
    if (g && g.owned) {
      const looks = structuredClone(LOOKS);
      if (g.equip) Object.assign(looks.rr, g.equip); // older saves had one look
      for (const k in g.looks || {}) Object.assign(looks[k] ??= {}, g.looks[k]);
      garage = { owned: [...new Set([...DEFAULT.owned, ...g.owned])], model: g.model || 'rr', looks };
      if (!owns('model', garage.model)) garage.model = 'rr';
    }
  } catch {}
  return garage;
}

// what is equipped in a category for the current robot
export const equipped = (cat) => (cat === 'model' ? garage.model : garage.looks[garage.model][cat]);

const save = () => store.set('garage', JSON.stringify(garage));
export const item = (cat, id) => CATEGORIES.find((c) => c.id === cat).items.find((i) => i.id === id)
  ?? CATEGORIES.find((c) => c.id === cat).items[0]; // an item that no longer exists falls back
export const owns = (cat, id) => garage.owned.includes(`${cat}:${id}`);

// Buy if needed (returns the price paid, or -1 if not enough tokens), then equip.
export function choose(cat, id, coins) {
  const it = item(cat, id);
  let paid = 0;
  if (!owns(cat, id)) {
    if (coins < it.price) return -1;
    garage.owned.push(`${cat}:${id}`);
    if (cat === 'model') for (const [c, v] of Object.entries(LOOKS[id])) if (!owns(c, v)) garage.owned.push(`${c}:${v}`);
    paid = it.price;
  }
  if (cat === 'model') garage.model = id;
  else garage.looks[garage.model][cat] = id;
  save();
  return paid;
}

// ---------------------------------------------------------------- head items
// Each item is built on the head (top at y 0.22, face at z -0.1). Animated ones get a
// userData.tick(time) that the game calls every frame.
function accessory(kind, accent) {
  const g = new THREE.Group();
  const glow = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o });
  const lit = (c) => new THREE.MeshLambertMaterial({ color: c });
  const add = (w, h, d, m, x, y, z, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b; };
  const metal = lit(0x8a90a8), dark = lit(0x2a2b33);
  if (kind === 'antenna') {
    add(0.02, 0.14, 0.02, lit(0x3a3b46), 0.05, 0.29, 0);
    const ball = glow(accent);
    add(0.05, 0.05, 0.05, ball, 0.05, 0.37, 0);
    const base = new THREE.Color(accent);
    g.userData.tick = (t) => ball.color.copy(base).multiplyScalar(0.6 + 0.4 * (Math.sin(t * 6) * 0.5 + 0.5));
  } else if (kind === 'cap') {
    add(0.23, 0.06, 0.23, lit(accent), 0, 0.25, 0);
    add(0.17, 0.02, 0.11, lit(accent), 0, 0.225, -0.15);
    add(0.05, 0.02, 0.05, lit(0xffffff), 0, 0.29, 0);
  } else if (kind === 'headphones') {
    add(0.27, 0.03, 0.05, dark, 0, 0.255, 0);
    for (const s of [-1, 1]) {
      add(0.03, 0.1, 0.04, dark, s * 0.13, 0.2, 0);
      add(0.06, 0.12, 0.12, lit(accent), s * 0.14, 0.11, 0.005);
    }
  } else if (kind === 'halo') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 6, 20), glow(0xffe066));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.34;
    g.add(ring);
    g.userData.tick = (t) => { ring.position.y = 0.34 + Math.sin(t * 2.5) * 0.012; };
  } else if (kind === 'shades') {
    add(0.22, 0.045, 0.02, lit(0x15161c), 0, 0.125, -0.115);
    for (const s of [-1, 1]) add(0.075, 0.03, 0.022, glow(accent), s * 0.048, 0.125, -0.117);
  } else if (kind === 'mohawk') {
    for (let i = -2; i <= 2; i++) add(0.035, 0.09 - Math.abs(i) * 0.015, 0.04, lit(accent), 0, 0.26 - Math.abs(i) * 0.008, i * 0.045);
  } else if (kind === 'catears') {
    for (const s of [-1, 1]) {
      add(0.07, 0.045, 0.035, dark, s * 0.07, 0.24, 0);
      add(0.04, 0.04, 0.035, dark, s * 0.075, 0.28, 0);
      add(0.03, 0.04, 0.01, lit(accent), s * 0.072, 0.255, -0.019);
    }
  } else if (kind === 'horns') {
    for (const s of [-1, 1]) {
      add(0.045, 0.06, 0.045, lit(0xf0e6d2), s * 0.075, 0.25, -0.02);
      add(0.035, 0.05, 0.035, lit(0xf0e6d2), s * 0.095, 0.3, -0.04);
      add(0.025, 0.04, 0.025, lit(accent), s * 0.11, 0.34, -0.055);
    }
  } else if (kind === 'propeller') {
    add(0.13, 0.04, 0.13, lit(accent), 0, 0.24, 0);
    add(0.015, 0.06, 0.015, lit(0x3a3b46), 0, 0.29, 0);
    const blade = new THREE.Group();
    blade.position.y = 0.32;
    blade.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.045), lit(0xff3a5a)));
    blade.add(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.3), lit(0x35e6ff)));
    g.add(blade);
    g.userData.tick = (t) => { blade.rotation.y = t * 14; };
  } else if (kind === 'tophat') {
    add(0.26, 0.02, 0.26, lit(0x1a1b22), 0, 0.225, 0);
    add(0.16, 0.15, 0.16, lit(0x1a1b22), 0, 0.31, 0);
    add(0.163, 0.03, 0.163, lit(accent), 0, 0.25, 0);
  } else if (kind === 'crown') {
    add(0.2, 0.05, 0.2, lit(0xe8c040), 0, 0.245, 0);
    for (const [x, z] of [[0.08, 0.08], [-0.08, 0.08], [0.08, -0.08], [-0.08, -0.08]]) add(0.04, 0.06, 0.04, lit(0xe8c040), x, 0.3, z);
    add(0.04, 0.04, 0.02, glow(0xff3a5a), 0, 0.25, -0.105);
  } else if (kind === 'cone') {
    // a traffic cone stuck on the head
    const o = lit(0xff6a00), w = lit(0xf4f6ff);
    add(0.2, 0.025, 0.2, o, 0, 0.233, 0);
    add(0.14, 0.05, 0.14, o, 0, 0.27, 0);
    add(0.115, 0.03, 0.115, w, 0, 0.31, 0);
    add(0.09, 0.05, 0.09, o, 0, 0.35, 0);
    add(0.065, 0.025, 0.065, w, 0, 0.387, 0);
    add(0.045, 0.035, 0.045, o, 0, 0.415, 0);
  } else if (kind === 'siren') {
    // police light: red and blue blink in turn
    add(0.14, 0.03, 0.1, dark, 0, 0.235, 0);
    const red = glow(0xff2030), blue = glow(0x2a6bff);
    add(0.06, 0.07, 0.07, red, -0.035, 0.285, 0);
    add(0.06, 0.07, 0.07, blue, 0.035, 0.285, 0);
    g.userData.tick = (t) => {
      const on = Math.floor(t * 6) % 2;
      red.color.setHex(on ? 0xff2030 : 0x4a0a10);
      blue.color.setHex(on ? 0x0a1440 : 0x2a6bff);
    };
  } else if (kind === 'radar') {
    add(0.06, 0.025, 0.06, dark, 0, 0.233, 0);
    add(0.02, 0.08, 0.02, metal, 0, 0.28, 0);
    const head = new THREE.Group();
    head.position.y = 0.33;
    g.add(head);
    add(0.2, 0.06, 0.02, metal, 0, 0, 0.02, head).rotation.x = -0.35;
    add(0.04, 0.02, 0.04, glow(accent), 0, 0.01, -0.02, head);
    g.userData.tick = (t) => { head.rotation.y = t * 2.5; };
  } else if (kind === 'dish') {
    // satellite dish tilted up and back, a lit feed in front of it
    add(0.05, 0.05, 0.05, dark, 0.04, 0.245, 0.03);
    add(0.02, 0.06, 0.02, metal, 0.04, 0.29, 0.03);
    const d = add(0.2, 0.2, 0.025, lit(0xdfe3ee), 0.04, 0.38, 0.04);
    d.rotation.x = -0.45;                                         // faces forward and up
    add(0.17, 0.17, 0.01, lit(0xb8bdd0), 0.04, 0.38, 0.026).rotation.x = -0.45;
    add(0.012, 0.1, 0.012, metal, 0.04, 0.4, -0.02).rotation.x = -1.2;
    add(0.03, 0.03, 0.03, glow(accent), 0.04, 0.42, -0.07);
  } else if (kind === 'bulb') {
    // an idea lamp that pulses
    add(0.07, 0.035, 0.07, metal, 0, 0.24, 0);
    add(0.06, 0.02, 0.06, dark, 0, 0.265, 0);
    const lamp = glow(0xffe680);
    add(0.12, 0.11, 0.12, lamp, 0, 0.33, 0);
    add(0.08, 0.04, 0.08, glow(0xffffff), 0, 0.395, 0);
    g.userData.tick = (t) => lamp.color.setHSL(0.13, 1, 0.62 + 0.13 * Math.sin(t * 4));
  } else if (kind === 'tesla') {
    // tesla coil with sparks jumping off its ring
    add(0.09, 0.03, 0.09, dark, 0, 0.235, 0);
    add(0.045, 0.1, 0.045, lit(0xc8752a), 0, 0.3, 0);
    add(0.13, 0.025, 0.13, metal, 0, 0.36, 0);
    const sparks = [];
    for (let i = 0; i < 4; i++) {
      const sp = add(0.09, 0.012, 0.012, glow(0x9ff3ff), 0, 0.37, 0);
      sp.rotation.y = (i * Math.PI) / 2;
      sparks.push(sp);
    }
    g.userData.tick = (t) => sparks.forEach((sp, i) => {
      sp.visible = Math.sin(t * 23 + i * 7.1) > 0.3;
      sp.position.set(Math.cos(i * 1.57 + t) * 0.08, 0.37 + Math.sin(t * 31 + i) * 0.02, Math.sin(i * 1.57 + t) * 0.08);
    });
  } else if (kind === 'dome') {
    // a brain under a glass dome
    add(0.21, 0.02, 0.21, metal, 0, 0.232, 0);
    const brain = lit(0xff86b8);
    add(0.15, 0.08, 0.13, brain, 0, 0.28, 0);
    add(0.006, 0.07, 0.135, lit(0xd05a8a), 0, 0.285, 0);
    for (const z of [-0.03, 0.03]) add(0.152, 0.008, 0.01, lit(0xd05a8a), 0, 0.3, z);
    add(0.2, 0.13, 0.2, glow(0x9ff3ff, 0.25), 0, 0.3, 0);
  } else if (kind === 'exhaust') {
    // two exhaust pipes at the back with little flames
    const fl = [];
    for (const s of [-1, 1]) {
      add(0.04, 0.14, 0.04, metal, s * 0.06, 0.27, 0.06);
      add(0.05, 0.025, 0.05, dark, s * 0.06, 0.345, 0.06);
      fl.push(add(0.03, 0.06, 0.03, glow(0xffa21a), s * 0.06, 0.39, 0.06));
    }
    g.userData.tick = (t) => fl.forEach((f, i) => { f.scale.y = 0.5 + Math.abs(Math.sin(t * 13 + i * 2)) * 0.9; f.position.y = 0.36 + f.scale.y * 0.03; });
  } else if (kind === 'wifi') {
    // a wi-fi sign whose arcs light up one after another
    add(0.04, 0.04, 0.03, glow(accent), 0, 0.25, 0);
    const arcs = [0.08, 0.13, 0.18].map((w, i) => {
      const m = glow(accent);
      const y = 0.29 + i * 0.04;
      add(w, 0.02, 0.025, m, 0, y, 0);
      for (const s of [-1, 1]) add(0.02, 0.03, 0.025, m, s * (w / 2 + 0.005), y - 0.02, 0);
      return m;
    });
    const on = new THREE.Color(accent), off = new THREE.Color(accent).multiplyScalar(0.2);
    g.userData.tick = (t) => arcs.forEach((m, i) => m.color.copy(Math.floor(t * 3) % 4 > i ? on : off));
  } else if (kind === 'unicorn') {
    // a rainbow horn on the forehead
    const cols = [0xff3a5a, 0xffa21a, 0xffe100, 0x30d860, 0x2a8bff, 0xa04dff];
    const horn = new THREE.Group();
    horn.position.set(0, 0.22, -0.06);
    horn.rotation.x = -0.45;
    g.add(horn);
    cols.forEach((c, i) => add(0.07 - i * 0.01, 0.03, 0.07 - i * 0.01, lit(c), 0, 0.015 + i * 0.03, 0, horn));
  } else if (kind === 'party') {
    // a striped party hat with a pompom, a little askew
    const hat = new THREE.Group();
    hat.position.set(0.02, 0.22, 0);
    hat.rotation.z = -0.2;
    g.add(hat);
    const cols = [accent, 0xffffff, accent, 0xffffff, accent];
    cols.forEach((c, i) => add(0.15 - i * 0.027, 0.04, 0.15 - i * 0.027, lit(c), 0, 0.02 + i * 0.04, 0, hat));
    add(0.05, 0.05, 0.05, lit(0xffffff), 0, 0.23, 0, hat);
  } else if (kind === 'arrow') {
    // an arrow straight through the head
    add(0.4, 0.016, 0.016, lit(0x8a5a2a), 0, 0.14, 0.02);
    add(0.05, 0.04, 0.012, metal, 0.215, 0.14, 0.02);
    for (const dy of [-0.018, 0.018]) add(0.06, 0.02, 0.008, lit(0xff3a3a), -0.2, 0.14 + dy, 0.02);
  }
  return g;
}

// ---------------------------------------------------------------- applying the look
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
const STOCK_TRIM = { titan: 0x3a3c46, dog: 0x3a3c48 };

// colours for every material of the robot from the chosen body / accent / trim and scheme
function paint(scheme, body, accent, trim) {
  switch (scheme) {
    case 'twotone': // joints, bands and shaded sides all take the accent
      return { white: body, light: accent, yellow: accent, dark: accent, black: shade(trim, 0.68), glow: 0.3, bandGlow: 0.15 };
    case 'mono': // the whole robot in shades of the body colour, the accent on top
      return { white: body, light: shade(body, 0.78), yellow: accent, dark: shade(body, 0.5), black: shade(body, 0.32), glow: 0.35 };
    case 'inverse': // dark shell, the body colour on the joints and head, accent bands
      return { white: shade(trim, 1.3), light: accent, yellow: accent, dark: body, black: shade(body, 0.7), glow: 0.4, bandGlow: 0.2 };
    case 'neon': // dark tinted shell, glowing accent bands and joints
      return { white: shade(body, 0.3), light: accent, yellow: accent, dark: shade(accent, 0.45), black: 0x0b0b10, glow: 0.9, bandGlow: 0.8 };
    case 'stealth': // black robot, glowing accent bands
      return { white: 0x262833, light: accent, yellow: accent, dark: 0x15161c, black: 0x0b0b10, glow: 1, bandGlow: 0.9 };
    default:
      return { white: body, light: shade(body, 0.8), yellow: accent, dark: trim, black: shade(trim, 0.68), glow: 0.25 };
  }
}

// preview: a look to try on without owning it (null = what is equipped)
// onRebuild(robot) runs after the body was swapped for another robot
export function applyLook(robot, preview = null, onRebuild = null) {
  const model = preview?.cat === 'model' ? preview.id : preview?.model ?? garage.model;
  const base = { ...LOOKS[model], ...garage.looks[model] };
  const e = preview && preview.cat !== 'model' ? { ...base, [preview.cat]: preview.id } : base;
  if (robot.kind !== model) {
    if (robot.acc) robot.head.remove(robot.acc);
    M.rebuildRobot(robot, model);
    onRebuild?.(robot);
  }
  const accent = item('accent', e.accent).color;
  const body = item('body', e.body).color;
  // stock trim keeps each robot's own dark parts
  const trim = e.trim && e.trim !== 'stock' ? item('trim', e.trim).color : STOCK_TRIM[model] ?? 0x2a2b33;
  M.paintRobot(robot, { ...paint(e.scheme, body, accent, trim), eyes: item('eyes', e.eyes).color });
  robot.rainbow = e.eyes === 'rainbow';
  if (robot.acc) robot.head.remove(robot.acc);
  robot.acc = accessory(e.acc, accent);
  robot.head.add(robot.acc);
}
