// Garage: robots and cosmetic items, bought with RR tokens. Each robot keeps its own look
// (colours and accessory); bought colours can be used on any robot. Stored local + Telegram cloud.
import * as THREE from 'three';
import * as M from './models.js';
import { store } from './telegram.js';

export const CATEGORIES = [
  {
    id: 'model', name: 'РОБОТ', items: [
      { id: 'rr', name: 'RR-1', price: 0, color: 0xd6a124 },
      { id: 'titan', name: 'Титан', price: 800, color: 0xe0202c },
    ],
  },
  {
    id: 'body', name: 'КОРПУС', items: [
      { id: 'classic', name: 'Классика', price: 0, color: 0xd9dce4 },
      { id: 'graphite', name: 'Графит', price: 150, color: 0x5a5e70 },
      { id: 'sky', name: 'Небо', price: 200, color: 0xa8c8ff },
      { id: 'mint', name: 'Мята', price: 200, color: 0xa8f0d0 },
      { id: 'rose', name: 'Роза', price: 200, color: 0xf0b8d0 },
      { id: 'lava', name: 'Лава', price: 250, color: 0xff8a4a },
      { id: 'violet', name: 'Фиалка', price: 250, color: 0xb59aff },
      { id: 'night', name: 'Ночь', price: 400, color: 0x30334a },
      { id: 'chrome', name: 'Хром', price: 450, color: 0xf2f5ff },
      { id: 'gold', name: 'Золото', price: 600, color: 0xe8c860 },
    ],
  },
  {
    id: 'accent', name: 'АКЦЕНТ', items: [
      { id: 'mustard', name: 'Горчица', price: 0, color: 0xd6a124 },
      { id: 'red', name: 'Красный', price: 100, color: 0xff3a3a },
      { id: 'cyan', name: 'Неон', price: 100, color: 0x35e6ff },
      { id: 'pink', name: 'Розовый', price: 100, color: 0xff4fd8 },
      { id: 'lime', name: 'Лайм', price: 100, color: 0x8aff5a },
      { id: 'orange', name: 'Оранж', price: 100, color: 0xff8a1a },
      { id: 'purple', name: 'Фиолет', price: 120, color: 0x9a5aff },
      { id: 'white', name: 'Белый', price: 120, color: 0xf4f6ff },
      { id: 'black', name: 'Чёрный', price: 150, color: 0x22232c },
    ],
  },
  {
    // the dark joints and plates
    id: 'trim', name: 'ДЕТАЛИ', items: [
      { id: 'stock', name: 'Стандарт', price: 0, color: 0x2a2b33 },
      { id: 'navy', name: 'Синие', price: 120, color: 0x26346a },
      { id: 'wine', name: 'Бордо', price: 120, color: 0x6a1f33 },
      { id: 'olive', name: 'Хаки', price: 120, color: 0x4a5a30 },
      { id: 'steel', name: 'Сталь', price: 150, color: 0x8a90a4 },
      { id: 'white', name: 'Белые', price: 200, color: 0xdfe2ec },
    ],
  },
  {
    id: 'eyes', name: 'ГЛАЗА', items: [
      { id: 'white', name: 'Белые', price: 0, color: 0xf4f6ff },
      { id: 'cyan', name: 'Голубые', price: 80, color: 0x35e6ff },
      { id: 'pink', name: 'Розовые', price: 80, color: 0xff4fd8 },
      { id: 'yellow', name: 'Жёлтые', price: 80, color: 0xffd21f },
      { id: 'green', name: 'Зелёные', price: 80, color: 0x6dffb0 },
      { id: 'orange', name: 'Оранж', price: 80, color: 0xffa21a },
      { id: 'violet', name: 'Фиолет', price: 100, color: 0xb07aff },
      { id: 'red', name: 'Красные', price: 120, color: 0xff3a3a },
    ],
  },
  {
    id: 'acc', name: 'ГОЛОВА', items: [
      { id: 'none', name: 'Нет', price: 0 },
      { id: 'antenna', name: 'Антенна', price: 120 },
      { id: 'shades', name: 'Очки', price: 150 },
      { id: 'cap', name: 'Кепка', price: 150 },
      { id: 'mohawk', name: 'Ирокез', price: 200 },
      { id: 'catears', name: 'Ушки', price: 200 },
      { id: 'headphones', name: 'Наушники', price: 200 },
      { id: 'horns', name: 'Рога', price: 250 },
      { id: 'halo', name: 'Нимб', price: 300 },
      { id: 'propeller', name: 'Пропеллер', price: 300 },
      { id: 'tophat', name: 'Цилиндр', price: 350 },
      { id: 'crown', name: 'Корона', price: 500 },
    ],
  },
];

// the look each robot starts with (the Titan comes with its red core)
const LOOKS = {
  rr: { body: 'classic', accent: 'mustard', trim: 'stock', eyes: 'white', acc: 'none' },
  titan: { body: 'classic', accent: 'red', trim: 'stock', eyes: 'white', acc: 'none' },
};
const DEFAULT = {
  owned: ['model:rr', 'body:classic', 'accent:mustard', 'trim:stock', 'eyes:white', 'acc:none'],
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
export const item = (cat, id) => CATEGORIES.find((c) => c.id === cat).items.find((i) => i.id === id);
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

// ---------------------------------------------------------------- applying the look
function accessory(kind, accent) {
  const g = new THREE.Group();
  const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
  const lit = (c) => new THREE.MeshLambertMaterial({ color: c });
  const add = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
  if (kind === 'antenna') {
    add(0.02, 0.14, 0.02, lit(0x3a3b46), 0.05, 0.29, 0);
    add(0.05, 0.05, 0.05, glow(accent), 0.05, 0.37, 0);
  } else if (kind === 'cap') {
    add(0.23, 0.06, 0.23, lit(accent), 0, 0.25, 0);
    add(0.17, 0.02, 0.11, lit(accent), 0, 0.225, -0.15);
    add(0.05, 0.02, 0.05, lit(0xffffff), 0, 0.29, 0);
  } else if (kind === 'headphones') {
    add(0.27, 0.03, 0.05, lit(0x2a2b33), 0, 0.255, 0);
    for (const s of [-1, 1]) {
      add(0.03, 0.1, 0.04, lit(0x2a2b33), s * 0.13, 0.2, 0);
      add(0.06, 0.12, 0.12, lit(accent), s * 0.14, 0.11, 0.005);
    }
  } else if (kind === 'halo') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.015, 6, 20), glow(0xffe066));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.34;
    g.add(ring);
  } else if (kind === 'shades') {
    add(0.22, 0.045, 0.02, lit(0x15161c), 0, 0.125, -0.115);
    for (const s of [-1, 1]) add(0.075, 0.03, 0.022, glow(accent), s * 0.048, 0.125, -0.117);
  } else if (kind === 'mohawk') {
    for (let i = -2; i <= 2; i++) add(0.035, 0.09 - Math.abs(i) * 0.015, 0.04, lit(accent), 0, 0.26 - Math.abs(i) * 0.008, i * 0.045);
  } else if (kind === 'catears') {
    for (const s of [-1, 1]) {
      add(0.07, 0.045, 0.035, lit(0x2a2b33), s * 0.07, 0.24, 0);
      add(0.04, 0.04, 0.035, lit(0x2a2b33), s * 0.075, 0.28, 0);
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
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.012, 0.045), lit(0xff3a5a));
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.3), lit(0x35e6ff));
    blade.add(b1, b2);
    g.add(blade);
    g.userData.spin = blade;
  } else if (kind === 'tophat') {
    add(0.26, 0.02, 0.26, lit(0x1a1b22), 0, 0.225, 0);
    add(0.16, 0.15, 0.16, lit(0x1a1b22), 0, 0.31, 0);
    add(0.163, 0.03, 0.163, lit(accent), 0, 0.25, 0);
  } else if (kind === 'crown') {
    add(0.2, 0.05, 0.2, lit(0xe8c040), 0, 0.245, 0);
    for (const [x, z] of [[0.08, 0.08], [-0.08, 0.08], [0.08, -0.08], [-0.08, -0.08]]) add(0.04, 0.06, 0.04, lit(0xe8c040), x, 0.3, z);
    add(0.04, 0.04, 0.02, glow(0xff3a5a), 0, 0.25, -0.105);
  }
  return g;
}

const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();

// preview: a look to try on without owning it (null = what is equipped)
// onRebuild(robot) runs after the body was swapped for another robot
export function applyLook(robot, preview = null, onRebuild = null) {
  const model = preview?.cat === 'model' ? preview.id : preview?.model ?? garage.model;
  const base = garage.looks[model] ?? LOOKS[model];
  const e = preview && preview.cat !== 'model' ? { ...base, [preview.cat]: preview.id } : base;
  if (robot.kind !== model) {
    if (robot.acc) robot.head.remove(robot.acc);
    M.rebuildRobot(robot, model);
    onRebuild?.(robot);
  }
  const accent = item('accent', e.accent).color;
  const body = item('body', e.body).color;
  // stock trim keeps each robot's own dark parts
  const trim = e.trim && e.trim !== 'stock' ? item('trim', e.trim).color : model === 'titan' ? 0x34363f : 0x2a2b33;
  M.paintRobot(robot, {
    white: body, light: shade(body, 0.8), yellow: accent, eyes: item('eyes', e.eyes ?? 'white').color,
    dark: trim, black: shade(trim, 0.68),
  });
  if (robot.acc) robot.head.remove(robot.acc);
  robot.acc = accessory(e.acc, accent);
  robot.head.add(robot.acc);
}
