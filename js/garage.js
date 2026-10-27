// Garage: robots and cosmetic items, bought with RR tokens. Each robot keeps its own look
// (colours, paint scheme and head item); bought items can be used on any robot. Stored local +
// Telegram cloud.
import * as THREE from 'three';
import * as M from './models.js';
import { store } from './telegram.js';
import * as GEAR from './gear.js';

export const CATEGORIES = [
  {
    id: 'model', name: 'РОБОТ', items: [
      { id: 'rr', name: 'Agibot', price: 0, color: 0xd6a124 },
      { id: 'titan', name: 'PM01', price: 800, color: 0xe0202c },
      { id: 'dog', name: 'Go2', price: 1200, color: 0x9a9eae },
      { id: 'uni', name: 'Юни', price: 1500, color: 0xff6a00 },
      { id: 'track', name: 'Трак', price: 1800, color: 0xffc21a },
      { id: 'hexa', name: 'Гекса', price: 2200, color: 0x30d860 },
      { id: 'rolly', name: 'Ролли', price: 2500, color: 0x14b8b0 },
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
      // only shown when the dog is on screen
      { id: 'bone', name: 'Косточка', price: 150, only: 'dog' },
      { id: 'collar', name: 'Ошейник', price: 180, only: 'dog' },
      { id: 'bandana', name: 'Бандана', price: 200, only: 'dog' },
    ],
  },
  {
    // hand items for the humanoids; the dog gets shoulder modules here instead
    id: 'arms', name: 'РУКИ', dogName: 'МОДУЛИ', items: [
      { id: 'none', name: 'Нет', price: 0 },
      { id: 'bands', name: 'Браслеты', price: 120, not: 'dog' },
      { id: 'bracers', name: 'Наручи', price: 150, not: 'dog' },
      { id: 'gloves', name: 'Перчатки', price: 200, not: 'dog' },
      { id: 'wrench', name: 'Ключ', price: 200, not: 'dog' },
      { id: 'flashlight', name: 'Фонарик', price: 250, not: 'dog' },
      { id: 'shield', name: 'Щит', price: 300, not: 'dog' },
      { id: 'blaster', name: 'Бластер', price: 350, not: 'dog' },
      { id: 'saber', name: 'Лазер-меч', price: 450, not: 'dog' },
      { id: 'sneakers', name: 'Кроссовки', price: 250, only: 'dog' },
      { id: 'armor', name: 'Броня', price: 200, only: 'dog' },
      { id: 'beacons', name: 'Маячки', price: 220, only: 'dog' },
      { id: 'lights', name: 'Прожекторы', price: 280, only: 'dog' },
      { id: 'rockets', name: 'Ракеты', price: 400, only: 'dog' },
      { id: 'turrets', name: 'Турели', price: 450, only: 'dog' },
    ],
  },
  {
    id: 'back', name: 'СПИНА', items: [
      { id: 'none', name: 'Нет', price: 0 },
      { id: 'backpack', name: 'Рюкзак', price: 150 },
      { id: 'spikes', name: 'Шипы', price: 180 },
      { id: 'flag', name: 'Флаг', price: 200 },
      { id: 'battery', name: 'Батарея', price: 250 },
      { id: 'cape', name: 'Плащ', price: 300 },
      { id: 'rotor', name: 'Винт', price: 350 },
      { id: 'wings', name: 'Крылья', price: 450 },
      { id: 'tail', name: 'Хвост', price: 200, only: 'dog' },
      { id: 'saddle', name: 'Сумки', price: 250, only: 'dog' },
      { id: 'rider', name: 'Наездник', price: 500, only: 'dog' },
    ],
  },
];

// the look each robot starts with (PM01 comes with its red core, Go2 with green lights)
const LOOKS = {
  rr: { body: 'classic', accent: 'mustard', trim: 'stock', scheme: 'classic', eyes: 'white', acc: 'none', arms: 'none', back: 'none' },
  titan: { body: 'classic', accent: 'red', trim: 'stock', scheme: 'classic', eyes: 'white', acc: 'none', arms: 'none', back: 'none' },
  dog: { body: 'classic', accent: 'lime', trim: 'stock', scheme: 'classic', eyes: 'yellow', acc: 'none', arms: 'none', back: 'none' },
  uni: { body: 'classic', accent: 'orange', trim: 'stock', scheme: 'classic', eyes: 'white', acc: 'none', arms: 'none', back: 'none' },
  track: { body: 'classic', accent: 'yellow', trim: 'stock', scheme: 'classic', eyes: 'white', acc: 'none', arms: 'none', back: 'none' },
  hexa: { body: 'classic', accent: 'green', trim: 'stock', scheme: 'classic', eyes: 'white', acc: 'none', arms: 'none', back: 'none' },
  rolly: { body: 'classic', accent: 'teal', trim: 'stock', scheme: 'classic', eyes: 'white', acc: 'none', arms: 'none', back: 'none' },
};
const DEFAULT = {
  owned: ['model:rr', 'body:classic', 'accent:mustard', 'trim:stock', 'scheme:classic', 'eyes:white', 'acc:none', 'arms:none', 'back:none'],
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

// slots a robot does not have (no hands on the hexapod and the ball, no back on the ball)
export const NO_SLOT = { hexa: ['arms'], rolly: ['arms', 'back'] };
export const hasSlot = (model, cat) => !NO_SLOT[model]?.includes(cat);

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

// The little Agibot riding the dog (back item): sits astride, one hand on the dog.
GEAR.setRider((accent) => {
  const r = M.makeRobot({}, 'rr');
  M.paintRobot(r, { yellow: accent, glow: 0.25 });
  r.root.scale.setScalar(0.45);
  for (const [l, s] of r.legs.map((l, i) => [l, i ? 1 : -1])) { l.rotation.set(1.5, 0, s * 0.4); l.userData.knee.rotation.x = -1.3; }
  r.arms[0].rotation.set(0.9, 0, 0.2);
  return r;
});

// ---------------------------------------------------------------- applying the look
const shade = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
const STOCK_TRIM = { titan: 0x3a3c46, dog: 0x3a3c48 };

// colours for every material of the robot from the chosen body / accent / trim and scheme.
// Every scheme uses all three colours; the guards below keep clashing picks readable.
const mix = (a, b, k) => new THREE.Color(a).lerp(new THREE.Color(b), k).getHex();
const near = (a, b) => { const x = new THREE.Color(a), y = new THREE.Color(b); return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b) < 0.25; };
// a colour turned into a dark version of itself (for shells that must stay dark)
const darkOf = (c, l = 0.22) => { const x = new THREE.Color(c), hsl = {}; x.getHSL(hsl); return x.setHSL(hsl.h, Math.min(hsl.s, 0.85), Math.min(hsl.l, l)).getHex(); };

function paint(scheme, body, accent, trim) {
  switch (scheme) {
    case 'twotone': { // joints, bands and shaded sides take the accent; the trim colours the darkest parts
      const band = near(accent, body) ? shade(accent, 0.6) : accent; // same colours would melt into one
      return { white: body, light: band, yellow: accent, dark: band, black: trim, glow: 0.3, bandGlow: 0.15 };
    }
    case 'mono': // shades of the body colour; the trim only tints the joints
      return { white: body, light: shade(body, 0.78), yellow: accent, dark: mix(shade(body, 0.5), trim, 0.35), black: mix(shade(body, 0.32), trim, 0.35), glow: 0.35 };
    case 'inverse': { // the trim becomes the (dark) shell, the body colour goes to joints and head
      const shell = darkOf(trim, 0.3);
      const joints = near(body, shell) ? shade(body, 2.2) : body;
      return { white: shell, light: accent, yellow: accent, dark: joints, black: shade(joints, 0.7), glow: 0.4, bandGlow: 0.2 };
    }
    case 'neon': // shell is a dark version of the body colour, glowing accent bands, trim on the joints
      return { white: darkOf(body, 0.2), light: accent, yellow: accent, dark: darkOf(trim, 0.16), black: 0x0b0b10, glow: 0.9, bandGlow: 0.8 };
    case 'stealth': // nearly black, only a hint of the body and trim colours, glowing accent bands
      return { white: mix(0x262833, darkOf(body, 0.25), 0.25), light: accent, yellow: accent, dark: mix(0x15161c, darkOf(trim, 0.2), 0.3), black: 0x0b0b10, glow: 1, bandGlow: 0.9 };
    default:
      return { white: body, light: shade(body, 0.8), yellow: accent, dark: trim, black: shade(trim, 0.68), glow: 0.25 };
  }
}

// What each colour paints in each scheme (shown in the garage under the tabs).
export const ROLES = {
  classic: { body: 'основной корпус', accent: 'акцентные детали', trim: 'суставы и тёмные части' },
  twotone: { body: 'основной корпус', accent: 'полосы, боковины и суставы', trim: 'самые тёмные части' },
  mono: { body: 'весь робот, оттенками', accent: 'акцентные детали', trim: 'оттенок суставов' },
  inverse: { body: 'суставы и голова', accent: 'полосы', trim: 'основной корпус (в тёмном тоне)' },
  neon: { body: 'тёмный корпус (оттенок)', accent: 'светящиеся полосы', trim: 'суставы (в тёмном тоне)' },
  stealth: { body: 'лёгкий оттенок чёрного корпуса', accent: 'светящиеся полосы', trim: 'лёгкий оттенок суставов' },
};

// onRebuild(robot) runs after the body was swapped for another robot
// preview: { model?, set: { cat: id, ... } } (several items tried on together), or the short
// form { cat, id, model? } for a single item
export function applyLook(robot, preview = null, onRebuild = null) {
  const p = preview?.cat
    ? { model: preview.cat === 'model' ? preview.id : preview.model, set: preview.cat === 'model' ? {} : { ...preview.set, [preview.cat]: preview.id } }
    : preview;
  const model = p?.model ?? garage.model;
  const base = { ...LOOKS[model], ...garage.looks[model] };
  const e = { ...base, ...(p?.set ?? {}) };
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
  // head, hands and back items are worn together; items of another robot fall back to none
  for (const o of robot.items ?? []) o.parent?.remove(o);
  if (robot.acc) robot.head.remove(robot.acc);
  const fits = (cat, id) => hasSlot(model, cat) && (!item(cat, id).only || item(cat, id).only === model) && item(cat, id).not !== model;
  const acc = fits('acc', e.acc) ? e.acc : 'none';
  robot.acc = GEAR.accessory(acc, accent, model);
  robot.head.add(robot.acc);
  const neck = GEAR.neckItems(robot, acc, accent);
  const hands = GEAR.handItems(robot, fits('arms', e.arms) ? e.arms : 'none', accent);
  const back = GEAR.backItems(robot, fits('back', e.back) ? e.back : 'none', accent);
  robot.items = [...neck.objs, ...hands.objs, ...back.objs];
  robot.backDepth = back.depth;
  const accTick = robot.acc.userData.tick;
  robot.ticks = [...(accTick ? [accTick] : []), ...neck.ticks, ...hands.ticks, ...back.ticks];
}
