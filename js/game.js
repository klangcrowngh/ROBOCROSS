import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as M from './models.js';
import * as TX from './textures.js';
import { initTelegram, haptic, store, onAppHidden } from './telegram.js';
import { sfx, isMuted, setMuted, isMusicOn, setMusic, setAudioPaused } from './audio.js';
import { Environment, DISTRICTS, districtAt, districtIndex } from './env.js';
import * as NPC from './npc.js';
import * as G from './garage.js';
import * as LB from './leaderboard.js';
import { wiresGame, shieldGame } from './minigame.js';

// ---------------------------------------------------------------- config
const BG = '#1d1f3f';
const HALF = 3;              // playable columns: -HALF..HALF
const SPAWN = 16;            // moving objects wrap inside -SPAWN..SPAWN
const LOOP = SPAWN * 2;
const WORLD_W = 40;
const BLD_X = HALF + 1.1;    // skyscrapers start here (both sides)
const HOP_TIME = 0.16;
const TRAIN_SPEED = 26;
const GAP_DEPTH = 2.7;
// Drop the real robot here (GLB, Y-up, ~any scale). Optional node names for animation:
// LegL, LegR, ArmL, ArmR, Head.
const ROBOT_URL = 'assets/robot.glb';
const ROBOT_HEIGHT = 1.05;
const ROBOT_ROT_Y = 0;       // turn the GLB so it faces -Z if it was exported facing elsewhere

const REASONS = {
  car: 'Сбит транспортом',
  train: 'Попал под маглев',
  splash: 'Сорвался в пропасть<br>между уровнями города',
  drift: 'Унесло за пределы<br>улицы',
  water: 'Упал в канал<br>и замкнул контакты',
  crane: 'Сбит контейнером<br>со строительного крана',
  beam: 'Придавлен стальной<br>балкой',
  mower: 'Попал под робота-<br>газонокосилку',
  drone: 'Охранный дрон забрал<br>за бездействие',
  laser: 'Разрезан лазерным<br>заграждением',
  scan: 'Попал под луч<br>охранного сканера',
  shock: 'Удар током<br>от энергопанели',
  patrol: 'Пойман патрульным<br>дроном',
};

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const snap = (v) => Math.round(v * 2) / 2;
const wrap = (x) => (((x + SPAWN) % LOOP) + LOOP) % LOOP - SPAWN;
function weighted(table) {
  let sum = 0;
  for (const k in table) sum += table[k];
  let r = Math.random() * sum;
  for (const k in table) if ((r -= table[k]) <= 0) return k;
  return Object.keys(table)[0];
}
const $ = (id) => document.getElementById(id);
const isRoad = (t) => t === 'road' || t === 'hover';
const isFloat = (t) => t === 'gap' || t === 'water'; // lanes crossed on moving platforms

// ---------------------------------------------------------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(TX.FOG_COLOR, 20, 52);

const hemi = new THREE.HemisphereLight(0xe4e8ff, 0x46307a, 1.7);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff6ea, 1.9);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
sun.shadow.bias = -0.001;
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
const SUN_OFF = new THREE.Vector3(-6, 16, 7);
const env = new Environment(scene, hemi, sun);
NPC.configure(HALF);

// Chase camera behind the robot, looking down the street like the concept art.
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 160);
// Slightly to the right of the robot, like the concept art.
const CAM_UP = 4.2, CAM_BACK = 3.6, CAM_SIDE = 1.35, LOOK_AHEAD = 6.2;
const PITCH = Math.atan2(CAM_UP, CAM_BACK + LOOK_AHEAD);

let baseFov = 50;
// The game lives in a phone-shaped frame (#app), so the view is the same on any screen.
const phone = $('app');

function resize() {
  const w = phone.clientWidth, h = phone.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h);
  const a = w / h;
  // Portrait: keep about 7 columns across at the robot; landscape: plain 48° vertical fov.
  const vfov = a < 1 ? Math.min(105, 2 * Math.atan(Math.tan((62 * Math.PI) / 360) / a) * 180 / Math.PI) : 50;
  camera.fov = vfov;
  baseFov = vfov;
  camera.aspect = a;
  camera.updateProjectionMatrix();
  const half = Math.tan((vfov * Math.PI) / 360);
  const horizon = 0.5 - Math.tan(PITCH) / half / 2;
  env.setView(a, clamp(horizon, 0.02, 0.9));
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(phone);
resize();

// ---------------------------------------------------------------- level plan
// Lane types: safe (sidewalk / plaza), road, hover, gap (anti-grav pads), rail (maglev).
const lanes = new Map();
let gen, plan, planRow, maxRow;

// The level is built from a per-run seed, so a saved run can be rebuilt exactly.
let runSeed = 1;
function seeded(a) {
  // mulberry32
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function withRng(salt, fn) {
  const saved = Math.random;
  Math.random = seeded((Math.imul(runSeed, 2654435761) + Math.imul(salt, 40503)) | 0);
  try { return fn(); } finally { Math.random = saved; }
}

function resetGen() {
  gen = {
    type: 'safe', left: 0, style: 'sidewalk', cw: 0,
    lastViaduct: 0, lastDistrict: 0, nextCenter: 110, stations: 0,
    last: {}, prevHazard: null, tension: 0,
    trail: 0, trailCol: 0,
  };
  plan = new Map();
  planRow = -12;
  maxRow = -9;
}

const difficulty = (row) => Math.min(row / 160, 1);
// How far the run has ramped up: 0 at the start, 1 (full density) from about row 150.
const ramp = (row) => clamp((row - 8) / 140, 0, 1);
// weights blended from an easy table to a hard one
const rampWeights = (easy, hard, k) => Object.fromEntries(
  [...new Set([...Object.keys(easy), ...Object.keys(hard)])].map((n) => [n, (easy[n] ?? 0) * (1 - k) + (hard[n] ?? 0) * k]),
);

// Hazard groups: when they unlock, base weight, how many rows, how long until the same kind
// may appear again, and how much "tension" one row adds.
const STATION_ORDER = ['flight', 'shield'];
// lanes the robot has to time: the sidewalk in front of them is a safe place to wait
const WAIT_FOR = new Set(['road', 'hover', 'water', 'gap', 'rail', 'laser', 'scan', 'build', 'patrol']);
const STATION_NAME = { flight: 'ЛЁТНЫЙ ЦЕНТР', shield: 'ЩИТ-ГЕНЕРАТОР' };

const HAZARDS = {
  road: { from: 4, w: () => 48, len: (r) => [1, r < 30 ? 2 : r < 80 ? 3 : 4], cool: 0, tension: 1 },
  water: { from: 8, w: () => 15, len: (r) => [1, r < 30 ? 2 : 3], cool: 4, tension: 1 },
  gap: { from: 20, w: () => 8, len: (r) => [1, r < 60 ? 2 : 3], cool: 10, tension: 1.2 },
  rail: { from: 14, w: () => 14, len: () => [1, 1], cool: 10, tension: 1.5 },
  hover: { from: 20, w: () => 16, len: () => [1, 2], cool: 4, tension: 1.3 },
  laser: { from: 26, w: (r) => Math.min(8, 3 + r / 30), len: () => [1, 1], cool: 9, tension: 2 },
  scan: { from: 42, w: (r) => Math.min(7, 2 + r / 40), len: () => [1, 1], cool: 11, tension: 2 },
  build: { from: 30, w: (r) => Math.min(8, 3 + r / 28), len: () => [1, 1], cool: 9, tension: 1.8 },
  patrol: { from: 20, w: (r) => Math.min(11, 5 + r / 28), len: () => [1, 1], cool: 6, tension: 1.6 },
};
// Each district leans towards its own kind of trouble.
const DISTRICT_BIAS = {
  downtown: { road: 1.25, patrol: 1.3 },
  tokyo: { hover: 1.8, scan: 1.3, road: 0.9, patrol: 1.2 },
  eco: { water: 1.8, road: 0.8, gap: 0.5, laser: 0.6, build: 0.5 },
  industrial: { rail: 1.8, laser: 1.5, water: 0.7, build: 2.2 },
  port: { water: 2.6, build: 1.5, road: 0.7, gap: 0.4 },
};

function safeStyle(row, breather) {
  const park = districtAt(row).id === 'eco' ? 0.45 : 0.2;
  const r = Math.random();
  if (breather) return r < 0.65 ? 'park' : 'plaza';
  return r < park * 0.5 ? 'park' : r < park * 0.5 + 0.25 ? 'plaza' : 'sidewalk';
}

function nextType(row) {
  if (row <= 3) { gen.style = 'sidewalk'; return 'safe'; }
  if (gen.left > 0) { gen.left--; return gen.type; }

  if (gen.type !== 'safe') {
    // After every hazard group comes a sidewalk. Once enough tension has built up it is a
    // longer breather (park or plaza) with a trail of coins to collect.
    const breather = gen.tension >= 6 + difficulty(row) * 8;
    gen.type = 'safe';
    gen.style = safeStyle(row, breather);
    if (breather) {
      gen.tension = 0;
      gen.left = randInt(1, 2);
      // sometimes the breather is a whole park to run through
      if (row > 15 && Math.random() < (districtAt(row).id === 'eco' ? 0.6 : 0.3)) {
        gen.style = 'park';
        gen.left = randInt(5, 8);
        gen.bigPark = { start: row, len: gen.left + 1 };
      }
      gen.trail = gen.left + 1;
      gen.trailCol = randInt(-HALF + 1, HALF - 1);
    } else {
      // the opening of a run is gentler: more sidewalk between streets
      gen.left = gen.style === 'park' || Math.random() < (row < 30 ? 0.55 : 0.2) ? 1 : 0;
    }
    return 'safe';
  }

  const bias = DISTRICT_BIAS[districtAt(row).id] ?? {};
  const table = {};
  for (const [t, h] of Object.entries(HAZARDS)) {
    if (row < h.from) continue;
    if (row - (gen.last[t] ?? -99) <= h.cool) continue;     // cooldown since this kind last ended
    if (t === gen.prevHazard && t !== 'road') continue;     // no identical groups back to back
    table[t] = h.w(row) * (bias[t] ?? 1);
  }
  const t = Object.keys(table).length ? weighted(table) : 'road';
  const [a, b] = HAZARDS[t].len(row);
  gen.type = t;
  gen.left = randInt(a, b) - 1;
  gen.prevHazard = t;
  gen.last[t] = row + gen.left;
  gen.tension += (gen.left + 1) * HAZARDS[t].tension;
  if (t === 'road') gen.cw = randInt(-HALF + 1, HALF - 1);
  return t;
}

// Planned ahead so a lane knows its neighbours (curbs, traffic lights, walls).
function info(row) {
  while (planRow < row) {
    planRow++;
    withRng(planRow * 4 + 1, planOne);
  }
  return plan.get(row);
}

function planOne() {
  {
    const type = nextType(planRow);
    // neon gate on the first sidewalk of a new district, monorail every ~22 rows
    const gate = type === 'safe' && districtIndex(planRow) !== gen.lastDistrict;
    if (gate) gen.lastDistrict = districtIndex(planRow);
    // ability stations: the flight center first, then the shield generator, taking turns
    const center = type === 'safe' && !gate && gen.style !== 'park' && planRow >= gen.nextCenter
      ? STATION_ORDER[gen.stations++ % STATION_ORDER.length] : null;
    if (center) gen.nextCenter = planRow + 120;
    const viaduct = type === 'safe' && !gate && !center && planRow - gen.lastViaduct > 22;
    if (viaduct) gen.lastViaduct = planRow;
    // coin trail through breather zones, wandering one column at a time
    let trail = null;
    if (type === 'safe' && gen.trail > 0) {
      trail = gen.trailCol;
      gen.trail--;
      gen.trailCol = clamp(gen.trailCol + randInt(-1, 1), -HALF, HALF);
    }
    const bp = gen.bigPark;
    const park = type === 'safe' && bp && planRow >= bp.start && planRow < bp.start + bp.len
      ? { idx: planRow - bp.start, len: bp.len } : null;
    plan.set(planRow, { type, style: gen.style, cw: gen.cw, viaduct: viaduct && !park, gate, trail, park, center });
  }
}

// ---------------------------------------------------------------- lane building
function ground(lane, center, side, top = 0, h = 0.5) {
  const sw = (WORLD_W - (HALF * 2 + 1)) / 2;
  const parts = [
    M.box(lane.group, HALF * 2 + 1, h, 1, center, 0, top - h / 2, 0),
    M.box(lane.group, sw, h, 1, side, -(HALF + 0.5 + sw / 2), top - h / 2, 0),
    M.box(lane.group, sw, h, 1, side, HALF + 0.5 + sw / 2, top - h / 2, 0),
  ];
  for (const p of parts) p.castShadow = false;
}

function createLane(row) {
  const inf = info(row);
  const lane = {
    row, type: inf.type, info: inf,
    prevType: info(row - 1).type,
    nextType: info(row + 1).type,
    group: new THREE.Group(),
    blocked: new Set(),
    movers: [],
    coins: [],
    dir: 1, speed: 0,
    train: null, lamp: null,
    people: [], tiles: [], scanners: [], laser: null, patrol: null, strips: null,
    crane: null, beams: null,
    district: districtAt(row),
  };
  M.setDistrict(lane.district);
  ({
    safe: buildSafe, road: buildRoad, hover: buildRoad, gap: buildGap, rail: buildRail,
    laser: buildLaser, scan: buildScan, water: buildWater, build: buildBuild, patrol: buildPatrol,
  })[lane.type](lane);
  lane.group.position.z = -row;
  scene.add(lane.group);
  lanes.set(row, lane);
}

function ensureLanes(upto) {
  while (maxRow < upto) {
    const row = ++maxRow;
    withRng(row * 4 + 3, () => createLane(row));
  }
}

function trimLanes(below) {
  for (const [row, lane] of lanes) {
    if (row >= below) continue;
    scene.remove(lane.group);
    M.disposeBaked(lane.group);
    lanes.delete(row);
  }
  if (plan) for (const row of plan.keys()) if (row < below - 2) plan.delete(row);
}

function freeCells(lane) {
  const cells = [];
  for (let x = -HALF; x <= HALF; x++) if (!lane.blocked.has(x)) cells.push(x);
  return cells;
}

// Cells of the previous lane from which the robot can step into this one (null = anywhere).
// Every lane records the cells the robot can actually reach in it (lane.reach), so a free cell
// walled off by props never counts as a way forward.
function entryCells(prev) {
  if (!prev) return null;
  if (prev.reach !== undefined) return prev.reach;
  if (prev.type === 'safe') return new Set(freeCells(prev));
  if (prev.type === 'water' && prev.speed === 0) return new Set(prev.movers.map((m) => m.x).filter((x) => Math.abs(x) <= HALF));
  return null;
}

// Cells reachable inside a lane: start where the robot can come in from below, then walk
// sideways over the `open` cells.
function reachCells(entry, open) {
  const seeds = entry ? open.filter((x) => entry.has(x)) : open;
  const reach = new Set(seeds);
  for (const x0 of seeds) {
    for (const dir of [-1, 1]) {
      for (let x = x0 + dir; open.includes(x); x += dir) reach.add(x);
    }
  }
  return reach;
}

function shuffleArr(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function placeCoin(lane, x) {
  if (lane.coins.some((c) => c.x === x)) return;
  const mesh = M.makeCoin();
  mesh.position.set(x, 0.45, 0);
  lane.group.add(mesh);
  lane.coins.push({ x, mesh });
}

function maybeCoin(lane, chance) {
  if (lane.row < 3 || Math.random() > chance) return;
  const x = pick(freeCells(lane));
  const mesh = M.makeCoin();
  mesh.position.set(x, 0.45, 0);
  lane.group.add(mesh);
  lane.coins.push({ x, mesh });
}

// Skyscrapers on both sides of the street; only the first one faces the street.
function skyline(group, gapNear = 0) {
  for (const s of [-1, 1]) {
    let x = BLD_X + gapNear;
    let i = 0;
    while (x < WORLD_W / 2 - 1) {
      const w = snap(rand(1.5, 3));
      const h = i === 0 ? snap(rand(3, 9)) : snap(rand(4 + i, 9 + i * 2));
      const x0 = s > 0 ? x : -(x + w);
      M.building(group, x0, x0 + w, h, i === 0);
      x += w;
      i++;
    }
  }
}

const PROP_FNS = {
  lamp: M.lamp, hydrant: M.hydrant, bin: M.bin, bench: M.bench, mailbox: M.mailbox, streetTree: M.streetTree,
  vending: M.vending, kiosk: M.kiosk, bollards: M.bollards, crates: M.crates, cones: M.cones, barrier: M.barrier,
  container: M.container, lanternPost: M.lanternPost, grassPlanter: M.grassPlanter, pipes: M.pipes,
  parkTree: M.parkTree, hedge: M.hedge, flowerBed: M.flowerBed, parkLamp: M.parkLamp, fountain: M.fountain, statue: M.statue,
  roundBed: M.roundBed, gazebo: M.gazebo, slide: M.slide, swings: M.swings, pondCell: M.pondCell, mooring: M.mooring,
};
// big things that belong inside a square or park, never on a curbside sidewalk
const SQUARE_ONLY = new Set(['fountain', 'statue', 'gazebo', 'slide', 'swings', 'pondCell', 'kiosk', 'container']);
const SMALL = new Set(['hydrant', 'bin', 'mailbox', 'bollards', 'bench', 'cones', 'lamp', 'parkLamp', 'flowerBed', 'mooring', 'crates', 'roundBed', 'hedge']);
const BIG_PARK_PROPS = ['parkTree', 'parkTree', 'roundBed', 'roundBed', 'flowerBed', 'hedge', 'bench', 'parkLamp', 'fountain', 'statue', 'gazebo', 'slide', 'swings', 'pondCell'];
const ALLEY = () => TX.groundMat('plaza', 0xf0e2c8);
const PARK_PROPS = ['parkTree', 'parkTree', 'parkTree', 'hedge', 'flowerBed', 'flowerBed', 'bench', 'parkLamp', 'fountain', 'statue'];
const NPC_FACES = [0, 0, Math.PI / 2, -Math.PI / 2, Math.PI];

const lampRow = (row, side) => ((row % 6) + 6) % 6 === (side > 0 ? 0 : 3);

// Walk-through details that keep open ground from looking empty.
function groundDetails(lane, park, curb) {
  const D = lane.district;
  const style = lane.info.style;
  let kinds = park ? ['grass', 'grass', 'daisies', 'leaves']
    : style === 'plaza' ? ['inlay', 'inlay', 'crack', 'manhole', 'puddle']
    : ['manhole', 'crack', 'puddle', 'grate'];
  if (D.id === 'tokyo') kinds = [...kinds, 'petals', 'petals'];
  if (D.id === 'eco' && !park) kinds = [...kinds, 'leaves', 'grass'];
  if (D.id === 'industrial') kinds = [...kinds, 'oil', 'oil'];
  if (D.id === 'port') kinds = [...kinds, 'rope', 'puddle'];
  // a light touch: most sidewalk rows get one detail at most
  const n = park ? randInt(1, 2) : Math.random() < 0.55 ? 1 : 0;
  for (let i = 0; i < n; i++) M.DECALS[pick(kinds)](lane.group, rand(-HALF - 0.4, HALF + 0.4), rand(-0.3, 0.3));
  // storm drains along the curb
  if (curb && !park && Math.random() < 0.2) M.DECALS.grate(lane.group, rand(-HALF, HALF), isRoad(lane.nextType) ? -0.3 : 0.3);
}

function buildSafe(lane) {
  const { row, group, info: inf, district: D } = lane;
  const park = inf.style === 'park';
  const edge = (t) => isRoad(t) || t === 'rail' || t === 'water' || t === 'gap' || t === 'build';
  const curb = edge(lane.prevType) || edge(lane.nextType);
  M.setSakura(D.id === 'tokyo');
  if (park) ground(lane, TX.groundMat('grass'), TX.groundMat('grass', 0xa8c0a8));
  else {
    const name = inf.style === 'plaza' ? 'plaza' : 'sidewalk';
    ground(lane, TX.groundMat(name, D.sidewalk), TX.groundMat(name, 0xa4a7c4));
  }

  // Curbs and corner traffic lights where the sidewalk meets a street.
  if (isRoad(lane.prevType)) {
    M.box(group, WORLD_W, 0.1, 0.14, 0xdfe1ee, 0, -0.03, 0.43);
    if (lane.prevType === 'road') M.trafficLight(group, -(HALF + 0.75), 0.3, 1);
  }
  if (isRoad(lane.nextType)) {
    M.box(group, WORLD_W, 0.1, 0.14, 0xdfe1ee, 0, -0.03, -0.43);
    if (lane.nextType === 'road') M.trafficLight(group, HALF + 0.75, -0.3, -1);
  }

  // Obstacles inside the playfield; some of them are people standing around.
  let cells;
  if (inf.center) cells = [];
  // behind the start the middle stays clear: the menu and garage cameras look through it
  else if (row <= -3) cells = freeCells(lane).filter((x) => Math.abs(x) > 1);
  else if (row < 0) cells = [-3, 3];
  else if (row === 0) cells = [-3, 3];
  else {
    const bp = inf.park;
    const crossAlley = bp && bp.idx % 3 === 2;
    // obstacle budget per row: open enough to breathe, ground details fill the rest
    const n = row <= 3 ? 1
      : bp ? (crossAlley ? randInt(0, 1) : weighted(rampWeights({ 0: 18, 1: 58, 2: 24 }, { 0: 10, 1: 50, 2: 40 }, ramp(row))) | 0)
      : park ? weighted(rampWeights({ 0: 40, 1: 48, 2: 12 }, { 0: 26, 1: 52, 2: 22 }, ramp(row))) | 0
      : weighted(rampWeights({ 0: 48, 1: 44, 2: 8 }, { 0: 28, 1: 50, 2: 22 }, ramp(row))) | 0;
    // spread obstacles out: not next to each other, not stacked on the ones in the row below
    const below = lanes.get(row - 1)?.blocked ?? new Set();
    const nearBelow = (x) => below.has(x - 1) || below.has(x) || below.has(x + 1);
    let all = freeCells(lane).filter((x) => row > 3 || x !== 0);
    const spread = all.filter((x) => !nearBelow(x));
    if (spread.length >= n + 2) all = spread;
    cells = [];
    for (let tries = 0; cells.length < n && tries < 30; tries++) {
      const x = pick(all);
      if (!cells.includes(x) && !cells.includes(x - 1) && !cells.includes(x + 1)) cells.push(x);
    }
    // never block the coin trail, and always keep at least two ways in from the lane below
    if (inf.trail != null) cells = cells.filter((x) => x !== inf.trail);
    // the robot must be able to get in from the lane below and still have room to move:
    // drop obstacles until at least two cells of this lane are reachable
    const entry = entryCells(lanes.get(row - 1));
    // No pockets and no long detours: wherever the robot can stand below, it can walk along its
    // own free stretch there and step up within two cells to the side.
    const open = () => freeCells(lane).filter((x) => !cells.includes(x));
    const stretch = (x) => {
      if (!entry) return [x];
      const run = [x];
      for (const d of [-1, 1]) for (let y = x + d; entry.has(y); y += d) run.push(y);
      return run;
    };
    const fair = () => {
      const o = open();
      if (reachCells(entry, o).size < 2) return false;
      if (entry && [...entry].filter((x) => !cells.includes(x)).length < Math.min(2, entry.size)) return false;
      const from = entry ? [...entry] : freeCells(lane);
      return from.every((x) => stretch(x).some((y) => o.includes(y) && Math.abs(y - x) <= 2));
    };
    while (cells.length && !fair()) cells.pop();
  }
  const standing = [];
  if (row <= -3) {
    // Low fence behind the start line (the camera looks over it).
    for (const x of cells) (x % 2 ? M.bollards : M.bench)(group, x);
  } else {
    const bp = inf.park;
    let props = bp ? (bp.idx % 3 === 2 ? ['bench', 'bench', 'parkLamp'] : BIG_PARK_PROPS)
      : park ? PARK_PROPS : inf.style === 'plaza' && !curb ? D.plaza : D.props;
    // next to traffic, rails or water only street furniture, no fountains or playgrounds
    if (curb) props = props.filter((n) => !SQUARE_ONLY.has(n));
    for (const x of cells) {
      if (row > 0 && Math.random() < (park ? 0.08 : 0.2)) standing.push(x);
      else {
        // the edge columns share the corner with traffic lights: keep them small
        const list = Math.abs(x) === HALF && curb ? props.filter((n) => SMALL.has(n)) : props;
        PROP_FNS[pick(list.length ? list : ['bin', 'hydrant', 'bench'])](group, x);
      }
    }
  }
  // people step aside for the robot, so their cells stay walkable
  for (const x of cells) if (!standing.includes(x)) lane.blocked.add(x);
  lane.reach = row <= 0 ? null : reachCells(entryCells(lanes.get(row - 1)), freeCells(lane));

  // Electrified floor panels on plazas further into the city.
  const tileCells = [];
  if (row > 40 && inf.style === 'plaza' && !curb && !WAIT_FOR.has(lane.nextType) && Math.random() < 0.18) {
    const free = freeCells(lane);
    const n = row > 80 && Math.random() < 0.3 ? 2 : 1;
    for (let i = 0; i < n && free.length; i++) {
      const x = free.splice(Math.floor(Math.random() * free.length), 1)[0];
      M.shockTile(group, x);
      tileCells.push(x);
    }
  }

  // Park alleys: a paved path along the coin trail, and a cross alley every third row.
  const bp = inf.park;
  if (park && inf.trail != null) {
    M.box(group, 0.9, 0.02, 1.0, ALLEY(), inf.trail, 0.012, 0).castShadow = false;
    for (const dx of [-0.47, 0.47]) M.box(group, 0.05, 0.04, 1.0, 0xb8b0a0, inf.trail + dx, 0.02, 0);
  }
  if (bp && bp.idx % 3 === 2) {
    M.box(group, 20, 0.02, 0.7, ALLEY(), 0, 0.011, 0).castShadow = false;
    for (const z of [-0.36, 0.36]) M.box(group, 20, 0.04, 0.05, 0xb8b0a0, 0, 0.02, z);
  }
  if (bp && bp.idx === 0 && !inf.gate) M.gate(group, 'ЦЕНТРАЛЬНЫЙ ПАРК', '#1a3a1a', '#6dffb0', 0x6dffb0);
  let gapNear = park ? 3 : 0;
  if (bp) {
    // a real park around the robot: trees, beds, ponds and gazebos instead of buildings
    gapNear = 9;
    for (const s of [-1, 1]) {
      if (Math.random() < 0.5) M.hedge(group, s * (HALF + 0.75), 0, 0.6);
      for (let x = HALF + 1.6; x < HALF + 9; x += rand(1.1, 1.7)) {
        const r = Math.random();
        if (r < 0.5) M.parkTree(group, s * x);
        else if (r < 0.65) M.roundBed(group, s * x);
        else if (r < 0.75) M.parkLamp(group, s * x);
        else if (r < 0.85) M.pond(group, s * (x + 0.4), 0, 1.4);
        else M.gazebo(group, s * x);
      }
    }
  } else if (park) {
    for (const s of [-1, 1]) {
      if (Math.random() < 0.6) M.hedge(group, s * (HALF + 0.75), 0, 0.6);
      M.parkTree(group, s * rand(4.7, 5.3));
      if (Math.random() < 0.3) M.pond(group, s * 6.3, 0, 1.4);
      else M.parkTree(group, s * rand(6.2, 6.8));
    }
  }
  // Sidewalk life outside the playfield: lamps with banners or lanterns.
  for (const s of [-1, 1]) {
    if (park) break;
    // a steady rhythm: one lamp every three rows, alternating sides
    if (lampRow(row, s) && !inf.viaduct && !inf.gate) (D.lanterns ? M.lanternPost : M.bannerLamp)(group, s * (HALF + 0.75), 0);
  }

  if (D.port && !park && Math.random() < 0.12) {
    M.lighthouse(group, (Math.random() < 0.5 ? -1 : 1) * 5.4);
    gapNear = Math.max(gapNear, 2.2);
  }
  if (inf.center) {
    const c = M.STATION_COLOR[inf.center];
    M.station(group, HALF, inf.center);
    M.gate(group, STATION_NAME[inf.center], '#0a1a2a', `#${c.toString(16).padStart(6, '0')}`, c);
  }
  if (inf.viaduct) M.viaduct(group);
  if (inf.gate) M.gate(group, D.name, D.fg, D.bg, D.neonHex);
  groundDetails(lane, park, curb);
  skyline(group, gapNear);
  M.bake(group);
  if (inf.center) {
    lane.holo = M.stationHolo(inf.center);
    group.add(lane.holo);
  }

  if (inf.viaduct) {
    const mesh = M.makeTrain();
    mesh.position.y = M.VIADUCT_Y + 0.1;
    lane.dir = Math.random() < 0.5 ? 1 : -1;
    if (lane.dir < 0) mesh.rotation.y = Math.PI;
    lane.speed = 7;
    placeMovers(lane, [{ mesh, len: mesh.userData.len + 30, x: 0 }], 0);
  }
  for (const x of tileCells) {
    const mesh = M.box(group, 0.76, 0.02, 0.76, M.SHOCK_MATS.off, x, 0.035, 0);
    mesh.castShadow = false;
    const boltMat = new THREE.MeshBasicMaterial({ color: 0x8a7010 });
    M.boltGlyph(group, x, boltMat);
    const sign = TX.hazardSprite('bolt');
    sign.position.set(x, 1.0, 0);
    group.add(sign);
    lane.tiles.push({ x, mesh, boltMat, sign, phase: 'off', t: rand(0.5, 3), off: rand(1.8, 3) });
  }

  // People: standing in the way, waiting at the curb, strolling along the sidewalk.
  // Some wait for a high five, some are fans, some sidewalks have delivery robots.
  if (row > -3 && !inf.center) {
    const role = () => (row < 4 ? null : pick([null, null, null, 'five', 'five', 'fan']));
    for (const x of standing) NPC.spawnPerson(lane, x, 'stand', pick(NPC_FACES), role());
    for (const s of [-1, 1]) {
      if ((!park && lampRow(row, s)) || Math.random() > (park ? 0.12 : 0.2)) continue;
      const r = Math.random();
      NPC.spawnPerson(lane, s * (HALF + 0.75), 'stand', pick(NPC_FACES), row < 4 ? null : r < 0.2 ? 'five' : r < 0.3 ? 'fan' : null);
    }
    if (row >= 2) {
      const walkers = park ? (Math.random() < 0.3 ? 1 : 0) : Math.random() < 0.22 ? 1 : Math.random() < 0.05 ? 2 : 0;
      for (let i = 0; i < walkers; i++) {
        const x = rand(-8, 8);
        const r = Math.random();
        const kind = !park && r < 0.25 ? 'courier' : r < 0.3 ? 'fan' : null;
        if (!lane.blocked.has(Math.round(x)) && !NPC.personAt(lane, x)) NPC.spawnPerson(lane, x, 'walk', 0, kind);
      }
      // white delivery rovers rolling along sidewalks and plazas: about one in five
      if (!park && row >= 4 && Math.random() < 0.2) {
        const x = rand(-HALF - 3, HALF + 3);
        if (!lane.blocked.has(Math.round(x)) && !NPC.personAt(lane, x)) NPC.spawnPerson(lane, x, 'walk', 0, 'courier');
      }
    }
  }
  // Robotic lawn mowers trimming the grass: in the inner rows of big parks, now and then in
  // small ones (never on the first or last row of a park, the robot enters and leaves there)
  // (never on the lane the robot lands on from a hazard: from a boat it must be able to step off)
  const afterHazard = WAIT_FOR.has(lane.prevType);
  const mowerRow = bp ? bp.idx > 0 && bp.idx < bp.len - 1 && Math.random() < 0.2 + 0.15 * ramp(row) : park && row > 10 && Math.random() < 0.12;
  if (mowerRow && !afterHazard && lane.blocked.size <= 2) {
    const mesh = M.makeMower();
    group.add(mesh);
    lane.patrol = { mesh, x: rand(-HALF, HALF), dir: Math.random() < 0.5 ? 1 : -1, speed: rand(0.8, 1.2), beep: 0, mower: true };
  }

  // Patrol drone sweeping the sidewalk.
  // (inside a run of sidewalks or a plaza, never right in front of a road or water: that is where
  // the robot waits)
  // (and not on the lane right after one either: a drone flying in step with the boat the robot
  // rides would leave it no place to land)
  if (row > 30 && (inf.style === 'sidewalk' || inf.style === 'plaza') && !inf.park && !inf.center
    && !WAIT_FOR.has(lane.nextType) && !afterHazard
    && !inf.viaduct && !inf.gate && lane.blocked.size < 2 && Math.random() < 0.25 * ramp(row) + 0.05) {
    const mesh = M.makePatrol();
    group.add(mesh);
    lane.patrol = { mesh, x: rand(-HALF, HALF), dir: Math.random() < 0.5 ? 1 : -1, speed: rand(1.1, 1.7) * (1 + difficulty(row) * 0.5), beep: 0 };
  }
  // parks: a token every other row along the alley, not a solid line
  const trailCoin = inf.trail != null && row > 2 && ((inf.park?.idx ?? row) % 2 === 0 && Math.random() < 0.65);
  if (trailCoin) placeCoin(lane, inf.trail);
  else if (!park) maybeCoin(lane, 0.08);
}

const ROAD_KINDS = { taxi: 3, sedan: 2, compact: 1.5, police: 1, truck: 1.5, bus: 1 };
const HOVER_KINDS = { hovercar: 3, hovertruck: 1 };

// Zebra bars run along the traffic and are stacked across the road, as seen from above.
function crosswalk(group, cx) {
  for (const z of [-0.25, 0.25]) M.box(group, 2.4, 0.02, 0.26, 0xeceef8, cx, -0.07, z);
}

function buildRoad(lane) {
  const hover = lane.type === 'hover';
  const { group, info: inf } = lane;
  const prev = lanes.get(lane.row - 1);
  lane.dir = Math.random() < 0.5 ? 1 : -1;

  if (hover) {
    ground(lane, TX.groundMat('asphalt', 0xb8a4e0), TX.groundMat('asphalt', 0x8a7ab4), -0.08);
    for (const z of [-0.47, 0.47]) M.box(group, WORLD_W, 0.02, 0.05, 0xff4fd8, 0, -0.07, z, true);
    for (let x = -SPAWN; x < SPAWN; x += 2) M.box(group, 0.9, 0.02, 0.06, 0x35e6ff, x, -0.07, 0, true);
  } else {
    ground(lane, TX.groundMat('asphalt'), TX.groundMat('asphalt', 0xb4b6cc), -0.08);
    if (lane.prevType === 'road' && prev) {
      if (prev.dir !== lane.dir) {
        for (const z of [0.46, 0.54]) M.box(group, WORLD_W, 0.02, 0.04, 0xffc21a, 0, -0.07, z);
      } else {
        for (let x = -SPAWN; x < SPAWN; x += 1.6) M.box(group, 0.7, 0.02, 0.08, 0xe8e9f5, x, -0.07, 0.5);
      }
    }
    // Zebra in the playfield plus the avenue crossings on both corners.
    crosswalk(group, inf.cw);
    for (const s of [-1, 1]) crosswalk(group, s * (HALF + 2.3));
    M.box(group, 0.1, 0.02, 0.84, 0xeceef8, inf.cw - lane.dir * 1.6, -0.07, 0);
    // patches, a manhole or skid marks so the asphalt is not blank
    if (Math.random() < 0.35) M.DECALS[pick(['patch', 'patch', 'skid', 'roadManhole'])](group, rand(-HALF - 3, HALF + 3), rand(-0.25, 0.25));
  }
  M.bake(group);

  const d = difficulty(lane.row);
  // speeds grow gently with the distance and never go past a cap (cells per second)
  const [lo, hi] = hover ? [2.6, 6.2] : [1.2, 4.2];
  lane.speed = Math.min(hi, (hover ? rand(3.2, 4.6) * (1 + d * 0.35) : rand(1.5, 2.8) * (1 + d * 0.45)));
  // Several lanes side by side: a lane going the same way as the one below must be clearly
  // faster or slower, otherwise a wall of cars could keep its shape and never open up.
  // When faster would break the cap it goes slower instead.
  const nb = prev && (prev.type === 'road' || prev.type === 'hover') ? prev : null;
  if (nb && nb.dir === lane.dir) {
    const r = lane.speed / nb.speed;
    if (r > 0.75 && r < 1.33) lane.speed = nb.speed * (Math.random() < 0.5 && nb.speed * 1.4 <= hi ? 1.4 : 0.7);
    lane.speed = Math.max(lo, Math.min(hi, lane.speed));
  }
  // dense enough that running straight ahead without looking gets the robot hit
  const k = ramp(lane.row);
  const count = hover ? (Math.random() < 0.3 + 0.6 * k ? 3 : 2)
    : weighted(rampWeights({ 1: 25, 2: 55, 3: 20 }, { 2: 20, 3: 50, 4: 30 }, k)) | 0;
  const list = [];
  for (let i = 0; i < count; i++) {
    const mesh = M.makeVehicle(weighted(hover ? HOVER_KINDS : ROAD_KINDS));
    if (lane.dir < 0) mesh.rotation.y = Math.PI;
    list.push({ mesh, len: mesh.userData.len, x: 0, hover: mesh.userData.hover, flash: mesh.userData.flash, phase: rand(0, 6), voice: rand(0.85, 1.2) });
  }
  // stagger against the lane below: its cars and ours do not line up into a wall
  const start = nb && nb.movers.length ? wrap(nb.movers[0].x + LOOP / (2 * Math.max(1, count))) : rand(-SPAWN, SPAWN);
  placeMovers(lane, list, 3.4, start);
  for (const v of list) v.honk = 0;
  maybeCoin(lane, 0.05);
}

// Gap between city levels, crossed on anti-gravity pads.
function buildGap(lane) {
  const prev = lanes.get(lane.row - 1);
  const { group } = lane;
  M.box(group, WORLD_W, 0.2, 1, TX.groundMat('abyss'), 0, -GAP_DEPTH - 0.1, 0).castShadow = false;
  // the far wall goes from lit steel into black: it reads as a deep shaft, not a floor
  // (only at the last row of a wide chasm, otherwise it would stand between the rows)
  if (lane.nextType !== 'gap') {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, GAP_DEPTH), TX.shaftMaterial(WORLD_W / 2));
    wall.position.set(0, -GAP_DEPTH / 2, -0.44);
    group.add(wall);
  }
  // a little cold mist low down
  const mist = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, 0.9), new THREE.MeshBasicMaterial({ color: 0x0a0c22, transparent: true, opacity: 0.7, depthWrite: false, fog: false }));
  mist.rotation.x = -Math.PI / 2;
  mist.position.y = -GAP_DEPTH * 0.55;
  group.add(mist);
  // solid striped lips on both edges, so the drop is impossible to miss
  for (const z of [-0.44, 0.44]) {
    const neighbour = z < 0 ? lane.nextType : lane.prevType;
    if (neighbour === 'gap') continue;
    M.box(group, WORLD_W, 0.4, 0.12, 0x3a3d55, 0, -0.2, z).castShadow = false;
    M.hazardEdge(group, z, WORLD_W);
    M.box(group, WORLD_W, 0.05, 0.03, z < 0 ? 0x35e6ff : 0xff4fd8, 0, -0.05, z + (z < 0 ? 0.065 : -0.065), true);
  }
  M.bake(group);
  if (lane.prevType !== 'gap') {
    for (const x of [-HALF - 0.9, HALF + 0.9]) {
      const sign = TX.hazardSprite('gap');
      sign.position.set(x, 0.75, 0.35);
      group.add(sign);
    }
  }

  const d = difficulty(lane.row);
  lane.dir = prev && prev.type === 'gap' ? -prev.dir : Math.random() < 0.5 ? 1 : -1;
  lane.speed = rand(1.0, 1.8) * (1 + d * 0.5);
  const list = [];
  const count = randInt(4, 5);
  for (let i = 0; i < count; i++) {
    const len = Math.random() < 0.35 + d * 0.3 ? 2 : 3;
    const mesh = M.makePad(len);
    list.push({ mesh, len, x: 0, hover: true, phase: rand(0, 6) });
  }
  placeMovers(lane, list, 1.6, floatStart(lane, list.length));
}

function buildRail(lane) {
  const { group } = lane;
  ground(lane, TX.groundMat('concrete'), TX.groundMat('concrete', 0xa8abc4));
  M.box(group, WORLD_W, 0.14, 0.42, TX.groundMat('concrete', 0x8086b0), 0, 0.07, 0).castShadow = false;
  for (const z of [-0.18, 0.18]) M.box(group, WORLD_W, 0.03, 0.05, 0x2fd0ff, 0, 0.155, z, true);
  for (const z of [-0.45, 0.45]) M.box(group, WORLD_W, 0.02, 0.06, 0xffc21a, 0, 0.01, z);
  M.box(group, 0.08, 0.95, 0.08, 0x55597a, HALF + 0.8, 0.475, 0.38);
  M.box(group, 0.24, 0.24, 0.14, 0x22232e, HALF + 0.8, 1.0, 0.38);
  M.bake(group);
  lane.lamp = M.box(group, 0.15, 0.15, 0.03, 0x4a1822, HALF + 0.8, 1.0, 0.46);
  lane.strips = [-0.32, 0.32].map((z) => M.box(group, WORLD_W, 0.03, 0.06, 0x4a1822, 0, 0.02, z));

  lane.dir = Math.random() < 0.5 ? 1 : -1;
  const mesh = M.makeTrain();
  if (lane.dir < 0) mesh.rotation.y = Math.PI;
  mesh.visible = false;
  group.add(mesh);
  const len = mesh.userData.len;
  lane.train = { mesh, len, x: -lane.dir * (SPAWN + len / 2), active: false, warned: false, timer: rand(1, 6) };
}

// ---------------------------------------------------------------- security zones
function securityGround(lane) {
  ground(lane, TX.groundMat('concrete', 0x9094c0), TX.groundMat('concrete', 0x6a6e98));
  for (const z of [-0.46, 0.46]) M.hazardEdge(lane.group, z, WORLD_W);
}

// Laser fence: off -> warning flicker -> deadly beam.
function buildLaser(lane) {
  const { group } = lane;
  securityGround(lane);
  for (const s of [-1, 1]) M.laserPylon(group, s * (HALF + 0.75));
  M.bake(group);
  const beams = M.makeLaserBeams(2 * HALF + 1.2);
  group.add(beams.group);
  const d = difficulty(lane.row);
  lane.laser = { ...beams, phase: 'off', t: rand(0.5, 2.5), off: rand(1.6, 2.6) * (1 - d * 0.3), on: rand(1.0, 1.4) };
}

// Patrol zone: a security strip with a drone flying back and forth across the street.
function buildPatrol(lane) {
  securityGround(lane);
  for (const s of [-1, 1]) M.box(lane.group, 0.12, 1.6, 0.12, 0x55597a, s * (HALF + 0.8), 0.8, 0.35);
  M.bake(lane.group);
  const mesh = M.makePatrol();
  lane.group.add(mesh);
  const d = difficulty(lane.row);
  lane.patrol = { mesh, x: rand(-HALF, HALF), dir: Math.random() < 0.5 ? 1 : -1, speed: rand(1.4, 2.0) * (1 + d * 0.5), beep: 0 };
}

// Hovering scanner sweeping a red curtain back and forth.
function buildScan(lane) {
  securityGround(lane);
  M.bake(lane.group);
  const d = difficulty(lane.row);
  const n = lane.row > 60 && Math.random() < 0.4 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const mesh = M.makeScanner();
    lane.group.add(mesh);
    lane.scanners.push({ mesh, x: rand(-HALF - 1, HALF + 1), dir: i ? -1 : Math.random() < 0.5 ? 1 : -1, speed: rand(1.5, 2.3) * (1 + d * 0.6), beep: 0 });
  }
}

const hum = { patrol: 0, scanner: 0, patrolPan: 0, scannerPan: 0 };
function hear(name, x, row) {
  if (!P.alive || (state !== 'play' && state !== 'menu')) return;
  const dx = x - P.x;
  const level = clamp(1 - Math.hypot(dx, (row - P.row) * 1.2) / 6, 0, 1);
  if (level > hum[name]) { hum[name] = level; hum[name + 'Pan'] = clamp(dx / 4, -1, 1); }
}

function updateHazards(lane, dt) {
  const near = nearPlayer(lane) && Math.abs(lane.row - P.row) < 4;

  const L = lane.laser;
  if (L) {
    L.t -= dt;
    if (L.t <= 0) {
      if (L.phase === 'off') { L.phase = 'warn'; L.t = 0.9; if (near) sfx.laserCharge(); }
      else if (L.phase === 'warn') { L.phase = 'on'; L.t = L.on; if (near) sfx.laserZap(); }
      else { L.phase = 'off'; L.t = L.off; }
    }
    const on = L.phase === 'on', warn = L.phase === 'warn';
    const jitter = Math.random();
    L.core.opacity = on ? 0.95 : 0;
    L.inner.opacity = on ? 0.75 + jitter * 0.25 : 0;
    L.halo.opacity = on ? 0.22 + jitter * 0.12 : 0;
    L.floor.opacity = on ? 0.4 : warn ? 0.15 + 0.1 * Math.sin(time * 20) : 0.05;
    L.flare.opacity = on ? 0.7 + jitter * 0.3 : warn ? 0.25 + 0.25 * Math.sin(time * 25) : 0.08;
    // targeting dashes crawl along the beam during the warning
    L.dash.opacity = warn ? (Math.floor(time * 12) % 2 ? 0.9 : 0.5) : 0;
    L.dashes.position.x = (time * 1.5) % 0.4;
    for (const b of L.beams) b.scale.y = b.scale.z = on ? 0.85 + jitter * 0.3 : 1;
    if (on && Math.random() < dt * 14) {
      const s = Math.random() < 0.5 ? -1 : 1;
      burst(s * (HALF + 0.55), pick([0.3, 0.65, 1.0]), -lane.row, [0xff6a7a, 0xffd0e0, 0xffffff], 1, 1.2);
    }
  }

  for (const sc of lane.scanners) {
    sc.x += sc.dir * sc.speed * dt;
    if (Math.abs(sc.x) > HALF + 2) { sc.x = Math.sign(sc.x) * (HALF + 2); sc.dir = -sc.dir; }
    sc.mesh.position.set(sc.x, Math.sin(time * 3 + sc.speed) * 0.05, 0);
    const u = sc.mesh.userData;
    u.scanline.position.y = 0.1 + ((time * 1.6 + sc.speed) % 1) * 1.9;
    for (const r of u.rotors) r.rotation.y += dt * 45;
    u.body.rotation.z = -sc.dir * 0.12;
    hear('scanner', sc.x, lane.row);
    sc.beep -= dt;
    if (near && sc.beep <= 0 && Math.abs(sc.x - P.x) < 3) { sfx.scanBeep(); sc.beep = 0.45; }
  }

  for (const t of lane.tiles) {
    t.t -= dt;
    if (t.t <= 0) {
      if (t.phase === 'off') { t.phase = 'warn'; t.t = 0.75; }
      else if (t.phase === 'warn') { t.phase = 'on'; t.t = 1.0; if (near) sfx.shock(); }
      else { t.phase = 'off'; t.t = t.off; }
    }
    const flick = Math.floor(time * 16) % 2;
    t.mesh.material = t.phase === 'off' ? M.SHOCK_MATS.off
      : t.phase === 'warn' ? (flick ? M.SHOCK_MATS.warn : M.SHOCK_MATS.off)
      : (flick || Math.random() < 0.5 ? M.SHOCK_MATS.on : M.SHOCK_MATS.warn);
    // the glyph and the hologram say what is coming: dim -> blinking yellow -> white hot
    t.boltMat.color.setHex(t.phase === 'off' ? 0x8a7010 : t.phase === 'warn' ? (flick ? 0xffd21f : 0x8a7010) : 0xffffff);
    t.sign.material.opacity = t.phase === 'off' ? 0.55 : 1;
    t.sign.material.color.setHex(t.phase === 'on' ? 0xff9090 : 0xffffff);
    t.sign.position.y = 1.0 + Math.sin(time * 3 + t.x) * 0.06;
    if (t.phase === 'on' && Math.random() < dt * 10) burst(t.x + rand(-0.4, 0.4), 0.1, -lane.row + rand(-0.4, 0.4), [0xbff8ff, 0x35e6ff], 1, 1.5);
  }

  updateBuild(lane, dt, near);

  const pt = lane.patrol;
  if (pt && pt.mower) {
    pt.x += pt.dir * pt.speed * dt;
    if (Math.abs(pt.x) > HALF + 1.5) { pt.x = Math.sign(pt.x) * (HALF + 1.5); pt.dir = -pt.dir; }
    pt.mesh.position.x = pt.x;
    pt.mesh.rotation.y = pt.dir > 0 ? 0 : Math.PI;
    pt.mesh.userData.body.position.y = Math.abs(Math.sin(time * 18)) * 0.015;
    if (Math.random() < dt * 6) burst(pt.x - pt.dir * 0.3, 0.1, -lane.row, [0x5ad15a, 0x3fae49], 1, 1.2);
  } else if (pt) {
    pt.x += pt.dir * pt.speed * dt;
    if (Math.abs(pt.x) > HALF + 1.5) { pt.x = Math.sign(pt.x) * (HALF + 1.5); pt.dir = -pt.dir; }
    pt.mesh.position.x = pt.x;
    const u = pt.mesh.userData;
    u.body.position.y = 1.2 + Math.sin(time * 4) * 0.06;
    u.body.rotation.z += (-pt.dir * 0.18 - u.body.rotation.z) * Math.min(1, dt * 4);
    u.head.rotation.y = Math.sin(time * 1.5) * 0.5;
    for (const r of u.rotors) r.rotation.y += dt * 50;
    u.spot.material.opacity = 0.35 + 0.15 * Math.sin(time * 6);
    hear('patrol', pt.x, lane.row);
    pt.beep -= dt;
    if (near && pt.beep <= 0 && Math.abs(pt.x - P.x) < 2) { sfx.alarm(); pt.beep = 1.2; }
  }

  // Drivers honk at a robot standing in their way.
  if (isRoad(lane.type)) {
    if (state === 'play' && P.alive && (lane.row === P.row || lane.row === P.row + 1)) {
      for (const v of lane.movers) {
        const ahead = (P.x - v.x) * lane.dir;
        if (ahead > 0 && ahead < v.len / 2 + 2.2 && time - v.honk > 3) {
          v.honk = time;
          sfx.horn(v.mesh.userData.kind, lane.row === P.row ? 1 : 0.6);
        }
      }
    }
  }
}

// Canal crossing the street: ride boats or hop across anchored buoys.
function buildWater(lane) {
  const prev = lanes.get(lane.row - 1);
  const { group } = lane;
  const { material, map } = TX.waterMaterial();
  lane.waterMap = map;
  M.box(group, WORLD_W, 0.3, 1, material, 0, -0.5, 0).castShadow = false;
  if (lane.prevType !== 'water') {
    M.box(group, WORLD_W, 0.14, 0.1, 0x9a9eb8, 0, -0.02, 0.47);
    M.box(group, WORLD_W, 0.01, 0.08, 0xe8f6ff, 0, -0.345, 0.4, true);
  }
  if (lane.nextType !== 'water') {
    M.box(group, WORLD_W, 0.14, 0.1, 0x9a9eb8, 0, -0.02, -0.47);
    M.box(group, WORLD_W, 0.01, 0.08, 0xe8f6ff, 0, -0.345, -0.4, true);
  }
  M.bake(group);

  const d = difficulty(lane.row);
  lane.dir = prev && prev.type === 'water' ? -prev.dir : Math.random() < 0.5 ? 1 : -1;
  const buoysBelow = prev && prev.type === 'water' && prev.speed === 0;
  if (lane.row > 10 && !buoysBelow && Math.random() < 0.3) {
    // anchored buoys: one row per canal, 2-3 spots, never moving
    lane.speed = 0;
    const want = randInt(2, 3);
    const entry = entryCells(prev);
    // one in front of every free stretch the robot can stand on below (no pockets), two of them
    // at least where it can step on, the rest anywhere
    const cells = [];
    if (entry) {
      const xs = [...entry].filter((x) => Math.abs(x) <= HALF).sort((a, b) => a - b);
      const runs = [];
      for (const x of xs) (runs.length && x === runs[runs.length - 1].at(-1) + 1 ? runs[runs.length - 1].push(x) : runs.push([x]));
      // cover every stretch so a buoy is never more than two steps aside
      for (const run of runs) {
        for (let i = 0; i < run.length;) {
          const at = run[Math.min(i + 2, run.length - 1)];
          cells.push(at);
          while (i < run.length && run[i] <= at + 2) i++;
        }
      }
      for (const x of shuffleArr(xs)) if (cells.length < 2 && !cells.includes(x)) cells.push(x);
    }
    while (cells.length < want) {
      const x = randInt(-HALF, HALF);
      if (!cells.includes(x)) cells.push(x);
    }
    for (const x of [-HALF - 3, HALF + 3]) cells.push(x);
    lane.movers = cells.map((x) => {
      const mesh = M.makeBuoy();
      mesh.position.x = x;
      group.add(mesh);
      return { mesh, len: 1, x, phase: rand(0, 6) };
    });
    // the robot hops from buoy to buoy: neighbouring buoys chain sideways
    lane.reach = reachCells(entry, cells.filter((x) => Math.abs(x) <= HALF));
    return;
  }
  lane.speed = rand(0.9, 1.6) * (1 + d * 0.5);
  const list = [];
  const count = randInt(4, 5);
  for (let i = 0; i < count; i++) {
    const port = lane.district.port;
    const len = port && Math.random() < 0.4 ? 4 : Math.random() < 0.3 + d * 0.3 ? 2 : 3;
    const mesh = M.makeBoat(len, port ? { kind: pick(['ferry', 'barge', 'white']) } : {});
    if (lane.dir < 0) mesh.rotation.y = Math.PI;
    const boat = { mesh, len, x: 0, phase: rand(0, 6), voice: rand(0.85, 1.2) };
    list.push(boat);
    if (lane.row > 8 && Math.random() < 0.1) {
      // a token on deck: grab it by landing on that spot
      const off = randInt(0, len - 1) - len / 2 + 0.5;
      const coin = M.makeCoin();
      coin.position.set(off * lane.dir, 0.45, 0);
      mesh.add(coin);
      lane.coins.push({ boat, off, mesh: coin, x: null });
    }
  }
  placeMovers(lane, list, 1.6, floatStart(lane, list.length));
}

// Construction site: a tower crane swinging a container across the street, or steel beams
// dropping onto cells marked by a growing shadow.
function buildBuild(lane) {
  const { group } = lane;
  ground(lane, TX.groundMat('concrete', 0xd0c09c), TX.groundMat('concrete', 0xa09478));
  for (const z of [-0.46, 0.46]) M.hazardEdge(group, z, WORLD_W);
  for (const s of [-1, 1]) {
    M.cones(group, s * (HALF + 0.9));
    M.sandPile(group, s * (HALF + 2.4));
    M.rebar(group, s * (HALF + 3.9));
  }
  const d = difficulty(lane.row);
  if (Math.random() < 0.55) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const H = 7.2;
    M.craneTower(group, side * (HALF + 5.2), H, 2 * HALF + 9);
    M.bake(group);
    const load = M.makeCraneLoad(H);
    group.add(load);
    lane.crane = { load, L: H + 0.72, period: rand(4.8, 6.2) * (1 - d * 0.25), phase: rand(0, 6.28), amp: HALF + 1.4, hitX: 99, ph: 0, lastSign: 0 };
  } else {
    M.bake(group);
    lane.beams = { next: rand(0.6, 1.4), list: [] };
  }
}

function updateBuild(lane, dt, near) {
  const C = lane.crane;
  if (C) {
    C.ph = (time * 2 * Math.PI) / C.period + C.phase;
    const x = Math.sin(C.ph) * C.amp;
    const tilt = -Math.cos(C.ph) * 0.05;
    const u = C.load.userData;
    u.trolley.position.x = x;
    u.swing.position.x = x;
    u.swing.rotation.z = tilt;
    C.hitX = x + C.L * Math.sin(tilt);
    u.shadow.position.x = C.hitX;
    const sgn = Math.sign(Math.cos(C.ph));
    if (sgn !== C.lastSign) { C.lastSign = sgn; if (near) sfx.creak(); }
  }

  const B = lane.beams;
  if (!B) return;
  const d = difficulty(lane.row);
  B.next -= dt;
  if (B.next <= 0 && B.list.length < 2) {
    B.next = rand(0.9, 1.7) * (1 - d * 0.3);
    let x = randInt(-HALF, HALF);
    // half of the beams aim at the robot when it is close
    if (P.alive && Math.abs(P.row - lane.row) <= 1 && Math.random() < 0.5) x = clamp(Math.round(P.x), -HALF, HALF);
    if (!B.list.some((b) => b.x === x)) {
      const mark = M.makeBeamMark();
      mark.position.x = x;
      const sign = TX.hazardSprite('beam');
      sign.position.y = 1.15;
      mark.add(sign);
      lane.group.add(mark);
      B.list.push({ x, t: 0, mark, beam: null, phase: 'warn', beep: 0 });
    }
  }
  for (const b of B.list) {
    b.t += dt;
    if (b.phase === 'warn') {
      const k = Math.min(1, b.t / 1.1);
      b.mark.userData.shadow.scale.setScalar(0.25 + k * 0.75);
      const blink = Math.floor(time * 10) % 2;
      b.mark.userData.ring.material.opacity = blink ? 0.95 : 0.35;
      b.mark.userData.column.material.opacity = blink ? 0.85 : 0.35;
      b.beep -= dt;
      if (near && b.beep <= 0) { sfx.beamWarn(); b.beep = 0.3; }
      if (b.t >= 1.1) {
        b.phase = 'fall';
        b.t = 0;
        b.beam = M.makeBeam();
        b.beam.position.set(b.x, 8, 0);
        b.beam.rotation.y = rand(-0.3, 0.3);
        lane.group.add(b.beam);
        if (near) sfx.beamFall();
      }
    } else if (b.phase === 'fall') {
      const k = Math.min(1, b.t / 0.28);
      b.beam.position.y = 8 - k * k * 7.85;
      if (k >= 1) {
        b.phase = 'down';
        b.t = 0;
        lane.group.remove(b.mark);
        lane.blocked.add(b.x);
        burst(b.x, 0.2, -lane.row, [0x9a9078, 0xc8b898, 0x8a8ea8], 12, 2.5);
        if (near) sfx.clang();
        const rp = robot.root.position;
        if (P.alive && !P.fly && !(P.shield > 0) && Math.round(-rp.z) === lane.row && Math.abs(rp.x - b.x) < 0.55) die('beam');
      }
    } else if (b.phase === 'down') {
      if (b.t > 1.4) b.beam.position.y = 0.15 - (b.t - 1.4) * 1.2;
      if (b.t > 1.8) {
        lane.group.remove(b.beam);
        lane.blocked.delete(b.x);
        b.phase = 'done';
      }
    }
  }
  B.list = B.list.filter((b) => b.phase !== 'done');
}

// Movers are spread evenly around the loop (a little jitter only), so they never bunch up and
// leave a long empty stretch: that is what made the robot wait for a boat or a pad. `start`
// sets the phase, e.g. to stagger a lane against its neighbour.
// first platform half a gap away from the nearest one of a moving float lane below
function floatStart(lane, n) {
  const prev = lanes.get(lane.row - 1);
  return prev && isFloat(prev.type) && prev.speed > 0 && prev.movers.length ? wrap(prev.movers[0].x + LOOP / (2 * n)) : rand(-SPAWN, SPAWN);
}

function placeMovers(lane, list, minGap, start = rand(-SPAWN, SPAWN)) {
  const total = list.reduce((s, m) => s + m.len, 0);
  const free = Math.max(0, LOOP - total - minGap * list.length);
  const w = list.map(() => 1 + rand(-0.2, 0.2));
  const ws = w.reduce((a, b) => a + b, 0);
  let x = start;
  list.forEach((m, i) => {
    x += minGap + (free * w[i]) / ws;
    m.x = wrap(x + m.len / 2);
    x += m.len;
    m.mesh.position.x = m.x;
    lane.group.add(m.mesh);
  });
  lane.movers = list;
}

const nearPlayer = (lane) => state === 'play' && Math.abs(lane.row - P.row) < 8;

// Train sounds are shared between all tracks so several trains never pile up.
const trainSfx = { horn: -9, pass: -9, bell: 0, side: 1 };

function updateLanes(dt) {
  let bellK = 0;
  let waterK = 0;
  hum.patrol = hum.scanner = 0;
  for (const lane of lanes.values()) {
    const step = lane.dir * lane.speed * dt;
    // How loud this lane is for the robot (fades out a few rows away).
    const audible = (state === 'play' || state === 'menu') && P.alive;
    const k = audible ? clamp(1 - Math.abs(lane.row - P.row) / 6, 0, 1) : 0;
    if (lane.holo) {
      const h = lane.holo.userData;
      h.holo.rotation.y += dt * 1.4;
      h.holo.position.y = 1.7 + Math.sin(time * 2) * 0.1;
      h.beam.material.opacity = 0.12 + 0.06 * Math.sin(time * 4);
    }
    for (const v of lane.movers) {
      v.x = wrap(v.x + step);
      v.mesh.position.x = v.x;
      if (v.hover) v.mesh.position.y = Math.sin(time * 4 + v.phase) * (lane.type === 'gap' ? 0.02 : 0.05);
      if (lane.type === 'water') {
        v.mesh.position.y = Math.sin(time * 2.2 + v.phase) * 0.03;
        v.mesh.rotation.x = Math.sin(time * 1.7 + v.phase) * 0.03;
      }
      if (v.flash) {
        const on = Math.floor(time * 6 + v.phase) % 2 === 0;
        v.flash[0].material = M.mat(on ? 0xff2b4a : 0x3a1020, on);
        v.flash[1].material = M.mat(on ? 0x14204a : 0x2b6bff, !on);
      }
      // pass-by sounds: traffic next to the robot, the monorail overhead
      const kind = v.mesh.userData.kind;
      const d = Math.abs(v.x - P.x);
      const ahead = (P.x - v.x) * lane.dir;
      if (k > 0 && (kind || lane.type === 'safe')) {
        if (!v.passed && (kind ? ahead < v.len / 2 + 1.8 && ahead > -0.5 : d < 4)) {
          v.passed = true;
          if (kind) sfx.pass(kind, Math.pow(k, 0.7), lane.dir, v.voice); else if (Math.abs(lane.row - P.row) < 5) sfx.monorail(k);
        } else if (d > 6) v.passed = false;
        if (kind === 'police' && d < 6 && time - (v.siren ?? -9) > 5) { v.siren = time; sfx.siren(k); }
      }
    }

    const tr = lane.train;
    if (tr) {
      if (!tr.active) {
        tr.timer -= dt;
        if (tr.timer <= 0) {
          tr.active = true;
          tr.passed = false;
          tr.x = -lane.dir * (SPAWN + tr.len / 2);
          tr.mesh.visible = true;
          if (k > 0.3 && time - trainSfx.horn > 3.5) { trainSfx.horn = time; sfx.trainHorn(k); }
        }
      } else {
        tr.x += lane.dir * TRAIN_SPEED * dt;
        if (k > 0 && !tr.passed && Math.abs(tr.x - P.x) < tr.len / 2 + 3) {
          tr.passed = true;
          if (time - trainSfx.pass > 1.2) { trainSfx.pass = time; sfx.trainPass(k, lane.dir); }
        }
        if (tr.x * lane.dir > SPAWN + tr.len / 2) {
          tr.active = false;
          tr.mesh.visible = false;
          tr.timer = rand(3, 7);
        }
      }
      tr.mesh.position.x = tr.x;
      // Level crossing: the bell rings from ~2 s before the train until its tail clears the street.
      const ringing = (!tr.active && tr.timer < 2.2) || (tr.active && (tr.x - lane.dir * tr.len / 2) * lane.dir < HALF + 1);
      if (ringing) bellK = Math.max(bellK, k);
      const lit = ringing && Math.floor(time * 4.4) % 2 === 0;
      lane.lamp.material = M.mat(lit ? 0xff2b4a : 0x4a1822, lit);
      for (const st of lane.strips) st.material = lane.lamp.material;
    }

    if (lane.waterMap) {
      lane.waterMap.offset.x -= lane.dir * Math.max(lane.speed, 0.4) * dt * 0.5;
      waterK = Math.max(waterK, k * k);
    }
    updateHazards(lane, dt);
    if (Math.abs(lane.row - P.row) < 14) {
      NPC.updatePeople(lane, dt, { x: P.x, row: P.row, alive: P.alive && state !== 'menu' && !P.fly, hop: !!P.hop }, time, (p) => {
        burst(p.x, 1.0, -lane.row + p.z, [0xffffff, 0xbff8ff], 6, 1.5);
        sfx.photo();
      }, (p) => {
        // high five: three bonus tokens
        coins += 3;
        store.set('coins', coins);
        hud();
        burst((p.x + P.x) / 2, 1.0, -lane.row, [0xffe066, 0xf2b31b, 0xffffff], 14, 3);
        sfx.clap();
        haptic('success');
        toast('ДАЙ ПЯТЬ! +3');
      });
    }

    for (const c of lane.coins) {
      c.mesh.rotation.y += dt * 3;
      c.mesh.position.y = 0.45 + Math.sin(time * 3 + (c.x ?? c.off)) * 0.06;
    }
  }
  // one level-crossing bell for whichever crossing is the loudest
  trainSfx.bell -= dt;
  if (bellK > 0 && trainSfx.bell <= 0) {
    trainSfx.side = -trainSfx.side;
    sfx.crossingBell(bellK, trainSfx.side);
    trainSfx.bell = 0.45;
  }
  sfx.hum('patrol', hum.patrol, hum.patrolPan);
  sfx.hum('water', waterK, 0);
  sfx.hum('scanner', hum.scanner, hum.scannerPan);
}

// ---------------------------------------------------------------- threat indicators at the screen edges
// An arrow appears on the side a vehicle / train comes from, at the height of its lane,
// growing and blinking faster as it gets closer.
const warnEls = [];
const warnV = new THREE.Vector3();
const WARN_RANGE = 9;

function warnEl(i) {
  if (!warnEls[i]) {
    const el = document.createElement('div');
    el.innerHTML = '<span><i></i></span>';
    $('warns').appendChild(el);
    warnEls[i] = el;
  }
  return warnEls[i];
}

function laneThreat(lane) {
  if (isRoad(lane.type)) {
    const edge = -lane.dir * (HALF + 0.5);
    let k = 0;
    for (const v of lane.movers) {
      const dist = (edge - (v.x + lane.dir * v.len / 2)) * lane.dir;
      if (dist > -0.5 && dist < WARN_RANGE) k = Math.max(k, 1 - Math.max(0, dist) / WARN_RANGE);
    }
    return [k, lane.type === 'hover' ? 'hover' : 'car'];
  }
  if (lane.type === 'rail') {
    const tr = lane.train;
    if (!tr.active && tr.timer < 2.2) return [1 - tr.timer / 2.2, 'train'];
    if (tr.active && (tr.x - P.x) * lane.dir < 0) return [1, 'train'];
  }
  return [0];
}

function updateWarnings() {
  let n = 0;
  if (state === 'play' && P.alive) {
    camera.updateMatrixWorld();
    const h = phone.clientHeight;
    for (let row = P.row; row <= P.row + 4; row++) {
      const lane = lanes.get(row);
      if (!lane) continue;
      const [k, kind] = laneThreat(lane);
      if (!(k > 0.05)) continue;
      const side = lane.dir > 0 ? 'left' : 'right';
      warnV.set(-lane.dir * (HALF + 0.5), 0.4, -row).project(camera);
      const el = warnEl(n++);
      el.className = `warn ${side} ${kind}${k > 0.6 ? ' hot' : ''}`;
      el.style.top = `${clamp((1 - warnV.y) / 2 * h, 120, h - 70)}px`;
      el.style.opacity = (0.45 + 0.55 * k).toFixed(2);
      el.style.setProperty('--s', (0.85 + 0.2 * k).toFixed(2));
      el.style.display = 'block';
    }
  }
  for (let i = n; i < warnEls.length; i++) warnEls[i].style.display = 'none';
}

// ---------------------------------------------------------------- flying traffic (decoration)
const skyCars = [];

function placeSkyCar(c, ahead) {
  c.dir = Math.random() < 0.5 ? 1 : -1;
  c.speed = rand(3, 6);
  c.mesh.rotation.y = c.dir > 0 ? 0 : Math.PI;
  c.mesh.position.set(-c.dir * rand(14, 22), rand(7, 12), -(camRow + ahead));
}

function updateSkyCars(dt) {
  if (!skyCars.length) {
    for (let i = 0; i < 5; i++) {
      const mesh = M.makeSkyCar();
      mesh.traverse((o) => { o.castShadow = false; });
      scene.add(mesh);
      const c = { mesh };
      placeSkyCar(c, rand(10, 40));
      skyCars.push(c);
    }
  }
  for (const c of skyCars) {
    c.mesh.position.x += c.dir * c.speed * dt;
    c.mesh.position.y += Math.sin(time * 2 + c.speed) * 0.003;
    const behind = -c.mesh.position.z < camRow + 4;
    if (c.mesh.position.x * c.dir > 24 || behind) placeSkyCar(c, rand(14, 40));
  }
}

// ---------------------------------------------------------------- player
const robot = M.makeRobot();
scene.add(robot.root);
G.applyLook(robot, null, onRobotRebuilt);
const P = {};
let stepSign = 1;

function resetPlayer() {
  Object.assign(P, {
    x: 0, z: 0, row: 0, alive: true,
    hop: null, queued: null,
    plat: null, platOff: 0,
    face: Math.PI, faceTarget: Math.PI,
    jet: null, fly: null, shield: 0, guard: null,
  });
  jetPack.visible = false;
  updateJetHud();
  robot.root.position.set(0, 0, 0);
  robot.root.rotation.set(0, Math.PI, 0);
  robot.root.scale.set(1, 1, 1);
  robot.root.visible = true;
  robot.body.scale.set(1, 1, 1);
}

const DIRS = { up: [0, 1, 0], down: [0, -1, Math.PI], left: [-1, 0, Math.PI / 2], right: [1, 0, -Math.PI / 2] };

function tryMove(dir) {
  if (paused) return;
  if (state === 'menu') {
    // taps start the run only from the main menu, never through an open garage / leaderboard
    const sheetOpen = !$('garage').classList.contains('hidden') || !$('leaders').classList.contains('hidden');
    if (dir === 'up' && !sheetOpen) playPressed();
    return;
  }
  if (state !== 'play' || !P.alive) return;
  if (P.fly) { if (dir === 'left' || dir === 'right') P.fly.tx = clamp(P.fly.tx + (dir === 'left' ? -1 : 1), -HALF, HALF); return; }
  if (P.hop) { P.queued = dir; return; }
  const [dx, dr, face] = DIRS[dir];
  P.faceTarget = face;
  const toRow = P.row + dr;
  const toLane = lanes.get(toRow);
  if (!toLane) return;

  const hop = { t: 0, fromX: P.x, fromZ: P.z, toZ: -toRow, side: false };
  if (dr === 0 && P.plat) {
    // Sidestep along the pad; landing is checked against the pad edges.
    Object.assign(hop, { side: true, plat: P.plat, fromOff: P.platOff, toOff: P.platOff + dx });
  } else {
    let toX = dr === 0 ? Math.round(P.x) + dx : Math.round(P.x);
    if (isFloat(toLane.type) && dr !== 0) toX = P.x;
    if (Math.abs(toX) > HALF + 0.01) return;
    if (toLane.blocked.has(Math.round(toX))) { P.bumpT = 0.25; sfx.bump(); return; }
    hop.toX = toX;
    P.plat = null;
  }
  P.hop = hop;
  P.idle = 0;
  P.row = toRow;
  stepSign = -stepSign;
  sfx.hop();
  haptic('light');
}

function land() {
  const h = P.hop;
  P.hop = null;
  P.z = h.toZ;
  const lane = lanes.get(P.row);

  // Attach to whatever floats under x (boats/buoys/pads); the visible hull counts, not just its cells.
  const board = (x, skip) => {
    const pad = lane.movers.find((p) => p !== skip && Math.abs(x - p.x) <= p.len / 2 + 0.45);
    if (!pad) return false;
    const i = clamp(Math.round(x - pad.x + pad.len / 2 - 0.5), 0, pad.len - 1);
    P.plat = pad;
    P.platOff = i - pad.len / 2 + 0.5;
    P.x = pad.x + P.platOff;
    return true;
  };
  const fall = () => die(lane.type === 'water' ? 'water' : 'splash');

  if (h.side) {
    const half = h.plat.len / 2 - 0.5;
    P.platOff = h.toOff;
    P.x = h.plat.x + P.platOff;
    // stepped off this one: fine if a neighbouring boat/buoy is right there
    if (Math.abs(P.platOff) > half + 0.01 && !board(P.x, h.plat)) return fall();
  } else {
    P.x = h.toX;
    if (isFloat(lane.type) && !board(P.x)) return fall();
  }

  const surface = { safe: lane.info.style === 'park' ? 'grass' : 'stone', road: 'road', hover: 'road', gap: 'pad', water: 'boat' }[lane.type] ?? 'metal';
  sfx.land(surface);
  if (lane.type === 'road' && Math.abs(P.x - lane.info.cw) <= 1.2) sfx.crossing(lane.district.id === 'tokyo');

  const ci = lane.coins.findIndex((c) => (c.boat ? c.boat === P.plat && Math.abs(c.off - P.platOff) < 0.1 : c.x === Math.round(P.x) && !P.plat));
  if (ci >= 0) {
    const c = lane.coins[ci];
    c.mesh.parent?.remove(c.mesh);
    lane.coins.splice(ci, 1);
    coins++;
    store.set('coins', coins);
    burst(P.x, 0.5, P.z, [0xffe066, 0xf2b31b], 8, 3);
    sfx.coin();
    haptic('select');
  }

  if (P.row > score) score = P.row;
  hud();
  if (P.jet && P.jet.charge < 1) { P.jet.charge = Math.min(1, P.jet.charge + 1 / JET_STEPS); updateJetHud(); }
  if (P.guard && P.guard.charge < 1) { P.guard.charge = Math.min(1, P.guard.charge + 1 / SHIELD_STEPS); updateJetHud(); }
  if (lane.info.center && !lane.used && state === 'play') { lane.used = true; enterStation(lane.info.center); return; }
  if (lane.type === 'safe') saveRun();
  const D = districtAt(P.row);
  if (D !== district) {
    district = D;
    env.setDistrict(D);
    toast(D.name);
    sfx.district();
  }

  if (P.queued) {
    const q = P.queued;
    P.queued = null;
    tryMove(q);
  }
}

// One walking step (t = 0..1): the swing leg lifts, bends at the knee and reaches forward while
// the stance leg pushes back; arms swing the other way, the body bobs a little.
// Dog trot: diagonal pairs move together. The pair in the air swings forward with the knee
// folding up, the other pair pushes back; the body bobs and the head nods.
function dogStep(t) {
  const [lL, lR] = robot.legs, [aL, aR] = robot.arms;
  const reach = Math.sin(t * Math.PI);
  const swing = stepSign > 0 ? [aL, lR] : [aR, lL];
  const stance = stepSign > 0 ? [aR, lL] : [aL, lR];
  for (const l of swing) {
    l.rotation.set(-0.3 + t * 0.65, 0, 0);
    l.userData.knee.rotation.x = reach * 0.75;
  }
  for (const l of stance) {
    l.rotation.set(0.3 - t * 0.6, 0, 0);
    l.userData.knee.rotation.x = reach * 0.1;
  }
  robot.model.rotation.x = Math.sin(t * Math.PI * 2) * 0.04;
  robot.model.rotation.z = 0;
  robot.model.position.y = reach * 0.03;
  robot.head.rotation.set(-reach * 0.12, 0, 0);
}

// Dog standing: breathing through the knees, a look around, then a head tilt and a paw tap.
// On a boat or pad it widens its stance.
function dogIdle() {
  const [lL, lR] = robot.legs, [aL, aR] = robot.arms;
  const idle = P.idle ?? 0;
  const breathe = Math.sin(time * 2.6) * 0.5 + 0.5;
  const riding = !!P.plat;
  robot.model.position.y = -breathe * 0.012;
  robot.model.rotation.x = 0;
  robot.model.rotation.z = riding ? Math.sin(time * 2.2) * 0.05 : 0;
  const spread = riding ? 0.16 : 0;
  for (const [l, s] of [[aL, -1], [aR, 1], [lL, -1], [lR, 1]]) {
    l.rotation.set(0, 0, s * spread);
    l.userData.knee.rotation.x = breathe * 0.08;
  }
  if (idle > 2.5) {
    const tap = Math.max(0, Math.sin(time * 7));
    aR.rotation.x = tap * 0.35;
    aR.userData.knee.rotation.x = tap * 0.6;
  }
  robot.head.rotation.set(
    Math.sin(time * 1.1) * 0.04,
    idle > 1.2 ? Math.sin((idle - 1.2) * 1.4) * 0.45 : 0,
    idle > 3.5 ? Math.sin((idle - 3.5) * 0.8) * 0.25 : 0,
  );
}

// Dog flying: front paws tucked back, hind legs stretched out behind, thrusters under the paws.
function dogFly(level) {
  const [lL, lR] = robot.legs, [aL, aR] = robot.arms;
  const flap = Math.sin(time * 5) * 0.06;
  for (const l of [aL, aR]) { l.rotation.set(-0.7 * level + flap, 0, 0); l.userData.knee.rotation.x = 0.9 * level; }
  for (const l of [lL, lR]) { l.rotation.set(-1.0 * level - flap, 0, 0); l.userData.knee.rotation.x = -0.6 * level; }
  robot.model.rotation.x = 0.1 * level;
  robot.model.position.set(0, 0.06 * level, 0);
  robot.head.rotation.set(-0.15 * level, 0, 0);
}

function posePlayer(a, t = 0) {
  if (robot.kind === 'dog') return dogStep(t);
  const [lL, lR] = robot.legs, [aL, aR] = robot.arms;
  const swing = stepSign > 0 ? lR : lL;
  const stance = stepSign > 0 ? lL : lR;
  const reach = Math.sin(t * Math.PI);                 // 0 -> 1 -> 0
  const fwd = -0.35 + t * 0.85;                         // swing leg travels from behind to in front
  if (swing) {
    swing.rotation.set(fwd * (0.4 + reach * 0.6), 0, 0);
    swing.userData.knee && (swing.userData.knee.rotation.x = -reach * 1.1);
  }
  if (stance) {
    stance.rotation.set(0.3 - t * 0.65, 0, 0);
    stance.userData.knee && (stance.userData.knee.rotation.x = -0.15 * reach);
  }
  const armSwing = (t - 0.5) * 1.1;
  const swingArm = stepSign > 0 ? aL : aR, otherArm = stepSign > 0 ? aR : aL;
  if (swingArm) swingArm.rotation.set(armSwing, 0, stepSign > 0 ? -0.08 : 0.08);
  if (otherArm) otherArm.rotation.set(-armSwing, 0, stepSign > 0 ? 0.08 : -0.08);
  robot.model.rotation.x = -0.12 * reach;            // lean into the step
  robot.model.rotation.z = 0;
  robot.head.rotation.x = 0.06 * reach;
  robot.head.rotation.y = 0;
}

// Standing still: breathing, a little arm sway; after a while it looks around and taps a foot.
// On a boat or pad it balances with the arms out.
function idlePose(dt) {
  if (robot.kind === 'dog') return dogIdle();
  const [lL, lR] = robot.legs, [aL, aR] = robot.arms;
  const idle = P.idle ?? 0;
  const breathe = Math.sin(time * 2.4);
  const riding = !!P.plat;
  robot.model.rotation.x = 0;
  robot.model.rotation.z = riding ? Math.sin(time * 2.2) * 0.06 : 0;
  for (const l of [lL, lR]) if (l?.userData.knee) l.userData.knee.rotation.x *= 0.6; // knees settle
  if (lL) { lL.rotation.set(0, 0, 0); }
  if (lR) { lR.rotation.set(idle > 2.5 ? Math.max(0, Math.sin(time * 9)) * -0.25 : 0, 0, 0); }
  const out = riding ? 0.55 + Math.sin(time * 2.2) * 0.12 : 0.04 + breathe * 0.03;
  if (aL) { aL.rotation.set(Math.sin(time * 1.3) * 0.06, 0, -out); }
  if (aR) { aR.rotation.set(-Math.sin(time * 1.3) * 0.06, 0, out); }
  robot.head.rotation.x = 0;
  robot.head.rotation.y = idle > 1.5 ? Math.sin((idle - 1.5) * 1.6) * 0.5 : 0;
}

function menuIdle() {
  // the dog turns its side to us, so its long body reads
  P.faceTarget = Math.PI * (robot.kind === 'dog' ? 0.68 : 0.86);
  const t = time % 5;
  const wave = t > 3.2 && t < 4.6 ? Math.sin(((t - 3.2) / 1.4) * Math.PI) : 0;
  if (robot.arms[1] && robot.kind === 'dog') {
    // the dog gives a paw instead of waving
    robot.arms[1].rotation.set(-wave * 1.1 + wave * Math.sin(time * 14) * 0.12, 0, 0);
  } else if (robot.arms[1]) {
    robot.arms[1].rotation.z = wave * 2.5;
    robot.arms[1].rotation.x = 0;
    robot.arms[1].rotation.y = wave * Math.sin(time * 14) * 0.25;
  }
  robot.head.rotation.y = Math.sin(time * 0.7) * 0.35;
}

function updatePlayer(dt) {
  if (!P.alive) return;
  const pos = robot.root.position;
  P.shield = Math.max(0, (P.shield ?? 0) - dt);
  if (P.fly) { updateFly(dt); return; }
  if (P.hop) {
    const h = P.hop;
    h.t = Math.min(1, h.t + dt / HOP_TIME);
    P.x = h.side ? h.plat.x + lerp(h.fromOff, h.toOff, h.t) : lerp(h.fromX, h.toX, h.t);
    P.z = lerp(h.fromZ, h.toZ, h.t);
    const arc = Math.sin(Math.PI * h.t);
    // a step, not a jump: the body only bobs; on boats/pads a small hop is still needed
    const lift = isFloat(lanes.get(P.row)?.type) || h.side ? 0.3 : 0.16;
    pos.set(P.x, arc * lift, P.z);
    robot.body.scale.set(1, 1 + arc * 0.04, 1);
    robot.body.position.y = 0;
    posePlayer(arc, h.t);
    if (h.t >= 1) { land(); P.landT = 0.12; }
  } else {
    if (P.plat) {
      P.x = P.plat.x + P.platOff;
      if (Math.abs(P.x) > HALF + 0.7) return die('drift');
    }
    // springy landing, then breathing
    P.landT = Math.max(0, (P.landT ?? 0) - dt);
    const land = P.landT / 0.16;
    const squash = Math.sin(land * Math.PI) * 0.07;
    pos.set(P.x, 0, P.z);
    robot.body.scale.set(1 + squash * 0.5, 1 - squash + Math.sin(time * 2.4) * 0.008, 1 + squash * 0.5);
    robot.body.position.y = 0;
    idlePose(dt);
    if (state === 'menu') menuIdle();
  }
  // bumping into an obstacle: a short shudder
  if (P.bumpT > 0) {
    P.bumpT -= dt;
    robot.model.rotation.z = Math.sin(P.bumpT * 60) * 0.06 * (P.bumpT / 0.25);
  }
  const blink = time % 3.4 < 0.12 ? 0.15 : 1;
  for (const e of robot.eyes) e.scale.y = blink;
  const d = ((P.faceTarget - P.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  P.face += d * Math.min(1, dt * 22);
  robot.root.rotation.y = P.face;
}

function checkHits() {
  if (!P.alive || state !== 'play' || P.fly || P.shield > 0) return;
  const { x, z } = robot.root.position;
  const lane = lanes.get(Math.round(-z));
  if (!lane) return;
  if (isRoad(lane.type)) {
    for (const v of lane.movers) if (Math.abs(v.x - x) < v.len / 2 + 0.28) return die('car');
  } else if (lane.type === 'rail' && lane.train.active) {
    if (Math.abs(lane.train.x - x) < lane.train.len / 2 + 0.3) return die('train', lane.dir);
  } else if (lane.type === 'laser') {
    if (lane.laser.phase === 'on') return die('laser');
  } else if (lane.type === 'scan') {
    for (const sc of lane.scanners) if (Math.abs(sc.x - x) < 0.42) return die('scan');
  }
  if (lane.patrol && Math.abs(lane.patrol.x - x) < 0.5) return die(lane.patrol.mower ? 'mower' : 'patrol');
  if (lane.crane && Math.abs(lane.crane.hitX - x) < 0.75) return die('crane', Math.sign(Math.cos(lane.crane.ph)) || 1);
  for (const t of lane.tiles) {
    if (t.phase === 'on' && !P.hop && Math.abs(x - t.x) < 0.45) return die('shock');
  }
}

// ---------------------------------------------------------------- flight center & jetpack
// Stepping onto a flight center row opens the wind-tunnel training; passing it gives a jetpack
// for the rest of this run. It recharges by steps; when full, the robot flies over the street
// like the Subway Surfers jetpack: swipe between lanes, grab a few tokens, land safely.
// Balance: ~8 s of flight (about 35 rows), then 80 steps on foot to recharge.
const JET_STEPS = 80;
const JET_TIME = 8;
const JET_SPEED = 4.2; // rows per second while cruising
const JET_ROWS = Math.round(JET_TIME * JET_SPEED);
const FLY_Y = 7.2;  // above the traffic and the monorail viaducts

// faint bubble around the robot while the shield is charged
const shieldBubble = new THREE.Mesh(new THREE.SphereGeometry(0.62, 16, 12), new THREE.MeshBasicMaterial({
  color: 0x6dffb0, transparent: true, opacity: 0.13, depthWrite: false, blending: THREE.AdditiveBlending,
}));
shieldBubble.position.y = 0.62;
shieldBubble.visible = false;
robot.root.add(shieldBubble);
const SHIELD_STEPS = 250;
// what the shield can take: hits, not falls or the security drone
const SHIELDED = new Set(['car', 'train', 'laser', 'scan', 'shock', 'beam', 'crane', 'mower', 'patrol']);

const jetPack = M.makeJetpack();
jetPack.position.set(0, 0.95, 0.17);
jetPack.visible = false;
robot.model.add(jetPack);

// palm and boot thrusters (Iron Man style), hidden until flying; re-attached when the garage
// swaps the robot's body
const thrusters = [];
function attachThrusters() {
  for (const f of thrusters) f.parent?.remove(f);
  thrusters.length = 0;
  if (robot.kind === 'dog') {
    // the dog has a thruster under each paw
    for (const leg of [...robot.arms, ...robot.legs]) {
      for (const [w, c, h] of [[0.09, 0xffa21a, 0.22], [0.045, 0xfff1a8, 0.16]]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshBasicMaterial({ color: c }));
        f.position.set(0, -0.06 - h / 2, 0);
        f.visible = false;
        leg.userData.foot.add(f);
        thrusters.push(f);
      }
    }
    return;
  }
  for (const arm of robot.arms) {
    for (const [w, c, y] of [[0.09, 0x9ff3ff, -0.56], [0.05, 0xffffff, -0.54]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, w), new THREE.MeshBasicMaterial({ color: c }));
      f.position.set(arm.position.x > 0 ? 0.035 : -0.035, y, 0);
      f.visible = false;
      arm.add(f);
      thrusters.push(f);
    }
  }
  for (const leg of robot.legs) {
    const knee = leg.userData.knee;
    for (const [w, c, y] of [[0.1, 0xffa21a, -0.58], [0.05, 0xfff1a8, -0.55]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, 0.24, w), new THREE.MeshBasicMaterial({ color: c }));
      f.position.set(0, y, 0);
      f.visible = false;
      knee.add(f);
      thrusters.push(f);
    }
  }
}
attachThrusters();
function onRobotRebuilt() {
  robot.model.position.set(0, 0, 0);
  robot.model.rotation.set(0, 0, 0);
  attachThrusters();
  placeJetpack();
}
// on the humanoids' backs; on the dog's spine, nozzles pointing down
// a back item (backpack, battery, ...) pushes the jetpack outwards so they do not overlap
function placeJetpack() {
  const depth = robot.backDepth ?? 0;
  if (robot.kind === 'dog') jetPack.position.set(0, 0.84 + depth, 0.08);
  else jetPack.position.set(0, 0.95, 0.17 + depth);
}

// Ability buttons stack in a column at the bottom right; each ring fills as it recharges.
function updateJetHud() {
  const jet = $('jetbtn'), sh = $('shieldbtn');
  jet.classList.toggle('hidden', !P.jet);
  if (P.jet) {
    jet.style.setProperty('--c', `${Math.round(P.jet.charge * 360)}deg`);
    jet.classList.toggle('ready', P.jet.charge >= 1 && !P.fly);
  }
  sh.classList.toggle('hidden', !P.guard);
  if (P.guard) {
    sh.style.setProperty('--c', `${Math.round(P.guard.charge * 360)}deg`);
    sh.classList.toggle('ready', P.guard.charge >= 1);
  }
  shieldBubble.visible = !!P.guard && P.guard.charge >= 1;
}

async function enterStation(kind) {
  sfx.center();
  const has = kind === 'flight' ? P.jet : P.guard;
  if (has) {
    // already trained in this run: just refill
    has.charge = 1;
    updateJetHud();
    toast(kind === 'flight' ? 'ДЖЕТПАК ЗАПРАВЛЕН' : 'ЩИТ ЗАРЯЖЕН');
    saveRun();
    return;
  }
  state = 'mini';
  // the task starts fresh: the security drone leaves and the street hums go quiet
  if (hunter) { scene.remove(hunter.mesh); hunter = null; }
  $('danger').style.opacity = 0;
  for (const h of ['patrol', 'scanner', 'water', 'hunter', 'jet']) sfx.hum(h, 0, 0);
  document.body.classList.add('in-mini');
  const ok = await (kind === 'flight' ? wiresGame : shieldGame)(phone);
  document.body.classList.remove('in-mini');
  state = 'play';
  P.idle = 0;
  last = performance.now();
  if (ok && kind === 'flight') {
    P.jet = { charge: 1 };
    jetPack.visible = true;
    toast('НАВЫК: ДЖЕТПАК');
  } else if (ok) {
    P.guard = { charge: 1 };
    toast('НАВЫК: ЭНЕРГОЩИТ');
  }
  if (ok) haptic('success');
  updateJetHud();
  saveRun();
}

function useJet() {
  if (state !== 'play' || !P.alive || P.hop || P.fly || paused || !P.jet || P.jet.charge < 1) return;
  P.jet.charge = 0;
  P.plat = null;
  P.faceTarget = 0;
  const F = { phase: 'up', t: 0, rowF: P.row, start: P.row, x: P.x, tx: Math.round(P.x), y: 0, items: [], land: null };
  // only a few tokens in the air: three short lines of three, each in some lane
  for (let r = P.row + randInt(6, 9); r < P.row + JET_ROWS - 3; r += randInt(9, 12)) {
    const lane = randInt(-2, 2);
    for (let i = 0; i < 3; i++) {
      const mesh = M.makeCoin();
      mesh.position.set(lane, FLY_Y + 0.35, -(r + i));
      scene.add(mesh);
      F.items.push({ x: lane, z: -(r + i), mesh });
    }
  }
  P.fly = F;
  updateJetHud();
  sfx.jetStart();
  haptic('medium');
  for (const f of jetPack.userData.flames) f.visible = true;
}

// first sidewalk at or after `row`, and the free cell nearest to x
function findLanding(row, x) {
  ensureLanes(row + 20);
  for (let r = row; r < row + 20; r++) {
    const lane = lanes.get(r);
    if (!lane || lane.type !== 'safe') continue;
    const free = freeCells(lane);
    if (!free.length) continue;
    return { row: r, x: free.sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0] };
  }
  return { row, x: 0 };
}

function updateFly(dt) {
  const F = P.fly;
  const pos = robot.root.position;
  F.t += dt;
  if (F.phase === 'up') {
    // blast off over the traffic
    F.y += (FLY_Y + 0.2 - F.y) * Math.min(1, dt * 4);
    F.rowF += JET_SPEED * 0.6 * dt;
    if (F.y > FLY_Y - 0.3) { F.phase = 'cruise'; F.cruiseT = 0; }
  } else if (F.phase === 'cruise') {
    F.cruiseT += dt;
    F.y += (FLY_Y - F.y) * Math.min(1, dt * 4) + Math.sin(time * 3) * 0.004;
    F.rowF += JET_SPEED * dt;
    // the button ring drains while flying
    $('jetbtn').style.setProperty('--c', `${Math.round(Math.max(0, 1 - F.cruiseT / JET_TIME) * 360)}deg`);
    if (F.cruiseT >= JET_TIME) { F.phase = 'land'; F.land = findLanding(Math.ceil(F.rowF) + 3, F.tx); F.tx = F.land.x; F.y0 = F.y; F.r0 = F.rowF; }
  } else {
    // glide down onto the landing sidewalk
    const total = Math.max(0.5, F.land.row - F.r0);
    F.rowF = Math.min(F.land.row, F.rowF + JET_SPEED * 0.8 * dt);
    const k = Math.min(1, (F.rowF - F.r0) / total);
    F.y = F.y0 * (1 - k * k * (3 - 2 * k));
    if (k >= 1 && Math.abs(F.x - F.tx) < 0.05) { F.y = 0; return endFlight(); }
  }
  // lane change: quick slide with a bank, like a swipe in Subway Surfers
  F.x += (F.tx - F.x) * Math.min(1, dt * 12);
  P.x = F.x;
  P.z = -F.rowF;
  P.row = Math.round(F.rowF);
  // the distance counter keeps ticking up row by row while flying
  if (P.row > score) { score = P.row; hud(); }
  pos.set(F.x, F.y, P.z);

  const rz = pos.z;
  for (const it of F.items) {
    if (it.done) continue;
    it.mesh.rotation.y += dt * 4;
    if (Math.abs(it.z - rz) < 0.5 && Math.abs(it.x - F.x) < 0.5 && F.y > FLY_Y * 0.6) {
      it.done = true;
      scene.remove(it.mesh);
      coins++;
      store.set('coins', coins);
      sfx.coin();
      hud();
    } else if (it.z > rz + 0.6) {
      it.done = true;
      scene.remove(it.mesh);
    }
  }

  // Iron Man pose: body flat, head first, arms along the body with palm thrusters,
  // legs together with boot thrusters; banks into turns
  const level = F.phase === 'land' ? Math.max(0, Math.min(1, F.y / FLY_Y)) : Math.min(1, F.t / 0.45);
  const [lL, lR] = robot.legs, [aL, aR] = robot.arms;
  // Iron Man pose; the dog is level already, it only tucks its legs in
  const flat = robot.kind === 'dog' ? 0 : level;
  robot.model.rotation.x = -1.3 * flat;
  robot.model.position.set(0, 0.35 * flat, 0.15 * flat);
  robot.root.rotation.z = (F.tx - F.x) * -0.45;
  if (lL) { lL.rotation.set(0.05 * level, 0, -0.03); lL.userData.knee && (lL.userData.knee.rotation.x = -0.1 * level); }
  if (lR) { lR.rotation.set(0.05 * level, 0, 0.03); lR.userData.knee && (lR.userData.knee.rotation.x = -0.15 * level); }
  if (aL) aL.rotation.set(0.15 * level, 0, -0.22 * level);
  if (aR) aR.rotation.set(0.15 * level, 0, 0.22 * level);
  robot.head.rotation.set(1.0 * flat, 0, 0);
  if (robot.kind === 'dog') dogFly(level);
  robot.body.scale.set(1, 1, 1);
  for (const f of jetPack.userData.flames) f.scale.y = 0.7 + Math.random() * 0.6;
  for (const f of thrusters) { f.visible = true; f.scale.y = 0.6 + Math.random() * 0.7; }
  if (Math.random() < 0.35) burst(F.x + rand(-0.15, 0.15), F.y + 0.3, rz + 0.35, [0xffa21a, 0xfff1a8, 0x9ff3ff], 1, 0.4);
  if (F.phase === 'cruise' && Math.random() < 0.6) streak(F.x + rand(-3, 3), F.y + rand(-1.5, 1.5), rz - rand(4, 9));
  sfx.hum('jet', F.phase === 'land' ? 0.4 : 1, 0);
  const d = ((P.faceTarget - P.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  P.face += d * Math.min(1, dt * 22);
  robot.root.rotation.y = P.face;
}

const streaks = [];
const STREAK = new THREE.MeshBasicMaterial({ color: 0xe8f4ff, transparent: true, opacity: 0.45, depthWrite: false });
const STREAK_GEO = new THREE.BoxGeometry(0.025, 0.025, 1.4);
function streak(x, y, z) {
  const m = new THREE.Mesh(STREAK_GEO, STREAK);
  m.position.set(x, y, z);
  scene.add(m);
  streaks.push({ m, life: 0.45 });
}
function updateStreaks(dt) {
  for (let i = streaks.length - 1; i >= 0; i--) {
    const s = streaks[i];
    s.life -= dt;
    s.m.position.z += dt * 22;
    if (s.life <= 0) { scene.remove(s.m); streaks.splice(i, 1); }
  }
}

function endFlight() {
  const F = P.fly;
  for (const it of F.items) if (!it.done) scene.remove(it.mesh);
  P.fly = null;
  robot.model.position.set(0, 0, 0);
  robot.root.rotation.z = 0;
  for (const f of thrusters) f.visible = false;
  P.row = F.land.row;
  P.x = F.land.x;
  P.z = -F.land.row;
  P.plat = null;
  P.shield = 1.5; // a moment of safety after landing, as in Subway Surfers
  P.landT = 0.16;
  P.idle = 0;
  robot.root.position.set(P.x, 0, P.z);
  robot.model.rotation.set(0, 0, 0);
  for (const f of jetPack.userData.flames) f.visible = false;
  sfx.hum('jet', 0, 0);
  sfx.jetLand();
  burst(P.x, 0.1, P.z, [0xc8b898, 0xffffff], 10, 2);
  if (P.row > score) score = P.row;
  hud();
  updateJetHud();
  saveRun();
}

// ---------------------------------------------------------------- death & effects
let death = null;
let drone = null;
const particles = [];

function burst(x, y, z, colors, n, speed) {
  for (let i = 0; i < n; i++) {
    const mesh = M.box(scene, 0.1, 0.1, 0.1, pick(colors), x, y, z, true);
    particles.push({
      mesh, life: rand(0.5, 0.9),
      v: new THREE.Vector3(rand(-1, 1) * speed, rand(0.5, 1.5) * speed, rand(-1, 1) * speed),
    });
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.v.y -= 12 * dt;
    p.mesh.position.addScaledVector(p.v, dt);
    p.mesh.scale.setScalar(Math.max(0.01, p.life * 1.5));
    if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
  }
}

function die(kind, dir = 1) {
  // nothing on the street can touch a robot flying over it
  if (!P.alive || window.rc?.god || P.fly) return;
  if (P.shield > 0 && SHIELDED.has(kind)) return;
  if (P.guard && P.guard.charge >= 1 && SHIELDED.has(kind)) {
    // the shield breaks instead of the robot; a moment of safety to get away
    P.guard.charge = 0;
    P.shield = 1.6;
    const pos = robot.root.position;
    burst(pos.x, 0.7, pos.z, [0x6dffb0, 0xffffff, 0x35e6ff], 22, 4);
    sfx.shock();
    haptic('heavy');
    toast('ЩИТ СПАС!');
    updateJetHud();
    return;
  }
  clearRun();
  P.alive = false;
  P.hop = null;
  P.queued = null;
  P.plat = null;
  state = 'dead';
  haptic('error');
  const pos = robot.root.position;
  death = { kind, t: 0, vx: dir * 14, vy: 8 };
  if (kind === 'car' || kind === 'beam' || kind === 'mower') {
    sfx.crash();
    pos.y = 0;
    robot.body.scale.set(1, 1, 1);
    robot.root.scale.set(1.3, 0.16, 1.3);
    burst(pos.x, 0.4, pos.z, [0xffffff, 0xf5c116, 0x35e6ff], 14, 4);
  } else if (kind === 'train' || kind === 'crane') {
    if (kind === 'crane') death.vx = dir * 6;
    sfx.crash();
    burst(pos.x, 0.6, pos.z, [0xffffff, 0xf5c116, 0x35e6ff], 14, 5);
  } else if (kind === 'water') {
    sfx.splash();
    burst(pos.x, -0.2, pos.z, [0xffffff, 0x9fd4ff, 0x3f8ef0], 22, 3.5);
  } else if (kind === 'splash' || kind === 'drift') {
    sfx.fall();
    burst(pos.x, 0, pos.z, [0x35e6ff, 0xff4fd8, 0xffffff], 16, 3.5);
  } else if (kind === 'drone' && hunter) {
    sfx.drone();
    drone = hunter.mesh;
    death.off = -0.6;              // claws close around the robot's head
    death.y0 = drone.position.y;
    hunter.grab = true;
  } else if (kind === 'drone' || kind === 'patrol') {
    if (kind === 'patrol') sfx.alarm(); else sfx.drone();
    drone = M.makeDrone();
    drone.position.set(pos.x, 9, pos.z);
    scene.add(drone);
  } else {
    // laser / scanner / shock: sparks and a short circuit
    if (kind === 'shock') sfx.shock(); else sfx.laserZap();
    sfx.powerDown(0.25);
    burst(pos.x, 0.6, pos.z, kind === 'shock' ? [0xbff8ff, 0x35e6ff, 0xffffff] : [0xff2b4a, 0xffd21f, 0xffffff], 18, 4);
  }
  sfx.death();
  NPC.scareAround(lanes, pos.x, P.row);
  setTimeout(showOver, kind === 'drone' || kind === 'patrol' ? 1700 : 1200);
}

function updateDeath(dt) {
  if (!death) return;
  death.t += dt;
  const pos = robot.root.position;
  switch (death.kind) {
    case 'train':
    case 'crane':
      pos.x += death.vx * dt;
      pos.y += death.vy * dt;
      death.vy -= 20 * dt;
      robot.root.rotation.z += 14 * dt;
      break;
    case 'water':
      pos.y -= dt * 1.2;
      robot.root.rotation.z += dt * 1.5;
      if (Math.random() < 0.3) burst(pos.x + rand(-0.2, 0.2), -0.3, pos.z, [0xffffff, 0x9fd4ff], 1, 0.8);
      if (pos.y < -1.2) robot.root.visible = false;
      break;
    case 'splash':
    case 'drift':
      pos.y -= dt * 3.5;
      robot.root.rotation.x += dt * 4;
      if (pos.y < -GAP_DEPTH) robot.root.visible = false;
      break;
    case 'laser':
    case 'scan':
    case 'shock':
      robot.root.visible = death.t > 0.6 || Math.floor(death.t * 20) % 2 === 0;
      if (death.t > 0.3) {
        robot.root.rotation.x = Math.max(-Math.PI / 2, robot.root.rotation.x - dt * 6);
        if (Math.random() < 0.2) burst(pos.x, 0.3, pos.z, [0x35e6ff, 0xffffff], 1, 2);
      }
      break;
    case 'drone':
    case 'patrol':
      {
        const off = death.off ?? 1.45;
        if (death.t < 0.6) {
          drone.position.y = lerp(death.y0 ?? 9, pos.y + off, death.t / 0.6);
          drone.position.x += (pos.x - drone.position.x) * Math.min(1, dt * 8);
          drone.position.z += (pos.z - drone.position.z) * Math.min(1, dt * 8);
        } else {
          drone.position.y += dt * 6;
          drone.position.x += dt * 2;
          pos.set(drone.position.x, drone.position.y - off, drone.position.z);
          if (drone.userData.spot) drone.userData.spot.visible = false;
        }
      }
      drone.rotation.y += dt * 2;
      break;
  }
}

// ---------------------------------------------------------------- security drone
// A big drone comes down over a robot that idles or lags behind the camera: red spotlight,
// red screen edges, siren. Running on sends it away; at full threat it grabs the robot.
let hunter = null;
let hunterWarned = false;

function makeHunter() {
  const mesh = M.makePatrol();
  mesh.scale.setScalar(1.8);
  const body = mesh.userData.body;
  for (const s of [-1, 1]) {
    const arm = M.box(body, 0.05, 0.36, 0.05, 0x55597a, s * 0.14, -0.32, 0);
    arm.rotation.z = s * 0.25;
    M.box(body, 0.12, 0.05, 0.05, 0x55597a, s * 0.1, -0.5, 0);
  }
  M.box(body, 0.6, 0.04, 0.46, 0xffd21f, 0, 0.06, 0, true);
  scene.add(mesh);
  return { mesh, level: 0, beep: 0, grab: false };
}

function updateHunter(dt, threat) {
  if (threat > 0 && !hunter) {
    hunter = makeHunter();
    hunter.mesh.position.set(robot.root.position.x, 5.5, robot.root.position.z - 5);
  }
  if (!hunter || hunter.grab) {
    if (!hunter) $('danger').style.opacity = 0;
    sfx.hum('hunter', 0, 0);
    return;
  }
  hunter.level += (threat - hunter.level) * Math.min(1, dt * 3);
  const lv = hunter.level;
  const pos = robot.root.position;
  const u = hunter.mesh.userData;
  // comes down in front of the robot (in view), then slides over it
  hunter.mesh.position.set(
    hunter.mesh.position.x + (pos.x - hunter.mesh.position.x) * Math.min(1, dt * 4),
    lerp(5.5, 1.9, lv),
    pos.z - lerp(5, 0.7, lv),
  );
  for (const r of u.rotors) r.rotation.y += dt * 50;
  u.head.rotation.y = Math.sin(time * 3) * 0.3;
  u.spot.visible = lv > 0.5;
  $('danger').style.opacity = (lv * (0.65 + 0.35 * Math.sin(time * 10))).toFixed(2);
  sfx.hum('hunter', lv, 0);

  hunter.beep -= dt;
  if (threat > 0 && hunter.beep <= 0) { sfx.alarm(); hunter.beep = lerp(1.0, 0.25, lv); }
  if (threat > 0.15 && !hunterWarned) { hunterWarned = true; toast('ДРОН-ОХРАННИК! БЕГИ!'); haptic('warning'); }
  if (threat === 0) hunterWarned = false;
  if (threat === 0 && lv < 0.02) {
    scene.remove(hunter.mesh);
    hunter = null;
    sfx.hum('hunter', 0, 0);
    $('danger').style.opacity = 0;
  }
}

// ---------------------------------------------------------------- camera
let camRow = 0, camX = 0;
const chasePos = new THREE.Vector3(), chaseLook = new THREE.Vector3();
const menuPos = new THREE.Vector3(), menuLook = new THREE.Vector3();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
let camInit = false;
let camLift = 0;
const flyPos = new THREE.Vector3(), flyLook = new THREE.Vector3();
let menuView = 'main';
// garage framing: robot height to fit (with a hat), its share of the screen height, and how far
// above the screen middle it stands (the shop sheet covers the lower 54 %)
const GARAGE_FIT = { height: 1.5, share: 0.28, shift: 0.23, fov: 50 };
let garageK = 0;
let introAt = 0;
const camTarget = new THREE.Vector3();

function updateCamera(dt) {
  const vis = -robot.root.position.z;
  // Waiting on a sidewalk for a gap in the traffic (or a boat) is part of the game: there the
  // camera does not push past the robot and the idle timer runs much slower.
  const ahead = lanes.get(P.row + 1)?.type;
  const waiting = state === 'play' && P.alive && !P.fly && lanes.get(P.row)?.type === 'safe' && WAIT_FOR.has(ahead);
  if (state === 'play') camRow += (0.28 + Math.min(score / 250, 0.5)) * dt;
  if (waiting) camRow = Math.min(camRow, vis + 0.3);
  if (P.alive && vis > camRow) camRow += (vis - camRow) * Math.min(1, dt * (P.fly ? 9 : 3));
  // after a death the camera comes back to the robot, so a grab by the drone is always seen
  if (state === 'dead' || state === 'over') camRow += (vis - camRow) * Math.min(1, dt * 2.5);
  // Standing still or falling behind the camera calls the security drone.
  if (state === 'play' && P.alive) P.idle = P.hop || P.fly ? 0 : (P.idle ?? 0) + dt * (waiting ? 0.5 : 1);
  const threat = state === 'play' && P.alive
    ? clamp(Math.max((camRow - vis - 1.2) / 1.8, ((P.idle ?? 0) - 4) / 3.5), 0, 1) : 0;
  // the drone only lives while the game runs: a frozen frame (pause) never moves or grabs
  if (!paused) {
    updateHunter(dt, threat);
    if (threat >= 1) die('drone');
  }
  camX += (clamp(P.x, -2, 2) * 0.5 - camX) * Math.min(1, dt * 3);

  const z = -camRow;
  chasePos.set(camX + CAM_SIDE, CAM_UP, z + CAM_BACK);
  chaseLook.set(camX * 0.6 - 0.4, 0, z - LOOK_AHEAD);
  // Jetpack: Subway Surfers style third-person view right behind the flying robot, wider FOV
  camLift += ((P.fly && (P.fly.phase !== 'land' || P.fly.y > 1.5) ? 1 : 0) - camLift) * Math.min(1, dt * (P.fly ? 4 : 2.5));
  if (camLift > 0.001) {
    const rp = robot.root.position;
    // further back and higher than before, so the trail ahead is visible
    flyPos.set(rp.x * 0.7, rp.y + 1.75, rp.z + 3.6);
    flyLook.set(rp.x * 0.6, rp.y - 0.35, rp.z - 8);
    chasePos.lerp(flyPos, camLift);
    chaseLook.lerp(flyLook, camLift);
  }
  // the garage uses its own narrow lens, so the robot is never stretched on tall screens
  garageK += ((state === 'menu' && menuView === 'garage' ? 1 : 0) - garageK) * Math.min(1, dt * 5);
  const flyFov = THREE.MathUtils.lerp(baseFov * (1 - 0.14 * camLift), GARAGE_FIT.fov, garageK);
  if (Math.abs(camera.fov - flyFov) > 0.05) {
    camera.fov = flyFov;
    camera.updateProjectionMatrix();
  }
  if (state === 'menu' || state === 'intro') {
    // menu: low camera behind the robot, which turns to face us, the street glowing beyond
    const rp = robot.root.position;
    const close = menuView === 'garage';
    // garage: the whole robot fits between the top bar and the shop sheet on any screen. The
    // distance comes from the FOV; the camera tilts down so the robot sits in the upper part.
    let want, look;
    if (state === 'intro') { want = chasePos; look = chaseLook; }
    else if (close) {
      const t = Math.tan(THREE.MathUtils.degToRad(GARAGE_FIT.fov / 2));
      const d = (robot.kind === 'dog' ? 1.05 : GARAGE_FIT.height) / (2 * GARAGE_FIT.share * t);
      const below = d * GARAGE_FIT.shift * 2 * t; // aim this far below the robot's middle
      const mid = robot.kind === 'dog' ? 0.45 : 0.62;
      want = menuPos.set(rp.x + d * 0.08, mid, rp.z + d);
      look = menuLook.set(rp.x, mid - below, rp.z);
    } else {
      want = menuPos.set(rp.x + 0.4, 0.95, rp.z + 2.3);
      look = menuLook.set(rp.x + 0.06, 0.5, rp.z);
    }
    const k = state === 'intro' ? Math.min(1, dt * 4.5) : Math.min(1, dt * 3);
    if (!camInit) { camPos.copy(want); camLook.copy(look); camInit = true; }
    camPos.lerp(want, k);
    camLook.lerp(look, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camTarget.copy(chaseLook);
    if (state === 'intro' && (camPos.distanceTo(chasePos) < 0.08 || time - introAt > 1.4)) startGame();
  } else {
    camera.position.copy(chasePos);
    camera.lookAt(chaseLook);
    camPos.copy(chasePos);
    camLook.copy(chaseLook);
    camTarget.copy(chaseLook);
  }
  sun.position.copy(camTarget).add(SUN_OFF);
  sun.target.position.copy(camTarget);

  const r = Math.floor(camRow);
  ensureLanes(r + 46);
  trimLanes(r - 6);
}

// ---------------------------------------------------------------- game state & UI
let state = 'menu';
let score = 0, best = 0, coins = 0;
let time = 0;
let district = DISTRICTS[0];

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}
env.onToast = (t) => { if (state === 'play') toast(t); };

function hud() {
  $('score').textContent = score;
  $('best').textContent = 'РЕКОРД ' + Math.max(best, score);
  $('coin-count').textContent = coins;
}

function playPressed() {
  if (state !== 'menu') return;
  if (tryOn) { tryOn = null; G.applyLook(robot, null, onRobotRebuilt); }
  state = 'intro';
  introAt = time;
  menuView = 'main';
  P.faceTarget = 0;
  if (robot.arms[1]) robot.arms[1].rotation.set(0, 0, 0);
  robot.head.rotation.y = 0;
  $('menu').classList.add('hidden');
  $('garage').classList.add('hidden');
  document.body.classList.remove('in-garage');
  $('leaders').classList.add('hidden');
  document.body.classList.remove('in-menu');
  sfx.start();
}

function startGame() {
  state = 'play';
  clearRun();
  $('menu').classList.add('hidden');
  document.body.classList.remove('in-menu');
}

function showOver() {
  state = 'over';
  const isNew = score > best;
  if (isNew) { best = score; store.set('best', best); }
  $('final-score').textContent = score;
  $('final-best').textContent = best;
  $('reason').innerHTML = REASONS[death?.kind] ?? '';
  $('new-best').classList.toggle('hidden', !isNew);
  $('over').classList.remove('hidden');
  if (isNew) { haptic('success'); sfx.newBest(); }
  // the score goes up first, then the board shows the top 3 and the player's own place
  const board = $('over-board');
  board.classList.toggle('hidden', !LB.enabled());
  if (LB.enabled()) {
    board.innerHTML = '<div class="b-head">ЛИДЕРЫ</div><div class="b-note">ЗАГРУЗКА...</div>';
    LB.submit(score).finally(() => renderOverBoard(board));
  }
  hud();
}

const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function renderOverBoard(board) {
  try {
    const data = await LB.load(3);
    if (state !== 'over') return;
    const rows = data.top.map((r, i) => `<div class="b-row p${i + 1}"><span class="b-rank">${i + 1}</span><span class="b-name">${escHtml(r.name)}</span><b>${r.score}</b></div>`).join('');
    const me = data.me
      ? `<div class="b-row me"><span class="b-rank">${data.me.rank}</span><span class="b-name">ТЫ</span><b>${data.me.score}</b></div>`
      : `<div class="b-note">Твоё место появится после игры в Telegram</div>`;
    board.innerHTML = `<div class="b-head">ЛИДЕРЫ</div>${rows || '<div class="b-note">Пока никого. Будь первым!</div>'}${me}`;
  } catch {
    board.innerHTML = '<div class="b-head">ЛИДЕРЫ</div><div class="b-note">Нет связи с сервером рекордов</div>';
  }
}

// Checkpoint: the last sidewalk the robot stood on (run seed + position + score + time of day).
function saveRun(cloud = false) {
  if (state !== 'play' || !P.alive || P.row <= 0 || window.rc?.god) return;
  const lane = lanes.get(P.row);
  if (lane && lane.type === 'safe' && !P.hop) checkpoint = { seed: runSeed, row: P.row, x: Math.round(P.x), score, phase: env.phase, jet: P.jet ? P.jet.charge : null, guard: P.guard ? P.guard.charge : null, t: Date.now() };
  if (!checkpoint) return;
  const data = JSON.stringify(checkpoint);
  store.set('run', data, cloud);
}
let checkpoint = null;
function clearRun() {
  checkpoint = null;
  store.set('run', '', true);
}

function newWorld(save = null) {
  trimLanes(Infinity);
  runSeed = save ? save.seed : (Math.random() * 2147483647) | 0;
  checkpoint = save;
  sfx.hum('hunter', 0, 0);
  resetGen();
  resetPlayer();
  for (const p of particles) scene.remove(p.mesh);
  particles.length = 0;
  if (drone) { scene.remove(drone); drone = null; }
  if (hunter) { scene.remove(hunter.mesh); hunter = null; }
  $('danger').style.opacity = 0;
  P.idle = 0;
  death = null;
  district = DISTRICTS[0];
  env.setDistrict(district);
  score = 0;
  camRow = 0;
  camX = 0;
  state = 'menu';
  $('over').classList.add('hidden');
  if (save) {
    // rebuild the same city around the saved sidewalk and wait on the pause screen
    const row = save.row;
    maxRow = row - 8;
    ensureLanes(row + 46);
    const lane = lanes.get(row);
    let x = clamp(save.x, -HALF, HALF);
    if (lane.blocked.has(x)) x = freeCells(lane).sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0] ?? 0;
    Object.assign(P, { row, z: -row, x, face: 0, faceTarget: 0 });
    if (save.jet != null) { P.jet = { charge: save.jet }; jetPack.visible = true; }
    if (save.guard != null) P.guard = { charge: save.guard };
    updateJetHud();
    if (lane.info.center) lane.used = true;
    robot.root.position.set(x, 0, -row);
    camRow = row;
    score = save.score;
    if (save.phase != null) env.phase = save.phase;
    district = districtAt(row);
    env.setDistrict(district);
    state = 'play';
    $('menu').classList.add('hidden');
    setPause(true, 'ПРОДОЛЖИТЬ ЗАБЕГ?');
  } else {
    ensureLanes(46);
    $('menu').classList.remove('hidden');
    document.body.classList.add('in-menu');
    menuView = 'main';
    camInit = false;
  }
  hud();
}

// ---------------------------------------------------------------- pause
let paused = false;
// The pause screen keeps music and ambience playing; only the world's own hums stop.
function setPause(on, title = 'ПАУЗА') {
  if (on && state !== 'play') return;
  paused = on;
  $('pause-title').textContent = title;
  $('pause').classList.toggle('hidden', !on);
  if (on) {
    for (const h of ['patrol', 'scanner', 'water', 'hunter']) sfx.hum(h, 0, 0);
    saveRun(true);
  }
  touch = null;
}
// Minimizing Telegram (or the browser tab) pauses the run and silences everything until it is back.
function appHidden(hidden) {
  if (window.rc?.god) return; // debug runs keep going in a hidden preview
  if (hidden) setPause(true);
  setAudioPaused(hidden);
}
document.addEventListener('visibilitychange', () => appHidden(document.hidden));
window.addEventListener('pagehide', () => appHidden(true));
window.addEventListener('pageshow', () => appHidden(false));
onAppHidden(appHidden);

// ---------------------------------------------------------------- input
let touch = null;
const SWIPE = 28;

function swipeDir(dx, dy) {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
  return dy < 0 ? 'up' : 'down';
}

window.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  if (e.target.closest?.('button')) return;
  touch = { x: e.clientX, y: e.clientY };
});
window.addEventListener('pointermove', (e) => {
  if (!touch) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  if (Math.hypot(dx, dy) > SWIPE) { touch = null; tryMove(swipeDir(dx, dy)); }
});
window.addEventListener('pointerup', () => {
  if (!touch) return;
  touch = null;
  tryMove('up');
});
window.addEventListener('pointercancel', () => { touch = null; });

const KEYS = {
  ArrowUp: 'up', KeyW: 'up', Space: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (state === 'over' && (e.code === 'Enter' || e.code === 'Space')) { newWorld(); return; }
  if (e.code === 'Escape' || e.code === 'KeyP') { setPause(!paused); return; }
  if (e.code === 'KeyJ' || e.code === 'ShiftLeft') { useJet(); return; }
  if (paused && (e.code === 'Enter' || e.code === 'Space')) { setPause(false); return; }
  if (state === 'menu' && (e.code === 'Enter' || e.code === 'Space')) { tryMove('up'); return; }
  const dir = KEYS[e.code];
  if (dir) { e.preventDefault(); sfx.unlock(); tryMove(dir); }
});

$('restart').addEventListener('click', () => { sfx.click(); newWorld(); playPressed(); });
$('tomenu').addEventListener('click', () => { sfx.click(); newWorld(); });
$('play').addEventListener('click', () => { sfx.unlock(); playPressed(); });
$('btn-garage').addEventListener('click', () => { sfx.unlock(); sfx.click(); openGarage(); });
$('btn-leaders').addEventListener('click', () => { sfx.unlock(); sfx.click(); openLeaders(); });
$('garage-close').addEventListener('click', () => { sfx.click(); closeSheets(); });
$('leaders-close').addEventListener('click', () => { sfx.click(); closeSheets(); });

function closeSheets() {
  // leaving the garage drops anything that was only tried on
  if (tryOn) { tryOn = null; G.applyLook(robot, null, onRobotRebuilt); }
  $('garage').classList.add('hidden');
  $('leaders').classList.add('hidden');
  $('menu').classList.remove('hidden');
  document.body.classList.remove('in-garage');
  menuView = 'main';
}

async function openLeaders() {
  menuView = 'main';
  $('menu').classList.add('hidden');
  $('leaders').classList.remove('hidden');
  const list = $('leaders-list');
  const me = $('leaders-me');
  me.innerHTML = '';
  if (!LB.enabled()) {
    list.innerHTML = '<div class="empty">Таблица лидеров скоро заработает.<br><br>Ваш рекорд: ' + best + '</div>';
    return;
  }
  list.innerHTML = '<div class="empty">ЗАГРУЗКА...</div>';
  try {
    const data = await LB.load(50);
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    list.innerHTML = data.top.length
      ? data.top.map((r, i) => `<div class="r"><span>${i + 1}</span><span class="n">${esc(r.name)}</span><b>${r.score}</b></div>`).join('')
      : '<div class="empty">Пока никого. Будь первым!</div>';
    if (data.me) me.innerHTML = `<div class="r"><span>${data.me.rank}</span><span class="n">ВЫ</span><b>${data.me.score}</b></div>`;
  } catch {
    list.innerHTML = '<div class="empty">Нет связи с сервером рекордов</div>';
  }
}

let garageTab = 'model';
let tryOn = null; // { model?, set: { cat: id } } items being tried on together (model: a robot not bought yet)
function openGarage() {
  menuView = 'garage';
  tryOn = null;
  $('menu').classList.add('hidden');
  $('garage').classList.remove('hidden');
  document.body.classList.add('in-garage');
  renderGarage();
}

// pixel icons for robots and head accessories (14x14 grid)
const ICON_HEAD = '<path fill="#4a4e6a" d="M3 6h8v7H3z"/><path fill="#f4f6ff" d="M4 8h2v3H4zM8 8h2v3H8z"/>';
const ICONS = {
  'model:rr': '<path fill="#1a1b21" d="M3 2h8v8H3z"/><path fill="#3a3b46" d="M2 4h1v4H2zM11 4h1v4h-1z"/><path fill="#f4f6ff" d="M5 5h1v2H5zM8 5h1v2H8z"/><path fill="#d9dce4" d="M4 10h6v4H4z"/><path fill="#d6a124" d="M6 11h2v2H6z"/>',
  'model:titan': '<path fill="#8e93a3" d="M3 2h8v8H3z"/><path fill="#c8ccd6" d="M3 2h8v2H3zM5 8h4v2H5z"/><path fill="#1c1d24" d="M3 5h8v2H3z"/><path fill="#e8faff" d="M4 5h2v1H4zM8 5h2v1H8z"/><path fill="#c8ccd6" d="M4 10h6v4H4z"/><path fill="#e0202c" d="M6 11h2v2H6z"/>',
  'model:dog': '<path fill="#d4d7e2" d="M2 4h10v3H2z"/><path fill="#1c1d24" d="M2 4h2v3H2zM6 4h3v1H6z"/><path fill="#ffd21f" d="M2 5h1v1H2z"/><path fill="#8aff5a" d="M8 6h1v1H8z"/><path fill="#3a3c48" d="M3 7h1v1H3zM10 7h1v1h-1z"/><path fill="#d4d7e2" d="M2 8h1v3H2zM4 8h1v3H4zM9 8h1v3H9zM11 8h1v3h-1z"/><path fill="#1c1d24" d="M2 11h2v1H2zM4 11h2v1H4zM8 11h2v1H8zM11 11h2v1h-2z"/>',
  'acc:none': ICON_HEAD,
  'acc:antenna': ICON_HEAD + '<path fill="#8a90a4" d="M9 2h1v4H9z"/><path fill="#35e6ff" d="M8 0h3v2H8z"/>',
  'acc:shades': ICON_HEAD + '<path fill="#15161c" d="M2 8h10v2H2z"/><path fill="#35e6ff" d="M3 8h3v1H3zM8 8h3v1H8z"/>',
  'acc:cap': ICON_HEAD + '<path fill="#ff3a5a" d="M3 3h8v3H3zM0 5h3v1H0z"/><path fill="#fff" d="M6 3h2v1H6z"/>',
  'acc:mohawk': ICON_HEAD + '<path fill="#ff4fd8" d="M6 1h2v5H6zM5 3h1v3H5zM8 3h1v3H8z"/>',
  'acc:catears': ICON_HEAD + '<path fill="#8a90a4" d="M3 3h2v3H3zM9 3h2v3H9z"/><path fill="#ff4fd8" d="M4 4h1v2H4zM9 4h1v2H9z"/>',
  'acc:headphones': ICON_HEAD + '<path fill="#c9ccd8" d="M3 4h8v1H3zM2 5h1v2H2zM11 5h1v2h-1z"/><path fill="#35e6ff" d="M1 7h2v4H1zM11 7h2v4h-2z"/>',
  'acc:horns': ICON_HEAD + '<path fill="#f0e6d2" d="M3 3h2v3H3zM9 3h2v3H9zM2 1h2v2H2zM10 1h2v2h-2z"/><path fill="#ff3a5a" d="M1 0h2v1H1zM11 0h2v1h-2z"/>',
  'acc:halo': ICON_HEAD + '<path fill="#ffe066" d="M4 1h6v1H4zM3 2h1v1H3zM10 2h1v1h-1zM4 3h6v1H4z"/>',
  'acc:propeller': ICON_HEAD + '<path fill="#35e6ff" d="M4 4h6v2H4z"/><path fill="#8a90a4" d="M7 2h1v2H7z"/><path fill="#ff3a5a" d="M2 1h10v1H2z"/>',
  'acc:tophat': ICON_HEAD + '<path fill="#20212a" d="M1 5h12v1H1zM4 0h6v5H4z"/><path fill="#ff3a5a" d="M4 3h6v1H4z"/>',
  'acc:crown': ICON_HEAD + '<path fill="#ffc83a" d="M3 3h8v3H3zM3 1h1v2H3zM6 1h2v2H6zM10 1h1v2h-1z"/><path fill="#ff3a5a" d="M6 4h2v1H6z"/>',
};
// tab icons (12x12)
const TAB_ICONS = {
  model: '<path fill="#c9ccd8" d="M2 0h8v7H2zM3 8h6v4H3z"/><path fill="#1a1b21" d="M3 2h6v3H3z"/><path fill="#35e6ff" d="M4 3h1v1H4zM7 3h1v1H7z"/>',
  body: '<path fill="#d9dce4" d="M2 1h8v8H2z"/><path fill="#a8acb8" d="M0 1h2v6H0zM10 1h2v6h-2zM2 7h8v2H2z"/><path fill="#5a5e70" d="M4 9h4v3H4z"/>',
  accent: '<path fill="#ffd21f" d="M5 0h2v2h1v2h1v5H8v2H4V9H3V4h1V2h1z"/><path fill="#fff6c0" d="M4 5h1v3H4z"/>',
  trim: '<path fill="#8a90a4" d="M3 0h6v2h2v2h1v4h-1v2H9v2H3v-2H1V8H0V4h1V2h2z"/><path fill="#1a1c3a" d="M4 4h4v4H4z"/>',
  scheme: '<path fill="#d9dce4" d="M1 1h10v10H1z"/><path fill="#ff2ec8" d="M1 1h5v5H1z"/><path fill="#14e4ff" d="M6 6h5v5H6z"/><path fill="#1a1c3a" d="M6 1h5v5H6z"/>',
  eyes: '<path fill="#f4f6ff" d="M2 3h8v1h2v4h-2v1H2V8H0V4h2z"/><path fill="#35e6ff" d="M4 4h4v4H4z"/><path fill="#1a1c3a" d="M5 5h2v2H5z"/>',
  acc: '<path fill="#ffc83a" d="M0 3h2v2h1V2h2v2h2V2h2v3h1V3h2v8H0z"/><path fill="#ff3a5a" d="M5 6h2v2H5z"/>',
  arms: '<path fill="#c9ccd8" d="M1 0h4v7H1z"/><path fill="#14e4ff" d="M1 5h4v2H1z"/><path fill="#5a5e70" d="M0 7h6v4H0z"/><path fill="#ff2ec8" d="M7 6h5v2H7z"/><path fill="#ffffff" d="M6 6h1v2H6z"/>',
  back: '<path fill="#14e4ff" d="M0 2h4v1H0zM1 4h3v1H1zM8 2h4v1H8zM8 4h3v1H8z"/><path fill="#c9ccd8" d="M4 1h4v10H4z"/><path fill="#ff2ec8" d="M5 3h2v5H5z"/>',
};
const svgUrl = (body, size) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${body}</svg>`)}`;
// Robot cards show a real 3D render of that robot in its own garage look (cached per look).
let thumbRenderer = null;
const thumbCache = new Map();
// preview: a look item to show on it ({ cat, id }); focus 'head' frames the head closely
function robotThumb(kind, preview = null, focus = 'body') {
  const sig = `${kind}|${focus}|${JSON.stringify(preview)}|${JSON.stringify(G.garage.looks[kind] ?? {})}`;
  if (thumbCache.has(sig)) return thumbCache.get(sig);
  if (!thumbRenderer) {
    thumbRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    thumbRenderer.setSize(240, 192);
    thumbRenderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  const r = M.makeRobot({}, kind);
  G.applyLook(r, preview ? { ...preview, model: kind } : { cat: 'model', id: kind });
  for (const tick of r.ticks ?? []) tick(0.3);
  if (r.rainbow) r.mats.eyes.color.setHSL(0.85, 1, 0.6);
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xe8ecff, 0x40425a, 2.4));
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(-2, 3, -3);
  sc.add(key, r.root);
  r.root.updateMatrixWorld(true);
  // three-quarter view from the front left (the dog more from the side), framed by its bounds
  const box = new THREE.Box3().setFromObject(focus === 'head' ? r.head : r.root);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const half = focus === 'head' ? Math.max(size.x, size.y, size.z) * 0.8
    : kind === 'dog' ? Math.max(size.y, size.z) * 0.6 : size.y * 0.54;
  const cam = new THREE.OrthographicCamera(-half * 1.25, half * 1.25, half, -half, 0.1, 20);
  const dir = focus === 'back' ? (kind === 'dog' ? new THREE.Vector3(-1, 1.1, 0.7) : new THREE.Vector3(-0.7, 0.35, 1))
    : kind === 'dog' && focus !== 'head' ? new THREE.Vector3(-1, 0.55, -0.75) : new THREE.Vector3(-0.55, 0.3, -1);
  cam.position.copy(c).addScaledVector(dir.normalize(), 6);
  cam.lookAt(c);
  thumbRenderer.render(sc, cam);
  const url = thumbRenderer.domElement.toDataURL('image/png');
  sc.traverse((o) => o.geometry?.dispose());
  thumbCache.set(sig, url);
  return url;
}

const iconUrl = (key) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 14 14" shape-rendering="crispEdges">${ICONS[key]}</svg>`)}`;
const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const COIN = '<i class="coin-ico"></i>';

function renderGarage() {
  $('garage-coins').textContent = coins;
  $('garage-tabs').innerHTML = '';
  for (const c of G.CATEGORIES) {
    const b = document.createElement('button');
    // the dog has modules instead of hands
    const name = c.dogName && (tryOn?.model ?? G.garage.model) === 'dog' ? c.dogName : c.name;
    b.innerHTML = `<img src="${svgUrl(TAB_ICONS[c.id], 12)}" alt=""><span>${name}</span>`;
    b.className = c.id === garageTab ? 'on' : '';
    b.onclick = () => { sfx.click(); garageTab = c.id; renderGarage(); };
    $('garage-tabs').appendChild(b);
  }
  $('garage-items').innerHTML = '';
  const cat = G.CATEGORIES.find((c) => c.id === garageTab);
  // Try-on: several items at once ({ model?, set: { cat: id } }), shown together on the robot;
  // a robot that is only being tried on stays on screen while its looks are browsed
  const shownModel = tryOn?.model ?? G.garage.model;
  const robotOnTry = shownModel !== G.garage.model;
  const tried = tryOn?.set ?? {};
  const look = { ...G.garage.looks[shownModel], ...tried };
  // reads tryOn as it is after the click (not the copy taken when the cards were drawn)
  const show = () => G.applyLook(robot, tryOn ? { model: tryOn.model ?? G.garage.model, set: tryOn.set } : null, onRobotRebuilt);
  // the card previews show the item together with everything already tried on
  const with_ = (id) => ({ set: { ...tried, [cat.id]: id } });
  for (const it of cat.items) {
    if ((it.only && it.only !== shownModel) || it.not === shownModel) continue; // per-robot items
    const own = G.owns(cat.id, it.id);
    const on = cat.id === 'model' ? G.garage.model === it.id && !robotOnTry : !robotOnTry && G.garage.looks[shownModel][cat.id] === it.id && tried[cat.id] == null;
    const trying = cat.id === 'model' ? robotOnTry && it.id === shownModel : tried[cat.id] === it.id;
    const b = document.createElement('button');
    b.className = (on ? 'on ' : '') + (trying ? 'preview ' : '') + (own ? '' : 'locked');
    const key = `${cat.id}:${it.id}`;
    // robots, schemes and wearables are shown as 3D renders of the robot on screen
    const pic = cat.id === 'model' ? `<img class="thumb" src="${robotThumb(it.id)}" alt="">`
      : cat.id === 'scheme' ? `<img class="thumb" src="${robotThumb(shownModel, with_(it.id))}" alt="">`
      : cat.id === 'acc' ? `<img class="thumb" src="${robotThumb(shownModel, with_(it.id), it.only ? 'body' : 'head')}" alt="">`
      : cat.id === 'arms' ? `<img class="thumb" src="${robotThumb(shownModel, with_(it.id))}" alt="">`
      : cat.id === 'back' ? `<img class="thumb" src="${robotThumb(shownModel, with_(it.id), 'back')}" alt="">`
      : ICONS[key] ? `<img src="${iconUrl(key)}" alt="">` : `<span class="sw" style="background:${it.id === 'rainbow' ? 'linear-gradient(135deg,#ff3a5a,#ffe100,#30d860,#2a8bff,#a04dff)' : hex(it.color ?? 0x2a2c52)}"></span>`;
    const st = on ? '<span class="st on">НАДЕТО</span>' : own ? '<span class="st own">ЕСТЬ</span>' : `<span class="st">${COIN}${it.price}</span>`;
    b.innerHTML = `<span class="pic">${pic}</span><span class="nm">${it.name}</span>${st}`;
    b.onclick = () => {
      sfx.click();
      if (cat.id === 'model') {
        if (own) { tryOn = null; G.choose('model', it.id, coins); }
        else tryOn = { model: it.id, set: {} };
      } else if (own && !robotOnTry) {
        // owned: equip right away, the rest of the try-on stays
        G.choose(cat.id, it.id, coins);
        if (tryOn) { delete tryOn.set[cat.id]; if (!Object.keys(tryOn.set).length && !tryOn.model) tryOn = null; }
      } else {
        // not owned (or on a robot not bought yet): add it to the try-on
        tryOn = { model: tryOn?.model, set: { ...tried, [cat.id]: it.id } };
      }
      show();
      renderGarage();
    };
    $('garage-items').appendChild(b);
  }
  // under the colour tabs: what this colour paints in the scheme of the robot on screen
  const hint = $('garage-hint');
  const role = G.ROLES[look.scheme ?? 'classic']?.[cat.id];
  hint.classList.toggle('hidden', !role);
  if (role) hint.innerHTML = `СХЕМА «${G.item('scheme', look.scheme ?? 'classic').name.toUpperCase()}»: <b>${role}</b>`;
  // one button buys everything tried on that is not owned yet (the robot first)
  const bill = garageBill();
  const buy = $('garage-buy');
  buy.classList.toggle('hidden', !bill.items.length);
  if (bill.items.length) {
    const can = coins >= bill.total;
    buy.classList.toggle('poor', !can);
    const what = bill.items.length > 1 ? `ВСЁ (${bill.items.length})` : robotOnTry ? G.item('model', shownModel).name.toUpperCase() : '';
    buy.innerHTML = `${can ? `КУПИТЬ ${what}` : 'НЕ ХВАТАЕТ'} ${COIN}${bill.total}`;
  }
}

// everything on try-on that still has to be bought
function garageBill() {
  const items = [];
  if (tryOn?.model && !G.owns('model', tryOn.model)) items.push(['model', tryOn.model]);
  for (const [cat, id] of Object.entries(tryOn?.set ?? {})) if (!G.owns(cat, id)) items.push([cat, id]);
  return { items, total: items.reduce((sum, [cat, id]) => sum + G.item(cat, id).price, 0) };
}

$('garage-buy').addEventListener('click', () => {
  const bill = garageBill();
  if (!bill.items.length) return;
  if (coins < bill.total) { sfx.bump(); haptic('error'); return; }
  // the robot first (so the rest is equipped on it), then every tried item
  if (tryOn.model) G.choose('model', tryOn.model, coins);
  for (const [cat, id] of Object.entries(tryOn.set)) G.choose(cat, id, coins);
  coins -= bill.total;
  store.set('coins', coins);
  sfx.coin();
  haptic('success');
  tryOn = null;
  G.applyLook(robot, null, onRobotRebuilt);
  hud();
  renderGarage();
});
$('jetbtn').addEventListener('click', () => useJet());
$('shieldbtn').addEventListener('click', () => {
  if (!P.guard) return;
  toast(P.guard.charge >= 1 ? 'ЩИТ ГОТОВ: СПАСЁТ ОТ УДАРА' : `ЩИТ: ${Math.round(P.guard.charge * 100)}%`);
});
$('pausebtn').addEventListener('click', () => { if (state === 'play' && P.alive) setPause(true); });
$('resume').addEventListener('click', () => { setPause(false); sfx.unlock(); sfx.click(); });
$('newrun').addEventListener('click', () => { setPause(false); clearRun(); newWorld(); });
$('mute').classList.toggle('off', isMuted());
$('mute').addEventListener('click', () => {
  setMuted(!isMuted());
  sfx.click();
  $('mute').classList.toggle('off', isMuted());
});
$('music').classList.toggle('off', !isMusicOn());
$('music').addEventListener('click', () => {
  sfx.unlock();
  setMusic(!isMusicOn());
  sfx.click();
  $('music').classList.toggle('off', !isMusicOn());
});
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- optional GLB robot
async function loadRobotModel() {
  try {
    const res = await fetch(ROBOT_URL, { method: 'HEAD' });
    if (!res.ok) return;
  } catch { return; }
  new GLTFLoader().load(ROBOT_URL, (gltf) => {
    const obj = gltf.scene;
    obj.rotation.y = ROBOT_ROT_Y;
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
    });
    const pivot = new THREE.Group();
    pivot.add(obj);
    let bb = new THREE.Box3().setFromObject(pivot);
    pivot.scale.setScalar(ROBOT_HEIGHT / (bb.max.y - bb.min.y));
    bb = new THREE.Box3().setFromObject(pivot);
    const c = bb.getCenter(new THREE.Vector3());
    obj.position.x -= c.x / pivot.scale.x;
    obj.position.z -= c.z / pivot.scale.x;
    obj.position.y -= bb.min.y / pivot.scale.x;

    robot.body.remove(robot.model);
    robot.body.add(pivot);
    robot.model = pivot;
    const node = (n) => obj.getObjectByName(n);
    robot.legs = [node('LegL'), node('LegR')].filter(Boolean);
    robot.arms = [node('ArmL'), node('ArmR')].filter(Boolean);
    robot.eyes = [];
  }, undefined, (err) => console.warn('robot.glb failed to load', err));
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = paused || document.hidden || state === 'mini' ? 0 : Math.min(0.05, (now - last) / 1000);
  last = now;
  if (state === 'mini') return; // the training draws its own scene
  if (paused) {
    // frozen world, but camera and sky stay correct (e.g. right after restoring a saved run)
    updateCamera(0);
    env.update(0, camera.position, robot.root.position);
    renderer.render(scene, camera);
    return;
  }
  time += dt;
  updateLanes(dt);
  updatePlayer(dt);
  checkHits();
  updateDeath(dt);
  updateParticles(dt);
  updateStreaks(dt);
  // animated head items (propeller, siren, radar, ...) and rainbow eyes run even in menus
  for (const tick of robot.ticks ?? []) tick(performance.now() / 1000);
  placeJetpack();
  if (robot.rainbow) robot.mats.eyes.color.setHSL((performance.now() / 4000) % 1, 1, 0.6);
  updateCamera(dt);
  updateWarnings();
  updateSkyCars(dt);
  env.update(dt, camera.position, robot.root.position);
  renderer.render(scene, camera);
}

// ?debug in the URL exposes a few helpers in the console (time of day, jumping ahead).
if (new URLSearchParams(location.search).has('debug')) {
  window.rc = {
    env, lanes, P, sfx, robot, camera, renderer, scene,
    night: () => { env.phase = 0.65; },
    day: () => { env.phase = 0.1; },
    rain: () => { env.rainTarget = 1; env.rain = 1; },
    jump: (row) => {
      if (state === 'menu') startGame();
      ensureLanes(row + 46);
      Object.assign(P, { row, z: -row, x: 0, plat: null, hop: null });
      camRow = row;
      robot.root.position.set(0, 0, -row);
    },
    types: () => [...lanes.values()].map((l) => `${l.row}:${l.type}`).join(' '),
    newWorld: () => newWorld(),
    freeCells, HALF,
  };
}

const TIPS = [
  'Свайп в сторону — шаг вбок, вниз — шаг назад',
  'Долго стоишь — прилетит охранный дрон',
  'В лётном центре робот учится летать на джетпаке',
  'Мигающая клетка скоро ударит током',
  'Подойди к человеку с ладонью — он даст пять',
  'Жетоны RR тратятся в гараже на новый вид робота',
  'На переезде колокол звенит, пока поезд не проедет',
];
function loadStep(p, text) {
  $('ld-fill').style.width = `${Math.round(p * 100)}%`;
  if (text) $('ld-text').textContent = text;
}

async function init() {
  // the loading screen always stays up for 1.5-2.5 s, so the logo and the tip can be seen
  const shownUntil = performance.now() + 1500 + Math.random() * 1000;
  $('ld-tip').textContent = 'Совет: ' + pick(TIPS);
  loadStep(0.15, 'ЗАПУСК СИСТЕМ...');
  initTelegram(BG);
  // Neon signs are drawn with the pixel font, so wait for it (but never hang on it).
  try {
    await Promise.race([document.fonts.load('16px "Press Start 2P"'), new Promise((r) => setTimeout(r, 2500))]);
  } catch {}
  loadStep(0.35, 'ЗАГРУЗКА ПРОФИЛЯ...');
  best = parseInt(await store.get('best'), 10) || 0;
  coins = parseInt(await store.get('coins'), 10) || 0;
  await G.loadGarage();
  loadStep(0.55, 'СТРОИМ ГОРОД...');
  await new Promise((r) => setTimeout(r, 30)); // let the bar repaint before the heavy build
  G.applyLook(robot, null, onRobotRebuilt);
  // the freshest saved run: local (every sidewalk) or Telegram cloud (on pause / minimize)
  const parse = (v) => { try { return JSON.parse(v || 'null'); } catch { return null; } };
  let local = null;
  try { local = parse(localStorage.getItem('run')); } catch {}
  const cloud = parse(await store.get('run'));
  const save = [local, cloud].filter(Boolean).sort((a, b) => (b.t ?? 0) - (a.t ?? 0))[0] ?? null;
  newWorld(save && save.row > 0 && save.seed ? save : null);
  loadStep(0.85, 'ВКЛЮЧАЕМ НЕОН...');
  await new Promise((r) => setTimeout(r, Math.max(0, shownUntil - 300 - performance.now())));
  loadStep(1, 'ГОТОВО');
  renderer.render(scene, camera);
  setTimeout(() => {
    $('loading').classList.add('fade');
    setTimeout(() => $('loading').classList.add('hidden'), 550);
  }, 300);
  requestAnimationFrame(frame);
  loadRobotModel();
}
init();
