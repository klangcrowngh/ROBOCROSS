// Voxel models built from boxes. Vehicles face +x, the robot faces -z, NPCs face +z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const snap = (v, s = 0.5) => Math.round(v / s) * s;

const geoCache = new Map();
const matCache = new Map();

// worldUV: UVs measured in world units so textures keep a constant scale on any box size.
function geo(w, h, d, worldUV = true) {
  const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${worldUV}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    if (worldUV) {
      const uv = g.attributes.uv;
      const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
      for (let f = 0; f < 6; f++) {
        for (let i = 0; i < 4; i++) {
          const j = f * 4 + i;
          uv.setXY(j, uv.getX(j) * dims[f][0], uv.getY(j) * dims[f][1]);
        }
      }
    }
    geoCache.set(k, g);
  }
  return g;
}

// glow = unlit neon. Flat-colour materials are merged into vertex colours when baked.
export function mat(color, glow = false) {
  const k = `${color}|${glow}`;
  let m = matCache.get(k);
  if (!m) {
    m = glow ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
    m.userData.flat = true;
    matCache.set(k, m);
  }
  return m;
}

// Box centered at (x, y, z). `color` may be a hex number or a ready material.
export function box(parent, w, h, d, color, x = 0, y = 0, z = 0, glow = false) {
  const material = typeof color === 'object' ? color : mat(color, glow);
  const m = new THREE.Mesh(geo(w, h, d), material);
  m.position.set(x, y, z);
  m.castShadow = !material.isMeshBasicMaterial;
  m.receiveShadow = !material.isMeshBasicMaterial;
  parent.add(m);
  return m;
}

// Neon sign: a box textured with one cell of the sign atlas.
const signGeoCache = new Map();
export function sign(parent, w, h, d, kind, i, x = 0, y = 0, z = 0) {
  const k = `${w.toFixed(3)}|${h.toFixed(3)}|${d.toFixed(3)}|${kind}|${i}`;
  let g = signGeoCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    const [u0, v0, u1, v1] = TX.signRect(kind, i);
    const uv = g.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setXY(j, u0 + uv.getX(j) * (u1 - u0), v0 + uv.getY(j) * (v1 - v0));
    signGeoCache.set(k, g);
  }
  const m = new THREE.Mesh(g, TX.signMaterial());
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function relativeGeometries(group, filter) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const rel = new THREE.Matrix4();
  const out = [];
  group.traverse((o) => {
    if (!o.isMesh || !filter(o)) return;
    rel.multiplyMatrices(inv, o.matrixWorld);
    out.push({ mesh: o, geometry: o.geometry.clone().applyMatrix4(rel) });
  });
  return out;
}

const VC_LIT = new THREE.MeshLambertMaterial({ vertexColors: true });
const VC_GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });

// Merge static meshes: all flat colours into two vertex-coloured meshes (lit + neon),
// textured ones into one mesh per material. Keeps phones at a few draw calls per lane.
export function bake(group, keep = new Set()) {
  const parts = relativeGeometries(group, (o) => !keep.has(o) && !o.userData.baked);
  const buckets = new Map();
  for (const { mesh, geometry } of parts) {
    let material = mesh.material;
    if (material.userData.flat) {
      const n = geometry.attributes.position.count;
      const col = new Float32Array(n * 3);
      const c = material.color;
      for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geometry.deleteAttribute('uv');
      material = material.isMeshBasicMaterial ? VC_GLOW : VC_LIT;
    }
    let b = buckets.get(material);
    if (!b) buckets.set(material, (b = { geos: [], cast: false }));
    b.geos.push(geometry);
    b.cast ||= mesh.castShadow;
    mesh.parent.remove(mesh);
  }
  for (const [material, b] of buckets) {
    const mesh = new THREE.Mesh(mergeGeometries(b.geos), material);
    b.geos.forEach((g) => g.dispose());
    mesh.castShadow = b.cast;
    mesh.receiveShadow = !material.isMeshBasicMaterial;
    mesh.userData.baked = true;
    group.add(mesh);
  }
  return group;
}

export function disposeBaked(group) {
  group.traverse((o) => { if (o.userData.baked) o.geometry.dispose(); });
}

// ---------------------------------------------------------------- robot (placeholder)
export const PAL = { white: 0xeef0f6, light: 0xc9ccd8, dark: 0x3a3b46, black: 0x1f2028, yellow: 0xf5c116 };

export function makeRobot() {
  const root = new THREE.Group();  // position + facing (game controlled)
  const body = new THREE.Group();  // squash / stretch
  const model = new THREE.Group(); // the actual mesh, replaceable by a GLB
  model.scale.setScalar(0.88);
  root.add(body);
  body.add(model);
  const { white: W, light: L, dark: D, black: B, yellow: Y } = PAL;

  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.12, 0.5, 0);
    model.add(hip);
    box(hip, 0.17, 0.2, 0.19, W, 0, -0.1, 0);
    box(hip, 0.18, 0.07, 0.2, D, 0, -0.22, 0);
    box(hip, 0.17, 0.16, 0.19, W, 0, -0.33, 0);
    box(hip, 0.21, 0.08, 0.28, Y, 0, -0.45, -0.03);
    box(hip, 0.21, 0.03, 0.28, B, 0, -0.495, -0.03);
    return hip;
  });

  box(model, 0.38, 0.12, 0.22, D, 0, 0.55, 0);           // pelvis
  box(model, 0.52, 0.36, 0.32, W, 0, 0.79, 0);           // torso
  box(model, 0.53, 0.05, 0.33, L, 0, 0.63, 0);           // torso shading
  box(model, 0.08, 0.15, 0.02, B, 0, 0.74, -0.165);      // chest slot
  box(model, 0.04, 0.04, 0.025, 0x5a5c68, 0, 0.77, -0.166);
  box(model, 0.04, 0.04, 0.025, 0x5a5c68, 0, 0.71, -0.166);
  box(model, 0.06, 0.05, 0.02, L, 0.01, 0.89, -0.165);   // chest pixels
  box(model, 0.06, 0.05, 0.02, Y, 0.09, 0.89, -0.165, true);
  box(model, 0.16, 0.16, 0.04, Y, 0, 0.8, 0.175);        // back battery
  box(model, 0.16, 0.05, 0.14, D, 0, 0.995, 0);          // neck

  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * 0.31, 0.93, 0);
    model.add(sh);
    box(sh, 0.12, 0.13, 0.2, D, 0, -0.03, 0);
    box(sh, 0.13, 0.26, 0.15, W, s * 0.02, -0.2, 0);
    box(sh, 0.15, 0.13, 0.17, Y, s * 0.02, -0.39, 0);
    return sh;
  });

  const head = new THREE.Group();
  head.position.set(0, 1.02, 0);
  model.add(head);
  box(head, 0.46, 0.38, 0.4, B, 0, 0.19, 0);
  const eyes = [-1, 1].map((s) => box(head, 0.07, 0.14, 0.02, 0xffffff, s * 0.085, 0.2, -0.205, true));
  for (const s of [-1, 1]) {
    box(head, 0.06, 0.18, 0.18, D, s * 0.26, 0.19, 0.02);
    box(head, 0.065, 0.08, 0.08, 0x55576a, s * 0.262, 0.19, 0.02);
  }

  return { root, body, model, legs, arms, head, eyes };
}

// ---------------------------------------------------------------- vehicles
const GLASS = 0x1a2240;
const HEAD = 0xfff4c2;
const TAIL = 0xff3355;

function wheels(g, xs) {
  for (const x of xs) for (const z of [-0.41, 0.41]) {
    box(g, 0.3, 0.26, 0.1, 0x15161f, x, 0.13, z);
    box(g, 0.12, 0.1, 0.11, 0x9aa0c0, x, 0.13, z);
  }
}

function lights(g, len, y) {
  for (const z of [-0.25, 0.25]) {
    box(g, 0.03, 0.08, 0.16, HEAD, len / 2 + 0.01, y, z, true);
    box(g, 0.03, 0.07, 0.14, TAIL, -len / 2 - 0.01, y, z, true);
  }
}

function car(g, { len, body, roof = body, glow = null, hover = false }) {
  const y0 = hover ? 0.32 : 0.12;
  if (!hover) wheels(g, [-(len / 2 - 0.32), len / 2 - 0.32]);
  box(g, len, 0.34, 0.8, body, 0, y0 + 0.17, 0);
  box(g, len + 0.04, 0.07, 0.82, 0x2a2b38, 0, y0 + 0.04, 0);                     // bumper line
  box(g, len * 0.55, 0.3, 0.7, roof, -len * 0.06, y0 + 0.49, 0);
  box(g, len * 0.55 + 0.02, 0.15, 0.72, GLASS, -len * 0.06, y0 + 0.48, 0);
  box(g, 0.06, 0.15, 0.73, roof, -len * 0.06, y0 + 0.48, 0);                     // door pillar
  box(g, 0.1, 0.02, 0.81, 0x000000, len * 0.08, y0 + 0.2, 0);                    // door seam
  lights(g, len, y0 + 0.22);
  if (glow) box(g, len * 0.9, 0.04, 0.84, glow, 0, y0 - 0.01, 0, true);
  if (hover) for (const x of [-len / 3, len / 3]) box(g, 0.32, 0.08, 0.6, glow, x, y0 - 0.06, 0, true);
  return y0;
}

export function makeVehicle(kind) {
  const g = new THREE.Group();
  const keep = new Set();
  let len = 1.6;
  let hover = false;
  let flash = null;

  switch (kind) {
    case 'taxi': {
      const y0 = car(g, { len, body: 0xf6c12b, glow: 0x35e6ff });
      // NYC checker band
      for (let i = 0; i < 8; i++) {
        const x = -len / 2 + 0.1 + i * 0.18;
        for (const z of [-0.405, 0.405]) box(g, 0.09, 0.06, 0.01, i % 2 ? 0xffffff : 0x111111, x, y0 + 0.24, z);
      }
      sign(g, 0.4, 0.14, 0.2, 'h', 5, -len * 0.06, y0 + 0.72, 0);
      break;
    }
    case 'sedan':
      car(g, { len, body: 0x3b6df0, glow: 0x35e6ff });
      break;
    case 'compact':
      len = 1.3;
      car(g, { len, body: 0x46c35a, roof: 0x2f9a44 });
      break;
    case 'police': {
      const y0 = car(g, { len, body: 0x2f5bd8, roof: 0xeef0f6 });
      box(g, len * 0.5, 0.08, 0.81, 0xeef0f6, 0.1, y0 + 0.22, 0);
      const a = box(g, 0.16, 0.08, 0.2, 0xff2b4a, -len * 0.06, y0 + 0.68, -0.12, true);
      const b = box(g, 0.16, 0.08, 0.2, 0x2b6bff, -len * 0.06, y0 + 0.68, 0.12, true);
      flash = [a, b];
      keep.add(a); keep.add(b);
      break;
    }
    case 'truck': {
      len = 2.6;
      wheels(g, [-(len / 2 - 0.35), -(len / 2 - 0.8), len / 2 - 0.35]);
      box(g, 0.8, 0.62, 0.82, 0xe23b3b, len / 2 - 0.4, 0.43, 0);
      box(g, 0.42, 0.2, 0.84, GLASS, len / 2 - 0.3, 0.6, 0);
      box(g, 0.03, 0.2, 0.66, GLASS, len / 2 + 0.01, 0.6, 0);
      box(g, len - 0.9, 0.86, 0.86, 0xe9ebf3, -0.45, 0.55, 0);
      for (let x = -len / 2 + 0.3; x < len / 2 - 0.9; x += 0.35) box(g, 0.02, 0.8, 0.87, 0xc9ccd8, x, 0.55, 0);
      box(g, len - 0.88, 0.06, 0.88, 0x35e6ff, -0.45, 0.32, 0, true);
      lights(g, len, 0.3);
      break;
    }
    case 'bus': {
      len = 2.9;
      wheels(g, [-(len / 2 - 0.4), len / 2 - 0.4]);
      box(g, len, 0.78, 0.86, 0xeef0f8, 0, 0.51, 0);
      box(g, len + 0.02, 0.24, 0.88, GLASS, 0.05, 0.66, 0);
      for (let x = -len / 2 + 0.5; x < len / 2; x += 0.5) box(g, 0.05, 0.24, 0.89, 0xeef0f8, x, 0.66, 0);
      box(g, len + 0.02, 0.05, 0.88, 0x35e6ff, 0, 0.38, 0, true);
      box(g, len - 0.5, 0.08, 0.6, 0xc9ccd8, 0, 0.94, 0);
      lights(g, len, 0.3);
      break;
    }
    case 'hovercar':
      hover = true;
      len = 1.7;
      car(g, { len, body: 0x7b3fe4, roof: 0x5a2bb0, glow: 0xff4fd8, hover });
      box(g, len * 0.6, 0.04, 0.81, 0xff4fd8, 0.1, 0.56, 0, true);
      break;
    case 'hovertruck': {
      hover = true;
      len = 2.4;
      const y0 = 0.3;
      box(g, len, 0.6, 0.84, 0x2a2c48, 0, y0 + 0.3, 0);
      box(g, 0.5, 0.2, 0.86, GLASS, len / 2 - 0.35, y0 + 0.42, 0);
      box(g, len + 0.01, 0.05, 0.86, 0x35e6ff, 0, y0 + 0.15, 0, true);
      box(g, len * 0.9, 0.04, 0.84, 0x35e6ff, 0, y0 - 0.01, 0, true);
      for (const x of [-len / 3, len / 3]) box(g, 0.4, 0.08, 0.6, 0x35e6ff, x, y0 - 0.06, 0, true);
      lights(g, len, y0 + 0.3);
      break;
    }
  }
  bake(g, keep);
  g.userData = { len, hover, flash, kind };
  return g;
}

export function makeTrain() {
  const g = new THREE.Group();
  const n = 3, cl = 3, gap = 0.12;
  const len = n * cl + (n - 1) * gap;
  for (let i = 0; i < n; i++) {
    const cx = -len / 2 + cl / 2 + i * (cl + gap);
    box(g, cl, 0.8, 0.86, 0xeef0f8, cx, 0.62, 0);
    box(g, cl + 0.01, 0.24, 0.88, GLASS, cx, 0.74, 0);
    for (let x = cx - cl / 2 + 0.6; x < cx + cl / 2; x += 0.6) box(g, 0.05, 0.24, 0.89, 0xeef0f8, x, 0.74, 0);
    box(g, cl + 0.01, 0.05, 0.88, 0x35e6ff, cx, 0.46, 0, true);
    box(g, cl - 0.3, 0.08, 0.5, 0x35e6ff, cx, 0.2, 0, true);
    box(g, cl - 0.3, 0.06, 0.6, 0xc9ccd8, cx, 1.05, 0);
  }
  box(g, 0.45, 0.6, 0.8, 0xeef0f8, len / 2 + 0.22, 0.52, 0);
  box(g, 0.02, 0.22, 0.6, 0x35e6ff, len / 2 + 0.46, 0.66, 0, true);
  for (const z of [-0.25, 0.25]) box(g, 0.03, 0.08, 0.14, HEAD, len / 2 + 0.46, 0.38, z, true);
  bake(g);
  g.userData = { len: len + 0.45 };
  return g;
}

// Anti-gravity pad crossing the gap between city levels.
export function makePad(len) {
  const g = new THREE.Group();
  box(g, len - 0.08, 0.2, 0.86, 0x2c2f52, 0, -0.12, 0);
  box(g, len - 0.2, 0.02, 0.7, 0x3a3e6a, 0, -0.015, 0);
  for (const z of [-0.43, 0.43]) box(g, len - 0.08, 0.04, 0.04, 0x35e6ff, 0, -0.03, z, true);
  for (const x of [-(len / 2 - 0.12), len / 2 - 0.12]) box(g, 0.08, 0.05, 0.7, 0xff4fd8, x, -0.02, 0, true);
  for (let i = 1; i < len; i++) box(g, 0.04, 0.02, 0.6, 0x23264a, -len / 2 + i, -0.005, 0);
  box(g, len - 0.4, 0.06, 0.5, 0x35e6ff, 0, -0.25, 0, true);
  bake(g);
  g.userData = { len };
  return g;
}

export function makeCoin() {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.46, 0.08), TX.coinMat());
  m.castShadow = true;
  g.add(m);
  box(g, 0.48, 0.48, 0.06, 0xc98a10);
  return g;
}

export function makeDrone() {
  const g = new THREE.Group();
  box(g, 0.7, 0.22, 0.5, 0x2a2c48);
  box(g, 0.22, 0.08, 0.02, 0xff2b4a, 0, 0, 0.26, true);
  for (const x of [-0.45, 0.45]) for (const z of [-0.35, 0.35]) {
    box(g, 0.05, 0.12, 0.05, 0x55597a, x, 0.08, z);
    box(g, 0.36, 0.03, 0.36, 0x35e6ff, x, 0.15, z, true);
  }
  for (const x of [-0.15, 0.15]) box(g, 0.08, 0.3, 0.08, 0x55597a, x, -0.24, 0);
  return g;
}

// ---------------------------------------------------------------- street props (baked with the lane)
export function streetTree(p, x, z = 0) {
  box(p, 0.7, 0.3, 0.7, 0x6d7194, x, 0.15, z);
  box(p, 0.74, 0.04, 0.74, 0x35e6ff, x, 0.31, z, true);
  box(p, 0.6, 0.04, 0.6, 0x5a3a28, x, 0.32, z);
  const h = rand(0.3, 0.55);
  box(p, 0.16, h, 0.16, 0x7a5233, x, 0.3 + h / 2, z);
  const green = pick([0x4cbf4f, 0x5ad15a, 0x3fae49]);
  box(p, 0.78, 0.6, 0.78, green, x, 0.3 + h + 0.3, z);
  box(p, 0.5, 0.25, 0.5, shadeHex(green, 1.15), x + 0.05, 0.3 + h + 0.72, z + 0.05);
}

function shadeHex(c, k) {
  const f = (v) => Math.min(255, Math.round(v * k));
  return (f((c >> 16) & 255) << 16) | (f((c >> 8) & 255) << 8) | f(c & 255);
}

export function lamp(p, x, z = 0) {
  box(p, 0.26, 0.1, 0.26, 0x55597a, x, 0.05, z);
  box(p, 0.1, 1.5, 0.1, 0x6d7194, x, 0.75, z);
  box(p, 0.42, 0.07, 0.1, 0x6d7194, x + 0.16, 1.5, z);
  box(p, 0.24, 0.05, 0.14, 0x35e6ff, x + 0.28, 1.45, z, true);
  box(p, 0.11, 0.3, 0.02, 0xff4fd8, x, 0.9, z + 0.06, true);
}

export function hydrant(p, x, z = 0) {
  box(p, 0.3, 0.06, 0.3, 0x6d7194, x, 0.03, z);
  box(p, 0.22, 0.4, 0.22, 0xe0303a, x, 0.26, z);
  box(p, 0.34, 0.08, 0.1, 0xe0303a, x, 0.32, z);
  box(p, 0.16, 0.1, 0.16, 0xff5a5a, x, 0.51, z);
}

export function bin(p, x, z = 0) {
  box(p, 0.36, 0.5, 0.36, 0x2f6a5a, x, 0.25, z);
  box(p, 0.4, 0.06, 0.4, 0x24524a, x, 0.53, z);
  box(p, 0.37, 0.04, 0.37, 0x6dffb0, x, 0.36, z, true);
}

export function bench(p, x, z = 0) {
  for (const dx of [-0.3, 0.3]) box(p, 0.06, 0.3, 0.36, 0x55597a, x + dx, 0.15, z);
  box(p, 0.8, 0.06, 0.34, 0xb07a45, x, 0.3, z);
  box(p, 0.8, 0.22, 0.05, 0xb07a45, x, 0.45, z - 0.16);
}

export function mailbox(p, x, z = 0) {
  box(p, 0.1, 0.25, 0.1, 0x1f3a8a, x, 0.12, z);
  box(p, 0.4, 0.45, 0.36, 0x2b4fc0, x, 0.47, z);
  box(p, 0.4, 0.08, 0.36, 0x3b62d8, x, 0.73, z);
  box(p, 0.2, 0.04, 0.02, 0x10183a, x, 0.6, z + 0.19);
}

export function vending(p, x, z = 0) {
  box(p, 0.6, 1.1, 0.45, 0xe0306a, x, 0.55, z);
  box(p, 0.42, 0.6, 0.02, 0x8ff0ff, x - 0.04, 0.65, z + 0.23, true);
  for (let i = 0; i < 3; i++) box(p, 0.36, 0.03, 0.025, 0xffd21f, x - 0.04, 0.45 + i * 0.2, z + 0.235, true);
}

export function kiosk(p, x, z = 0) {
  box(p, 0.55, 0.95, 0.35, 0x2a2c48, x, 0.475, z);
  sign(p, 0.45, 0.5, 0.02, 'logo', pick([0, 1, 3]), x, 0.6, z + 0.18);
}

export function bollards(p, x, z = 0) {
  for (const dx of [-0.25, 0.25]) for (const dz of [-0.2, 0.2]) {
    box(p, 0.14, 0.4, 0.14, 0x9aa0c0, x + dx, 0.2, z + dz);
    box(p, 0.15, 0.04, 0.15, 0xffd21f, x + dx, 0.32, z + dz, true);
  }
}

export function cones(p, x, z = 0) {
  for (const [dx, dz] of [[-0.22, -0.15], [0.2, 0.12], [0, -0.2]]) {
    box(p, 0.22, 0.04, 0.22, 0x222222, x + dx, 0.02, z + dz);
    box(p, 0.14, 0.3, 0.14, 0xff7a1a, x + dx, 0.19, z + dz);
    box(p, 0.15, 0.06, 0.15, 0xffffff, x + dx, 0.22, z + dz);
  }
}

export function barrier(p, x, z = 0) {
  for (const dx of [-0.3, 0.3]) box(p, 0.08, 0.6, 0.3, 0x8a8ea8, x + dx, 0.3, z);
  for (let i = 0; i < 5; i++) box(p, 0.16, 0.22, 0.1, i % 2 ? 0x1f2028 : 0xffc21a, x - 0.32 + i * 0.16, 0.55, z);
}

export function crates(p, x, z = 0) {
  box(p, 0.72, 0.6, 0.72, 0xb07a45, x, 0.3, z);
  box(p, 0.74, 0.06, 0.74, 0x8a5a30, x, 0.3, z);
  if (Math.random() < 0.6) box(p, 0.5, 0.42, 0.5, 0xc08a52, x + 0.05, 0.81, z - 0.03);
}

// Pedestrians (from the concept sheet).
const SKIN = [0xf1c7a0, 0xc68e64, 0x8a5a3c, 0xe8b48a];
const PEOPLE = [
  { hair: 0xff8a2a, top: 0x3a3340, legs: 0x2b2b38, shoes: 0xff8a2a },
  { hair: 0xe05ad8, top: 0xa04ad0, legs: 0x2a3a7a, shoes: 0xffffff, long: true },
  { cap: 0x2a5ad8, top: 0x2a6ae0, legs: 0x1f2a5a, shoes: 0x111111 },
  { cap: 0xffc21a, top: 0x3a3a4a, vest: 0xff8a2a, legs: 0x3a3a4a, shoes: 0x5a3a20 },
  { hair: 0x2a2a2a, top: 0x2a2d3a, legs: 0x2a2d3a, shoes: 0x111111, tie: 0xd83a3a, briefcase: true },
  { hood: 0xd83a3a, top: 0xd83a3a, legs: 0x2a3a6a, shoes: 0xffffff },
  { hair: 0x3a2a80, top: 0x6a3ad0, legs: 0x2b2b38, shoes: 0x111111, visor: true },
];

// Pedestrian with swinging legs. Each part is baked so a person costs ~3 draw calls.
export function makePerson() {
  const v = pick(PEOPLE);
  const skin = pick(SKIN);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.08, 0.36, 0);
    box(hip, 0.13, 0.32, 0.15, v.legs, 0, -0.16, 0);
    box(hip, 0.14, 0.05, 0.18, v.shoes, 0, -0.335, 0.01);
    bake(hip);
    body.add(hip);
    return hip;
  });
  const top = new THREE.Group();
  for (const s of [-1, 1]) {
    box(top, 0.1, 0.32, 0.13, v.top, s * 0.23, 0.53, 0);
    box(top, 0.1, 0.08, 0.12, skin, s * 0.23, 0.33, 0);
  }
  box(top, 0.36, 0.34, 0.2, v.top, 0, 0.53, 0);
  box(top, 0.3, 0.3, 0.28, skin, 0, 0.86, 0);
  for (const s of [-1, 1]) box(top, 0.04, 0.06, 0.01, 0x1a1a22, s * 0.07, 0.86, 0.141);
  if (v.hair) {
    box(top, 0.32, 0.1, 0.3, v.hair, 0, 1.02, 0);
    box(top, 0.32, v.long ? 0.42 : 0.2, 0.08, v.hair, 0, v.long ? 0.82 : 0.92, -0.12);
  }
  if (v.cap) {
    box(top, 0.33, 0.1, 0.31, v.cap, 0, 1.04, 0);
    box(top, 0.24, 0.03, 0.1, v.cap, 0, 1.0, 0.18);
  }
  if (v.hood) {
    box(top, 0.34, 0.12, 0.32, v.hood, 0, 1.03, -0.01);
    box(top, 0.34, 0.3, 0.08, v.hood, 0, 0.88, -0.14);
  }
  if (v.vest) {
    box(top, 0.37, 0.3, 0.21, v.vest, 0, 0.55, 0);
    box(top, 0.38, 0.03, 0.22, 0xffffaa, 0, 0.5, 0, true);
  }
  if (v.tie) box(top, 0.05, 0.2, 0.01, v.tie, 0, 0.56, 0.101);
  if (v.briefcase) box(top, 0.08, 0.2, 0.26, 0x5a3a20, 0.31, 0.24, 0);
  if (v.visor) box(top, 0.24, 0.05, 0.01, 0x35e6ff, 0, 0.88, 0.142, true);
  bake(top);
  body.add(top);
  return { root, body, legs };
}

// Traffic light on a street corner; signals face the camera.
export function trafficLight(p, x, z, armDir) {
  box(p, 0.24, 0.08, 0.24, 0x3a3d55, x, 0.04, z);
  box(p, 0.08, 2.0, 0.08, 0x3a3d55, x, 1.0, z);
  box(p, 0.08, 0.08, 0.9, 0x3a3d55, x, 1.95, z + armDir * 0.45);
  const hz = z + armDir * 0.85;
  box(p, 0.2, 0.5, 0.14, 0x1d1e28, x, 1.7, hz);
  const lit = Math.floor(Math.random() * 3);
  [0xff2b4a, 0xffc21a, 0x3dff7a].forEach((c, i) => {
    box(p, 0.12, 0.12, 0.02, i === lit ? c : 0x2a2a35, x, 1.85 - i * 0.15, hz + 0.08, i === lit);
  });
  // pedestrian signal
  box(p, 0.16, 0.18, 0.1, 0x1d1e28, x, 1.1, z + 0.05);
  box(p, 0.1, 0.1, 0.02, Math.random() < 0.5 ? 0xffffff : 0xff7a1a, x, 1.1, z + 0.11, true);
}

// ---------------------------------------------------------------- buildings
const ROOF = 0x55587a;
const ri = (n) => Math.floor(Math.random() * n);

// Current district look (set by the game before a lane is built).
let D = {
  facades: [0, 1, 2, 3, 4, 5, 6],
  neon: [0x35e6ff, 0xff4fd8, 0xb46bff],
  awning: [0xe0306a, 0x2b6bff, 0x3dbf6a, 0xffc21a, 0x7b3fe4],
  gardens: false, lanterns: false,
};
export function setDistrict(d) { D = d; }

// A skyscraper occupying x0..x1 in its lane (1 unit deep). Its street-facing side gets the
// storefront and the signs, since the chase camera looks down the street.
export function building(p, x0, x1, h, street = true) {
  const w = x1 - x0, cx = (x0 + x1) / 2, d = 0.96, front = d / 2;
  const fm = TX.facadeMat(pick(D.facades));
  const s = cx > 0 ? -1 : 1;              // direction towards the street
  const inner = cx > 0 ? x0 : x1;

  box(p, w, h, d, fm, cx, h / 2, 0);
  box(p, w + 0.02, 0.1, d + 0.02, ROOF, cx, h + 0.05, 0);
  box(p, w, 0.14, 0.06, 0x6d7194, cx, h + 0.17, front - 0.03);

  // neon floor bands
  if (Math.random() < 0.4) {
    const c = pick(D.neon);
    for (let y = 2; y < h - 0.5; y += 2) box(p, w + 0.02, 0.04, d + 0.02, c, cx, y, 0, true);
  }

  if (street) {
    // storefront on the street side
    box(p, 0.03, 0.6, d - 0.14, Math.random() < 0.5 ? 0xffb0e8 : 0x9ff3ff, inner + s * 0.01, 0.32, 0, true);
    box(p, 0.3, 0.06, d - 0.06, pick(D.awning), inner + s * 0.15, 0.68, 0);
    if (D.lanterns && Math.random() < 0.7) {
      for (const z of [-0.25, 0.25]) {
        box(p, 0.02, 0.2, 0.02, 0x2a2a2a, inner + s * 0.28, 0.95, z);
        box(p, 0.18, 0.24, 0.18, pick([0xff3a3a, 0xff6a2a]), inner + s * 0.28, 0.78, z, true);
      }
    }
    if (D.gardens) box(p, 0.06, h * 0.6, 0.5, 0x3fae49, inner + s * 0.02, h * 0.45, -0.1);
    box(p, 0.02, 0.03, d - 0.06, 0xffffff, inner + s * 0.3, 0.64, 0, true);
    // wall screen: logo / robot face
    if (h > 2.5 && Math.random() < 0.45) {
      const sz = 0.82;
      const y = snap(rand(1.5 + sz / 2, Math.max(1.6 + sz / 2, h - sz / 2 - 0.3)));
      box(p, 0.05, sz + 0.1, sz + 0.1, 0x1d1e30, inner + s * 0.02, y, 0);
      sign(p, 0.04, sz, sz, 'logo', ri(TX.SIGN_COUNT.logo), inner + s * 0.05, y, 0);
    }
    // blade signs sticking out over the sidewalk
    if (h > 2.5 && Math.random() < 0.5) {
      const tall = Math.random() < 0.6;
      const [bw, bh, kind] = tall ? [0.32, 1.3, 'v'] : [0.5, 0.75, 'tower'];
      const y = rand(1.2 + bh / 2, Math.max(1.3 + bh / 2, h - bh / 2 - 0.2));
      box(p, 0.24, 0.05, 0.05, 0x3a3d55, inner + s * 0.12, y + bh / 2 - 0.1, 0);
      sign(p, bw, bh, 0.06, kind, ri(TX.SIGN_COUNT[kind]), inner + s * (0.12 + bw / 2), y, 0);
    }
  }

  // Times Square billboards on the south face (seen above lower neighbours)
  if (h > 4 && Math.random() < 0.4) {
    const bw = Math.min(w - 0.2, 2.4);
    const r = Math.random();
    const [kind, bh] = r < 0.3 ? ['word', bw / 4] : r < 0.55 ? ['logo', Math.min(bw, 1.6)] : r < 0.7 ? ['tower', bw * 1.4] : ['h', bw / 2];
    const bwr = kind === 'logo' ? bh : bw;
    const by = snap(rand(2 + bh / 2, Math.max(2.2 + bh / 2, h - bh / 2 - 0.3)));
    box(p, bwr + 0.12, bh + 0.12, 0.06, 0x1d1e30, cx, by, front + 0.03);
    sign(p, bwr, bh, 0.04, kind, ri(TX.SIGN_COUNT[kind]), cx, by, front + 0.07);
  }

  // rooftop garden in the eco district
  if (D.gardens && Math.random() < 0.6) {
    box(p, w - 0.2, 0.2, d - 0.2, 0x4cbf4f, cx, h + 0.2, 0);
    for (let i = 0; i < 2; i++) box(p, 0.4, 0.45, 0.4, pick([0x3fae49, 0x5ad15a]), x0 + 0.4 + i * (w - 0.8), h + 0.52, 0);
    return;
  }
  // setback tower, rooftop logo, water tank or AC units
  const roll = Math.random();
  if (h > 5 && roll < 0.45) {
    const w2 = snap(w * rand(0.5, 0.75)), h2 = snap(rand(1.5, 4));
    box(p, w2, h2, d * 0.8, fm, cx, h + h2 / 2, -0.05);
    box(p, w2 + 0.02, 0.1, d * 0.8 + 0.02, ROOF, cx, h + h2 + 0.05, -0.05);
    if (Math.random() < 0.6) {
      box(p, 0.08, 1.4, 0.08, 0x9aa0c0, cx, h + h2 + 0.75, -0.05);
      box(p, 0.14, 0.14, 0.14, 0xff2b4a, cx, h + h2 + 1.5, -0.05, true);
    }
  } else if (roll < 0.65 && w >= 2) {
    // rooftop RENT ROBOT sign, NYC style
    const bw = Math.min(w - 0.1, 3), bh = bw / 4;
    for (const dx of [-bw / 3, bw / 3]) box(p, 0.06, 0.5, 0.06, 0x3a3d55, cx + dx, h + 0.35, 0);
    sign(p, bw, bh, 0.06, 'word', ri(TX.SIGN_COUNT.word), cx, h + 0.6 + bh / 2, 0);
  } else if (roll < 0.85) {
    const tx = x0 + 0.4 + Math.random() * Math.max(0, w - 0.8);
    for (const dx of [-0.15, 0.15]) box(p, 0.05, 0.3, 0.05, 0x3a3d55, tx + dx, h + 0.25, 0);
    box(p, 0.46, 0.5, 0.46, 0x7a5a40, tx, h + 0.65, 0);
    box(p, 0.3, 0.14, 0.3, 0x5a4030, tx, h + 0.97, 0);
  } else {
    for (let i = 0; i < 2; i++) box(p, 0.4, 0.25, 0.35, 0x9aa0c0, x0 + 0.35 + i * 0.5, h + 0.22, -0.15);
  }
}

// Elevated monorail line crossing over the street (decoration, like the concept art).
export const VIADUCT_Y = 5.9; // low enough to be in view, still above the chase camera
export function viaduct(p) {
  const y = VIADUCT_Y;
  // deck with side girders and a truss
  box(p, 60, 0.36, 1.0, 0x5a5f8a, 0, y - 0.18, 0);
  box(p, 60, 0.1, 0.34, 0x3a3d5a, 0, y + 0.05, 0);
  for (const z of [-0.54, 0.54]) {
    box(p, 60, 0.12, 0.1, 0x4a4f78, 0, y - 0.32, z);
    box(p, 60, 0.08, 0.1, 0x4a4f78, 0, y + 0.3, z);
    for (let x = -30; x < 30; x += 1) {
      box(p, 0.06, 0.6, 0.06, 0x6a6f98, x, y, z);
      const d = box(p, 0.06, 0.85, 0.05, 0x6a6f98, x + 0.5, y, z);
      d.rotation.z = (Math.round(x) % 2 ? 1 : -1) * 0.95;
    }
    box(p, 60, 0.04, 0.03, 0x35e6ff, 0, y - 0.37, z, true);
  }
  // lamps along the deck
  for (let x = -27; x < 30; x += 6) {
    box(p, 0.06, 0.5, 0.06, 0x3a3d55, x, y + 0.5, 0.5);
    box(p, 0.16, 0.08, 0.16, 0xfff1a8, x, y + 0.76, 0.5, true);
  }
  // arched piers with neon rings
  for (const x of [-12, -3.85, 3.85, 12]) {
    box(p, 0.9, 0.3, 0.9, 0x5a5f8a, x, 0.15, 0);
    box(p, 0.46, y - 0.7, 0.56, 0x6a6f98, x, (y - 0.4) / 2, 0);
    for (const ny of [1.2, 2.6, 4.0]) if (ny < y - 0.6) box(p, 0.5, 0.06, 0.6, ny === 1.2 ? 0xff4fd8 : 0x35e6ff, x, ny, 0, true);
    box(p, 1.3, 0.3, 1.0, 0x5a5f8a, x, y - 0.5, 0);
    for (const s of [-1, 1]) {
      const br = box(p, 0.12, 1.0, 0.4, 0x6a6f98, x + s * 0.42, y - 0.85, 0);
      br.rotation.z = s * 0.6;
    }
  }
}

// Street lamp with a hanging neon banner (outside the playfield).
export function bannerLamp(p, x, z = 0) {
  const s = x > 0 ? -1 : 1;
  box(p, 0.26, 0.1, 0.26, 0x55597a, x, 0.05, z);
  box(p, 0.1, 2.2, 0.1, 0x6d7194, x, 1.1, z);
  box(p, 0.6, 0.07, 0.1, 0x6d7194, x + s * 0.25, 2.2, z);
  box(p, 0.3, 0.05, 0.16, 0x35e6ff, x + s * 0.45, 2.15, z, true);
  box(p, 0.42, 0.04, 0.04, 0x3a3d55, x + s * 0.21, 1.85, z);
  sign(p, 0.36, 0.56, 0.03, 'tower', ri(TX.SIGN_COUNT.tower), x + s * 0.25, 1.52, z);
}

// A flying car for the sky.
export function makeSkyCar() {
  return makeVehicle(pick(['hovercar', 'hovercar', 'hovertruck']));
}

// ---------------------------------------------------------------- district props
export function container(p, x, z = 0) {
  const c = pick([0xd84a3a, 0x2b6bff, 0x3dbf6a, 0xffa21a]);
  box(p, 0.86, 0.75, 0.8, c, x, 0.375, z);
  for (let i = -3; i <= 3; i++) box(p, 0.02, 0.7, 0.81, shadeHex(c, 0.75), x + i * 0.12, 0.375, z);
  box(p, 0.88, 0.06, 0.82, shadeHex(c, 0.7), x, 0.75, z);
}

export function lanternPost(p, x, z = 0) {
  box(p, 0.26, 0.1, 0.26, 0x3a1a1a, x, 0.05, z);
  box(p, 0.1, 1.5, 0.1, 0x5a1a1a, x, 0.75, z);
  box(p, 0.5, 0.06, 0.08, 0x5a1a1a, x, 1.5, z);
  for (const dx of [-0.2, 0.2]) {
    box(p, 0.02, 0.12, 0.02, 0x222222, x + dx, 1.42, z);
    box(p, 0.2, 0.26, 0.2, 0xff3a3a, x + dx, 1.24, z, true);
    box(p, 0.22, 0.04, 0.22, 0x2a1010, x + dx, 1.38, z);
  }
}

export function grassPlanter(p, x, z = 0) {
  box(p, 0.8, 0.25, 0.8, 0x6d7194, x, 0.125, z);
  box(p, 0.72, 0.1, 0.72, 0x4cbf4f, x, 0.3, z);
  for (const [dx, dz] of [[-0.2, -0.15], [0.15, 0.2], [0.2, -0.2]]) box(p, 0.12, 0.3, 0.12, pick([0x5ad15a, 0x3fae49]), x + dx, 0.45, z + dz);
}

export function pipes(p, x, z = 0) {
  for (const dz of [-0.2, 0.2]) box(p, 0.9, 0.22, 0.22, 0x9a8a7a, x, 0.2 + (dz > 0 ? 0.25 : 0), z + dz);
  box(p, 0.12, 0.7, 0.6, 0x6a5a4a, x - 0.35, 0.35, z);
  box(p, 0.92, 0.04, 0.24, 0xffc21a, x, 0.32, z - 0.2);
}

// Neon arch over the street at a district border.
export function gate(p, name, fg, bg, neon) {
  for (const s of [-1, 1]) {
    box(p, 0.5, 6.4, 0.5, 0x2a2c48, s * 3.85, 3.2, 0);
    box(p, 0.52, 0.06, 0.52, neon, s * 3.85, 1.0, 0, true);
    box(p, 0.06, 5.0, 0.06, neon, s * 3.85 - s * 0.26, 3.4, 0.2, true);
  }
  box(p, 8.4, 0.5, 0.5, 0x2a2c48, 0, 6.45, 0);
  box(p, 8.42, 0.05, 0.52, neon, 0, 6.2, 0, true);
  const sign = new THREE.Mesh(geo(5, 0.95, 0.06, false), TX.gateMat(name, fg, bg));
  sign.position.set(0, 6.45, 0.3);
  p.add(sign);
}

// ---------------------------------------------------------------- hazards
const BEAM_Y = [0.3, 0.65, 1.0];

// Laser fence emitter: a metal pylon with three emitter heads facing the street.
export function laserPylon(p, x) {
  const s = x > 0 ? -1 : 1;
  box(p, 0.56, 0.06, 0.56, 0x3a3d55, x, 0.03, 0);
  for (let i = 0; i < 4; i++) box(p, 0.14, 0.01, 0.56, i % 2 ? 0x1f2028 : 0xffc21a, x - 0.21 + i * 0.14, 0.065, 0);
  box(p, 0.3, 1.32, 0.3, 0x2a2c48, x, 0.72, 0);
  box(p, 0.06, 1.2, 0.32, 0x3a3e66, x - s * 0.13, 0.72, 0);
  for (const y of [0.12, 0.48, 0.83, 1.18]) box(p, 0.34, 0.04, 0.34, 0x8a8fb8, x, y, 0);
  box(p, 0.36, 0.1, 0.36, 0x3a3d55, x, 1.42, 0);
  box(p, 0.16, 0.1, 0.16, 0xffa21a, x, 1.52, 0, true);
  box(p, 0.03, 1.05, 0.05, 0xff2b4a, x + s * 0.155, 0.66, 0.1, true);
  box(p, 0.03, 1.05, 0.05, 0xff2b4a, x + s * 0.155, 0.66, -0.1, true);
  for (const y of BEAM_Y) {
    box(p, 0.16, 0.16, 0.2, 0x1a1a22, x + s * 0.2, y, 0);
    box(p, 0.06, 0.2, 0.06, 0x8a8fb8, x + s * 0.2, y, 0.12);
    box(p, 0.06, 0.2, 0.06, 0x8a8fb8, x + s * 0.2, y, -0.12);
    box(p, 0.02, 0.1, 0.1, 0xff6a7a, x + s * 0.285, y, 0, true);
  }
}

// Yellow/black hazard edge along a lane.
export function hazardEdge(p, z, width) {
  for (let x = -width / 2, i = 0; x < width / 2; x += 0.5, i++) box(p, 0.5, 0.02, 0.08, i % 2 ? 0x1f2028 : 0xffc21a, x + 0.25, 0.005, z);
}

const ADD = (color, opacity) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
});

// Layered beams (white core, red body, soft halo), end flares, floor glow and
// dashed "targeting" lines for the warning phase. Materials are per lane.
export function makeLaserBeams(span) {
  const g = new THREE.Group();
  const core = ADD(0xffe0ea, 0);
  const inner = ADD(0xff3050, 0);
  const halo = ADD(0xff2b4a, 0);
  const flare = ADD(0xff6a7a, 0);
  const floor = ADD(0xff2b4a, 0);
  const dash = ADD(0xff4060, 0);
  const beams = [];
  const dashes = new THREE.Group();
  for (const y of BEAM_Y) {
    const c = new THREE.Mesh(geo(span, 0.025, 0.025, false), core);
    const i = new THREE.Mesh(geo(span, 0.07, 0.07, false), inner);
    const h = new THREE.Mesh(geo(span, 0.24, 0.24, false), halo);
    for (const m of [c, i, h]) { m.position.y = y; m.renderOrder = 5; g.add(m); }
    beams.push(i, h);
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(geo(0.18, 0.18, 0.18, false), flare);
      f.position.set(s * span / 2, y, 0);
      f.rotation.set(0.6, 0.6, 0);
      g.add(f);
    }
    for (let x = -span / 2; x < span / 2 - 0.2; x += 0.4) {
      const d = new THREE.Mesh(geo(0.18, 0.02, 0.02, false), dash);
      d.position.set(x, y, 0);
      dashes.add(d);
    }
  }
  g.add(dashes);
  const f = new THREE.Mesh(geo(span, 0.01, 0.6, false), floor);
  f.position.y = 0.012;
  g.add(f);
  return { group: g, core, inner, halo, flare, floor, dash, dashes, beams };
}

// One drone rotor: guard ring, motor and spinning blades (returned for animation).
function rotor(parent, x, z, color) {
  box(parent, 0.08, 0.08, 0.08, 0x55597a, x, 0.02, z);
  for (const [w, d, dx, dz] of [[0.38, 0.03, 0, 0.19], [0.38, 0.03, 0, -0.19], [0.03, 0.38, 0.19, 0], [0.03, 0.38, -0.19, 0]]) {
    box(parent, w, 0.03, d, 0x3a3d55, x + dx, 0.07, z + dz);
  }
  box(parent, 0.4, 0.015, 0.04, color, x, 0.07, z + 0.19, true);
  const spin = new THREE.Group();
  spin.position.set(x, 0.08, z);
  box(spin, 0.34, 0.012, 0.05, 0xc9ccd8);
  box(spin, 0.05, 0.012, 0.34, 0xc9ccd8);
  const blur = new THREE.Mesh(geo(0.34, 0.004, 0.34, false), ADD(0xb8c0ff, 0.12));
  spin.add(blur);
  parent.add(spin);
  return spin;
}

// Patrol drone: quadcopter with a camera head and a red searchlight. Touching the light = capture.
export function makePatrol() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 1.2;
  g.add(body);
  const frame = new THREE.Group();
  body.add(frame);
  box(frame, 0.5, 0.15, 0.42, 0x2a2c48);
  box(frame, 0.4, 0.05, 0.34, 0x3a3e66, 0, 0.1, 0);
  box(frame, 0.2, 0.08, 0.2, 0x35e6ff, 0, 0.16, 0, true);
  box(frame, 0.52, 0.03, 0.44, 0xff2b4a, 0, -0.03, 0, true);
  for (const s of [-1, 1]) {
    box(frame, 0.04, 0.16, 0.04, 0x55597a, s * 0.15, -0.14, 0);
    box(frame, 0.04, 0.03, 0.42, 0x55597a, s * 0.15, -0.22, 0);
  }
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const arm = box(frame, 0.42, 0.05, 0.06, 0x3a3d55, sx * 0.24, 0.04, sz * 0.2);
    arm.rotation.y = sx * sz * -0.7;
  }
  bake(frame);
  const rotors = [[1, 1], [1, -1], [-1, 1], [-1, -1]].map(([sx, sz]) => rotor(body, sx * 0.4, sz * 0.36, 0xff6a7a));
  // swivelling camera head
  const head = new THREE.Group();
  head.position.set(0, -0.12, 0.12);
  box(head, 0.16, 0.12, 0.14, 0x1a1a22);
  box(head, 0.08, 0.08, 0.02, 0xff2b4a, 0, 0, 0.08, true);
  box(head, 0.03, 0.03, 0.025, 0xffffff, 0.02, 0.02, 0.09, true);
  body.add(head);
  // searchlight
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.05, 14, 1, true), ADD(0xff2b4a, 0.14));
  cone.position.y = 0.6;
  const coneIn = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.05, 10, 1, true), ADD(0xff8090, 0.12));
  coneIn.position.y = 0.6;
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), ADD(0xff2b4a, 0.45));
  spot.rotation.x = -Math.PI / 2;
  spot.position.y = 0.015;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.52, 24), ADD(0xffc0c8, 0.6));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.017;
  g.add(cone, coneIn, spot, ring);
  g.userData = { body, head, rotors, spot };
  return g;
}

// Security scanner: armoured drone that sweeps a red curtain with a moving scan line.
export function makeScanner() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 2.2;
  g.add(body);
  const hull = new THREE.Group();
  body.add(hull);
  box(hull, 0.72, 0.22, 0.5, 0x2a2c48);
  box(hull, 0.56, 0.08, 0.4, 0x3a3e66, 0, 0.14, 0);
  for (let i = 0; i < 6; i++) box(hull, 0.12, 0.08, 0.52, i % 2 ? 0x1f2028 : 0xffc21a, -0.3 + i * 0.12, -0.04, 0);
  box(hull, 0.26, 0.12, 0.26, 0x1a1a22, 0, -0.16, 0);
  box(hull, 0.18, 0.03, 0.18, 0xff2b4a, 0, -0.23, 0, true);
  box(hull, 0.24, 0.06, 0.02, 0xff2b4a, 0, 0.02, 0.26, true);
  for (const s of [-1, 1]) {
    box(hull, 0.1, 0.06, 0.08, 0x3a3d55, s * 0.42, 0.04, 0);
    box(hull, 0.12, 0.14, 0.24, 0x2a2c48, s * 0.52, 0.0, 0);
    box(hull, 0.13, 0.03, 0.25, 0x35e6ff, s * 0.52, -0.08, 0, true);
  }
  bake(hull);
  const rotors = [-1, 1].map((s) => rotor(body, s * 0.52, 0, 0x35e6ff));
  // light curtain
  const H = 2.08;
  const curtain = new THREE.Mesh(geo(0.04, H, 0.9, false), ADD(0xff2b4a, 0.5));
  curtain.position.y = H / 2;
  const glow = new THREE.Mesh(geo(0.32, H, 0.92, false), ADD(0xff2b4a, 0.12));
  glow.position.y = H / 2;
  const edges = new THREE.Group();
  for (const z of [-0.45, 0.45]) {
    const e = new THREE.Mesh(geo(0.06, H, 0.03, false), ADD(0xffb0c0, 0.7));
    e.position.set(0, H / 2, z);
    edges.add(e);
  }
  const scanline = new THREE.Mesh(geo(0.1, 0.05, 0.92, false), ADD(0xffffff, 0.8));
  const line = new THREE.Mesh(geo(0.12, 0.01, 0.95, false), ADD(0xff8090, 0.8));
  line.position.y = 0.015;
  const spot = new THREE.Mesh(geo(0.6, 0.008, 1.0, false), ADD(0xff2b4a, 0.25));
  spot.position.y = 0.012;
  g.add(curtain, glow, edges, scanline, line, spot);
  g.userData = { body, rotors, scanline };
  return g;
}

// Electrified floor panel; its centre material is swapped by the game (off / warning / on).
export function shockTile(p, x) {
  for (const dz of [-0.44, 0.44]) box(p, 0.92, 0.02, 0.04, 0x35e6ff, x, 0.012, dz, true);
  for (const dx of [-0.44, 0.44]) box(p, 0.04, 0.02, 0.92, 0x35e6ff, x + dx, 0.012, 0, true);
  box(p, 0.3, 0.03, 0.06, 0xffc21a, x, 0.015, 0.3);
}
export const SHOCK_MATS = {
  off: mat(0x23314f),
  warn: mat(0xffd21f, true),
  on: mat(0xbff8ff, true),
};

// ---------------------------------------------------------------- water
// Soft dark patch under floating things (grounds them on the water, no bright spot).
const WATER_SHADOW = new THREE.MeshBasicMaterial({ color: 0x06142e, transparent: true, opacity: 0.18, depthWrite: false });
const WAKE = new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.3, depthWrite: false });

function waterShadow(g, w, d) {
  // soft oval, not a square
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.5, 20), WATER_SHADOW);
  m.rotation.x = -Math.PI / 2;
  m.scale.set(w, d, 1);
  m.position.y = -0.345;
  g.add(m);
}

// Thin V-shaped wake trailing behind the stern.
function wake(g, x) {
  for (const s of [-1, 1]) {
    const m = new THREE.Mesh(geo(0.9, 0.01, 0.035, false), WAKE);
    m.position.set(x - 0.4, -0.34, s * 0.22);
    m.rotation.y = s * 0.28;
    g.add(m);
  }
}

// Boat you can ride across a canal. The walkable deck spans the boat's `len` cells (y = 0);
// the pointed bow (+x) and the motor (-x) stick out beyond them.
export function makeBoat(len, opts = {}) {
  const g = new THREE.Group();
  const kind = opts.kind ?? pick(['taxi', 'white', 'red', 'barge']);
  const hull = { taxi: 0xf6c12b, white: 0xeef0f8, red: 0xd84a3a, barge: 0x3a3e5a, ferry: 0x1f2340 }[kind];
  const L = len - 0.06;
  if (kind === 'barge' || kind === 'ferry') {
    // flat-nosed working boat
    box(g, L + 0.3, 0.32, 0.86, hull, 0, -0.2, 0);
    box(g, L + 0.32, 0.06, 0.88, 0x2a2026, 0, -0.33, 0);
    for (let x = -L / 2; x < L / 2; x += 0.6) for (const z of [-0.44, 0.44]) box(g, 0.2, 0.14, 0.05, 0x1a1a1a, x + 0.3, -0.18, z);
    box(g, L + 0.32, 0.04, 0.89, kind === 'ferry' ? 0xff4fd8 : 0xffa21a, 0, -0.08, 0, true);
    box(g, L, 0.05, 0.74, 0x55597a, 0, -0.04, 0);
    for (let x = -L / 2, i = 0; x < L / 2 - 0.2; x += 0.3, i++) for (const z of [-0.34, 0.34]) box(g, 0.3, 0.02, 0.05, i % 2 ? 0x1f2028 : 0xffc21a, x + 0.15, -0.01, z);
    for (const s of [-1, 1]) {
      box(g, 0.12, 0.14, 0.12, 0x2a2c48, s * (L / 2 + 0.08), 0.03, 0.28);
      box(g, 0.12, 0.14, 0.12, 0x2a2c48, s * (L / 2 + 0.08), 0.03, -0.28);
    }
    if (kind === 'ferry') for (const z of [-0.43, 0.43]) box(g, L, 0.03, 0.03, 0x35e6ff, 0, 0.12, z, true);
  } else {
    box(g, L, 0.3, 0.84, hull, 0, -0.2, 0);
    // pointed bow in narrowing steps
    for (const [x, w, d] of [[0.12, 0.24, 0.72], [0.32, 0.2, 0.52], [0.5, 0.18, 0.3]]) box(g, w, 0.3 - x * 0.12, d, hull, L / 2 + x, -0.2 + x * 0.05, 0);
    box(g, L + 0.5, 0.05, 0.86, 0x1f2028, 0.15, -0.33, 0);
    box(g, L + 0.02, 0.03, 0.85, 0x35e6ff, 0, -0.22, 0, true);
    box(g, L, 0.05, 0.7, 0xa87a4a, 0, -0.04, 0);
    for (let x = -L / 2 + 0.15; x < L / 2; x += 0.22) box(g, 0.02, 0.055, 0.7, 0x7a5233, x, -0.035, 0);
    // gunwales
    for (const z of [-0.4, 0.4]) box(g, L, 0.08, 0.05, hull, 0, 0.0, z);
    // windshield on the bow
    box(g, 0.06, 0.22, 0.6, 0x1a2240, L / 2 + 0.18, 0.1, 0);
    box(g, 0.07, 0.03, 0.62, 0xc9ccd8, L / 2 + 0.18, 0.22, 0);
    if (kind === 'taxi') sign(g, 0.08, 0.12, 0.34, 'h', 5, L / 2 + 0.18, 0.32, 0);
    // outboard motor
    box(g, 0.22, 0.36, 0.26, 0x2a2c48, -L / 2 - 0.14, -0.08, 0);
    box(g, 0.24, 0.06, 0.28, hull, -L / 2 - 0.14, 0.1, 0);
    box(g, 0.06, 0.25, 0.08, 0x55597a, -L / 2 - 0.2, -0.32, 0);
    for (const s of [-1, 1]) box(g, 0.05, 0.06, 0.1, s > 0 ? 0xfff1a8 : 0xff3355, s * (L / 2 + 0.5) - (s < 0 ? 0.2 : 0), -0.1, 0, true);
  }
  bake(g);
  waterShadow(g, L + 0.9, 1.0);
  wake(g, -L / 2 - 0.3);
  g.userData = { len, kind: 'boat' };
  return g;
}

// Anchored round pontoon you can hop on (a "lily pad"): rubber ring, deck and a glowing rim.
export function makeBuoy() {
  const g = new THREE.Group();
  for (const r of [0, Math.PI / 4]) {
    box(g, 0.84, 0.2, 0.84, 0x2a2c48, 0, -0.2, 0).rotation.y = r;
    box(g, 0.86, 0.06, 0.86, 0xff7a1a, 0, -0.08, 0).rotation.y = r;
    box(g, 0.66, 0.05, 0.66, 0x8a8fb8, 0, -0.03, 0).rotation.y = r;
    box(g, 0.88, 0.02, 0.88, 0x35e6ff, 0, -0.13, 0, true).rotation.y = r;
  }
  box(g, 0.3, 0.02, 0.3, 0xffd21f, 0, 0.0, 0, true);
  bake(g);
  waterShadow(g, 1.15, 1.15);
  g.userData = { len: 1 };
  return g;
}

// Bascule bridge over a canal: two leaves hinged at the banks. Returns the leaves to animate.
export function liftBridge(p, cx, width) {
  const leaves = [1, -1].map((s) => {
    // s = +1: south leaf hinged at z = +0.5; s = -1: north leaf hinged at z = -0.5
    const pivot = new THREE.Group();
    pivot.position.set(cx, 0, s * 0.5);
    const leaf = new THREE.Group();
    leaf.position.z = -s * 0.25;
    box(leaf, width, 0.12, 0.5, 0x6a6f98, 0, -0.06, 0);
    box(leaf, width - 0.1, 0.02, 0.46, 0x8a8fb8, 0, 0.005, 0);
    for (const x of [-width / 2 + 0.05, width / 2 - 0.05]) {
      box(leaf, 0.05, 0.25, 0.5, 0x3a3d55, x, 0.12, 0);
      box(leaf, 0.06, 0.03, 0.5, 0xffc21a, x, 0.26, 0);
    }
    box(leaf, width, 0.03, 0.04, 0xffc21a, 0, 0.01, -s * 0.24, true);
    bake(leaf);
    pivot.add(leaf);
    p.add(pivot);
    return pivot;
  });
  // operator posts with signal lights on both banks
  const lights = [];
  for (const sx of [-1, 1]) {
    const x = cx + sx * (width / 2 + 0.25);
    for (const z of [0.42, -0.42]) {
      box(p, 0.16, 1.1, 0.16, 0x3a3d55, x, 0.55, z);
      box(p, 0.26, 0.3, 0.2, 0x1d1e28, x, 1.15, z);
      lights.push(box(p, 0.14, 0.14, 0.04, 0x3dff7a, x, 1.15, z + (z > 0 ? 0.11 : -0.11), true));
    }
  }
  return { leaves, lights };
}

export function fountain(p, x, z = 0) {
  box(p, 0.9, 0.26, 0.9, 0xb8bcd8, x, 0.13, z);
  box(p, 0.76, 0.04, 0.76, 0x5ab8ff, x, 0.25, z, true);
  box(p, 0.16, 0.5, 0.16, 0xb8bcd8, x, 0.4, z);
  box(p, 0.42, 0.08, 0.42, 0xb8bcd8, x, 0.66, z);
  box(p, 0.34, 0.03, 0.34, 0x5ab8ff, x, 0.7, z, true);
  box(p, 0.06, 0.32, 0.06, 0xbff8ff, x, 0.86, z, true);
  for (const [dx, dz] of [[0.18, 0], [-0.18, 0], [0, 0.18], [0, -0.18]]) box(p, 0.04, 0.3, 0.04, 0x9fe0ff, x + dx * 1.3, 0.45, z + dz * 1.3, true);
}

// ---------------------------------------------------------------- parks
let sakura = false;
export function setSakura(on) { sakura = on; }

export function parkTree(p, x, z = 0) {
  const h = rand(0.35, 0.7);
  box(p, 0.22, h, 0.22, 0x7a5233, x, h / 2, z);
  const leaves = sakura ? [0xffa8d8, 0xff8ac8, 0xffc0e0] : [0x4cbf4f, 0x5ad15a, 0x3fae49, 0x6ad86a];
  const c = pick(leaves);
  box(p, 0.9, 0.7, 0.9, c, x, h + 0.35, z);
  box(p, 0.62, 0.4, 0.62, pick(leaves), x + 0.06, h + 0.85, z - 0.04);
  if (Math.random() < 0.5) box(p, 0.4, 0.3, 0.4, c, x - 0.25, h + 0.25, z + 0.2);
}

export function hedge(p, x, z = 0, w = 0.9) {
  box(p, w, 0.5, 0.8, pick([0x3fae49, 0x46b84e]), x, 0.25, z);
  box(p, w * 0.9, 0.06, 0.7, 0x5ad15a, x, 0.52, z);
}

export function flowerBed(p, x, z = 0) {
  box(p, 0.85, 0.12, 0.85, 0x6a4a30, x, 0.06, z);
  for (let i = 0; i < 6; i++) {
    const dx = rand(-0.32, 0.32), dz = rand(-0.32, 0.32);
    box(p, 0.04, 0.14, 0.04, 0x3a9a3f, x + dx, 0.18, z + dz);
    box(p, 0.12, 0.1, 0.12, pick([0xff6fd8, 0xffd21f, 0xff4f6a, 0xb46bff, 0xffffff]), x + dx, 0.28, z + dz);
  }
}

export function parkLamp(p, x, z = 0) {
  box(p, 0.2, 0.08, 0.2, 0x3a3d55, x, 0.04, z);
  box(p, 0.08, 1.3, 0.08, 0x3a3d55, x, 0.65, z);
  box(p, 0.26, 0.26, 0.26, 0x2a2c48, x, 1.4, z);
  box(p, 0.2, 0.2, 0.2, 0xfff1a8, x, 1.4, z, true);
  box(p, 0.3, 0.04, 0.3, 0x3a3d55, x, 1.55, z);
}

// Statue of the hero robot on a pedestal.
export function statue(p, x, z = 0) {
  box(p, 0.8, 0.3, 0.8, 0x9a9eb8, x, 0.15, z);
  box(p, 0.7, 0.06, 0.7, 0xb8bcd8, x, 0.33, z);
  const S = 0xc0c4d8;
  for (const s of [-1, 1]) box(p, 0.12, 0.3, 0.14, S, x + s * 0.09, 0.51, z);
  box(p, 0.36, 0.28, 0.24, S, x, 0.8, z);
  for (const s of [-1, 1]) box(p, 0.1, 0.26, 0.11, S, x + s * 0.24, 0.8, z);
  box(p, 0.32, 0.28, 0.28, 0xa8acc4, x, 1.1, z);
  for (const s of [-1, 1]) box(p, 0.05, 0.1, 0.02, 0x35e6ff, x + s * 0.06, 1.11, z + 0.145, true);
}

export function pond(p, x, z = 0, w = 1.6) {
  box(p, w + 0.2, 0.1, 0.92, 0x9a9eb8, x, 0.02, z);
  box(p, w, 0.04, 0.76, 0x3f8ef0, x, 0.06, z, true);
  box(p, 0.3, 0.02, 0.3, 0x4cbf4f, x + w * 0.25, 0.09, z - 0.1);
}

// ---------------------------------------------------------------- big park
export function gazebo(p, x, z = 0) {
  box(p, 0.9, 0.08, 0.9, 0xd8d0c0, x, 0.04, z);
  for (const [dx, dz] of [[0.36, 0.36], [-0.36, 0.36], [0.36, -0.36], [-0.36, -0.36]]) box(p, 0.08, 0.9, 0.08, 0xeef0f6, x + dx, 0.5, z + dz);
  box(p, 1.0, 0.1, 1.0, 0x6a3a5a, x, 0.98, z);
  box(p, 0.7, 0.14, 0.7, 0x7a4a6a, x, 1.1, z);
  box(p, 0.36, 0.14, 0.36, 0x8a5a7a, x, 1.24, z);
  box(p, 0.08, 0.2, 0.08, 0xffd21f, x, 1.38, z, true);
  box(p, 1.02, 0.03, 1.02, 0xff9be0, x, 0.92, z, true);
}

export function slide(p, x, z = 0) {
  box(p, 0.08, 0.8, 0.08, 0x2b6bff, x - 0.3, 0.4, z - 0.2);
  box(p, 0.08, 0.8, 0.08, 0x2b6bff, x - 0.3, 0.4, z + 0.2);
  box(p, 0.3, 0.06, 0.5, 0xffc21a, x - 0.3, 0.8, z);
  const s = box(p, 0.8, 0.05, 0.36, 0xff4f6a, x + 0.08, 0.45, z);
  s.rotation.z = -0.75;
  for (let i = 0; i < 4; i++) box(p, 0.04, 0.03, 0.4, 0xc9ccd8, x - 0.42, 0.15 + i * 0.18, z);
}

export function swings(p, x, z = 0) {
  for (const s of [-1, 1]) {
    const a = box(p, 0.06, 1.0, 0.06, 0x3dbf6a, x + s * 0.4, 0.5, z - 0.15);
    a.rotation.x = 0.25;
    const b = box(p, 0.06, 1.0, 0.06, 0x3dbf6a, x + s * 0.4, 0.5, z + 0.15);
    b.rotation.x = -0.25;
  }
  box(p, 0.9, 0.06, 0.06, 0x3dbf6a, x, 0.98, z);
  for (const dx of [-0.18, 0.18]) {
    box(p, 0.02, 0.6, 0.02, 0x9aa0c0, x + dx - 0.08, 0.66, z);
    box(p, 0.02, 0.6, 0.02, 0x9aa0c0, x + dx + 0.08, 0.66, z);
    box(p, 0.2, 0.04, 0.12, 0xff6a2a, x + dx, 0.36, z);
  }
}

// A small pond filling one cell (an obstacle) with lily pads.
export function pondCell(p, x, z = 0) {
  box(p, 0.96, 0.08, 0.96, 0x9a9eb8, x, 0.04, z);
  box(p, 0.82, 0.04, 0.82, 0x3f8ef0, x, 0.07, z, true);
  box(p, 0.18, 0.02, 0.18, 0x4cbf4f, x + 0.18, 0.1, z - 0.12);
  box(p, 0.14, 0.02, 0.14, 0x5ad15a, x - 0.2, 0.1, z + 0.15);
  box(p, 0.06, 0.04, 0.06, 0xff9be0, x + 0.18, 0.12, z - 0.12);
}

export function roundBed(p, x, z = 0) {
  box(p, 0.86, 0.14, 0.6, 0xd8d0c0, x, 0.07, z);
  box(p, 0.6, 0.14, 0.86, 0xd8d0c0, x, 0.07, z);
  box(p, 0.76, 0.06, 0.5, 0x6a4a30, x, 0.16, z);
  box(p, 0.5, 0.06, 0.76, 0x6a4a30, x, 0.16, z);
  const c = pick([[0xff4f6a, 0xffd21f], [0xb46bff, 0xffffff], [0xff6fd8, 0xff9be0]]);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    box(p, 0.12, 0.12, 0.12, c[i % 2], x + Math.cos(a) * 0.26, 0.25, z + Math.sin(a) * 0.26);
  }
  box(p, 0.16, 0.22, 0.16, 0x3fae49, x, 0.28, z);
}

// Robotic lawn mower: patrols a park row; touching it is fatal.
export function makeMower() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  box(body, 0.6, 0.18, 0.5, 0x3dbf6a, 0, 0.17, 0);
  box(body, 0.5, 0.06, 0.4, 0x2a2c48, 0, 0.29, 0);
  box(body, 0.2, 0.06, 0.02, 0xff2b4a, 0.2, 0.2, 0.26, true);
  box(body, 0.04, 0.2, 0.04, 0xc9ccd8, -0.2, 0.42, 0);
  box(body, 0.1, 0.06, 0.1, 0xffd21f, -0.2, 0.54, 0, true);
  for (const x of [-0.22, 0.22]) for (const z of [-0.27, 0.27]) box(body, 0.16, 0.16, 0.06, 0x1a1a22, x, 0.08, z);
  bake(body);
  const blade = new THREE.Mesh(geo(0.5, 0.01, 0.5, false), new THREE.MeshBasicMaterial({ color: 0xff6a7a, transparent: true, opacity: 0.4, depthWrite: false }));
  blade.position.y = 0.03;
  g.add(blade);
  g.userData = { body, blade, mower: true };
  return g;
}

// Delivery robot rolling along the sidewalk (behaves like a pedestrian).
export function makeCourier() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  box(body, 0.42, 0.34, 0.5, 0xeef0f6, 0, 0.3, 0);
  box(body, 0.44, 0.06, 0.52, 0xffc21a, 0, 0.42, 0);
  box(body, 0.3, 0.12, 0.02, 0x1a2240, 0, 0.3, 0.26);
  for (const s of [-1, 1]) box(body, 0.06, 0.04, 0.02, 0x35e6ff, s * 0.07, 0.31, 0.27, true);
  for (const x of [-0.16, 0.16]) for (const z of [-0.18, 0, 0.18]) box(body, 0.06, 0.12, 0.12, 0x1a1a22, x * 1.4, 0.07, z);
  box(body, 0.02, 0.5, 0.02, 0xc9ccd8, -0.15, 0.7, -0.18);
  box(body, 0.16, 0.1, 0.02, 0xff4f6a, -0.07, 0.9, -0.18, true);
  bake(body);
  return { root, body, legs: [] };
}

// ---------------------------------------------------------------- construction site
// Tower crane on one side; the jib reaches over the street at height `h`.
export function craneTower(p, x, h, reach) {
  const s = x > 0 ? -1 : 1; // jib points towards the street
  for (const dx of [-0.3, 0.3]) for (const dz of [-0.3, 0.3]) box(p, 0.08, h, 0.08, 0xffc21a, x + dx, h / 2, dz);
  for (let y = 0.6; y < h; y += 0.8) {
    box(p, 0.64, 0.05, 0.05, 0xe0a810, x, y, 0.3);
    box(p, 0.05, 0.05, 0.64, 0xe0a810, x + 0.3, y, 0);
    const d = box(p, 0.85, 0.04, 0.04, 0xe0a810, x, y + 0.4, 0.3);
    d.rotation.z = 0.78;
  }
  box(p, 0.9, 0.5, 0.9, 0x2a2c48, x, 0.25, 0);
  box(p, 0.7, 0.5, 0.6, 0xeef0f6, x, h + 0.25, 0.2);
  box(p, 0.5, 0.25, 0.02, 0x1a2240, x, h + 0.3, 0.51);
  box(p, reach, 0.3, 0.3, 0xffc21a, x + s * reach / 2, h + 0.6, 0);
  box(p, 3, 0.25, 0.3, 0xffc21a, x - s * 1.6, h + 0.6, 0);
  box(p, 0.9, 0.7, 0.6, 0x8a8ea8, x - s * 2.6, h + 0.25, 0);
  box(p, 0.12, 1.4, 0.12, 0xffc21a, x, h + 1.3, 0);
  box(p, 0.16, 0.16, 0.16, 0xff2b4a, x, h + 2.0, 0, true);
  box(p, 0.16, 0.16, 0.16, 0xff2b4a, x + s * reach, h + 0.8, 0, true);
}

// Hanging container + trolley + cable; the game moves it along x.
export function makeCraneLoad(h) {
  const g = new THREE.Group();
  const trolley = new THREE.Group();
  box(trolley, 0.4, 0.14, 0.4, 0x3a3d55, 0, h + 0.38, 0);
  g.add(trolley);
  const swing = new THREE.Group();
  swing.position.y = h + 0.3;
  g.add(swing);
  const cableLen = h + 0.3 - 1.0;
  box(swing, 0.03, cableLen, 0.03, 0x1a1a1a, 0, -cableLen / 2, 0);
  box(swing, 0.5, 0.08, 0.08, 0x3a3d55, 0, -cableLen, 0);
  const c = new THREE.Group();
  c.position.y = -cableLen - 0.42;
  const col = pick([0xd84a3a, 0x2b6bff, 0x3dbf6a, 0xffa21a]);
  box(c, 1.1, 0.7, 0.78, col);
  for (let i = -4; i <= 4; i++) box(c, 0.02, 0.66, 0.79, 0x1a1a1a, i * 0.12, 0, 0);
  box(c, 1.12, 0.05, 0.8, 0xeef0f6, 0, 0.35, 0);
  bake(c);
  swing.add(c);
  const shadow = new THREE.Mesh(geo(1.1, 0.01, 0.8, false), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.position.y = 0.012;
  g.add(shadow);
  g.userData = { swing, trolley, shadow };
  return g;
}

// Steel I-beam that drops onto a marked cell.
export function makeBeam() {
  const g = new THREE.Group();
  box(g, 0.95, 0.14, 0.12, 0xc8501a);
  box(g, 0.95, 0.04, 0.36, 0xd8602a, 0, 0.09, 0);
  box(g, 0.95, 0.04, 0.36, 0xd8602a, 0, -0.09, 0);
  for (const x of [-0.4, 0.4]) box(g, 0.04, 0.2, 0.37, 0x1a1a1a, x, 0, 0);
  bake(g);
  return g;
}

// Target marker under a falling beam: dark shadow growing inside a blinking red ring.
export function makeBeamMark() {
  const g = new THREE.Group();
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.48, 24), new THREE.MeshBasicMaterial({ color: 0xff2b4a, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.017;
  g.add(shadow, ring);
  g.userData = { shadow, ring };
  return g;
}

export function sandPile(p, x, z = 0) {
  box(p, 0.9, 0.2, 0.8, 0xc8a46a, x, 0.1, z);
  box(p, 0.6, 0.18, 0.55, 0xd8b47a, x, 0.28, z);
  box(p, 0.3, 0.12, 0.3, 0xe0c08a, x, 0.42, z);
}

export function rebar(p, x, z = 0) {
  for (let i = 0; i < 5; i++) box(p, 0.9, 0.04, 0.04, 0x8a4a2a, x, 0.06 + (i % 2) * 0.05, z - 0.25 + i * 0.12);
  box(p, 0.3, 0.2, 0.7, 0x9a9eb8, x - 0.3, 0.1, z);
}

// ---------------------------------------------------------------- port
export function mooring(p, x, z = 0) {
  box(p, 0.4, 0.06, 0.4, 0x3a3d55, x, 0.03, z);
  box(p, 0.24, 0.36, 0.24, 0x2a2c48, x, 0.24, z);
  box(p, 0.34, 0.08, 0.34, 0x2a2c48, x, 0.44, z);
  box(p, 0.25, 0.03, 0.25, 0xffc21a, x, 0.2, z);
  for (let i = 0; i < 3; i++) box(p, 0.5 - i * 0.1, 0.06, 0.5 - i * 0.1, 0xd8c8a0, x + 0.3, 0.03 + i * 0.06, z + 0.25);
}

export function lighthouse(p, x, z = 0) {
  box(p, 1.2, 0.3, 1.2, 0x8a8ea8, x, 0.15, z);
  for (let i = 0; i < 6; i++) box(p, 0.8 - i * 0.06, 0.6, 0.8 - i * 0.06, i % 2 ? 0xeef0f6 : 0xd84a3a, x, 0.6 + i * 0.6, z);
  box(p, 0.5, 0.4, 0.5, 0xffe066, x, 4.1, z, true);
  box(p, 0.7, 0.12, 0.7, 0x2a2c48, x, 4.36, z);
  box(p, 0.3, 0.2, 0.3, 0xd84a3a, x, 4.5, z);
}

// ---------------------------------------------------------------- ground details (walk-through)
// Flat bits that make the ground feel lived-in without blocking anything.
function flat(p, w, d, color, x, z, y = 0.006, glow = false) {
  const m = box(p, w, 0.008, d, color, x, y, z, glow);
  m.castShadow = false;
  return m;
}

// Flat round piece (manhole covers, rope coils): a real disc instead of stacked squares.
function disc(p, r, color, x, z, y = 0.006) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 18), mat(color));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  p.add(m);
  return m;
}

export const DECALS = {
  manhole(p, x, z) {
    disc(p, 0.22, 0x4a4d68, x, z);
    disc(p, 0.17, 0x5d6182, x, z, 0.008);
    for (let i = -1; i <= 1; i++) flat(p, 0.22, 0.02, 0x4a4d68, x, z + i * 0.07, 0.01);
  },
  grate(p, x, z) {
    flat(p, 0.5, 0.26, 0x2e3048, x, z);
    for (let i = -2; i <= 2; i++) flat(p, 0.04, 0.22, 0x55597a, x + i * 0.09, z, 0.008);
  },
  puddle(p, x, z) {
    flat(p, 0.5, 0.3, 0x4a5a98, x, z);
    flat(p, 0.3, 0.2, 0x4a5a98, x + 0.2, z + 0.12);
    flat(p, 0.12, 0.04, 0x8fb0ff, x - 0.08, z - 0.04, 0.008);
  },
  crack(p, x, z) {
    let cx = x, cz = z;
    for (let i = 0; i < 4; i++) {
      flat(p, 0.14, 0.02, 0x7a7d98, cx, cz).rotation.y = (Math.random() - 0.5) * 1.6;
      cx += 0.1; cz += (Math.random() - 0.5) * 0.1;
    }
  },
  inlay(p, x, z) {
    const c = pick([0x35e6ff, 0xff4fd8, 0xb46bff]);
    for (const [dx, dz] of [[-0.12, 0], [0.12, 0], [0, -0.12], [0, 0.12]]) flat(p, 0.08, 0.08, c, x + dx, z + dz, 0.006, true);
  },
  arrow(p, x, z) {
    flat(p, 0.06, 0.4, 0xdfe1ee, x, z);
    for (const s of [-1, 1]) flat(p, 0.06, 0.2, 0xdfe1ee, x + s * 0.06, z - 0.15).rotation.y = s * 0.7;
  },
  leaves(p, x, z) {
    for (let i = 0; i < 5; i++) flat(p, 0.07, 0.05, pick([0xe0902a, 0xc8601a, 0x9ab84a]), x + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.5).rotation.y = Math.random() * 3;
  },
  petals(p, x, z) {
    for (let i = 0; i < 6; i++) flat(p, 0.06, 0.06, pick([0xffa8d8, 0xff8ac8, 0xffd0e8]), x + (Math.random() - 0.5) * 0.7, z + (Math.random() - 0.5) * 0.6).rotation.y = Math.random() * 3;
  },
  grass(p, x, z) {
    for (let i = 0; i < 4; i++) box(p, 0.06, 0.07, 0.06, pick([0x4fb356, 0x7ae07a, 0x46a64e]), x + (Math.random() - 0.5) * 0.6, 0.035, z + (Math.random() - 0.5) * 0.5).castShadow = false;
  },
  daisies(p, x, z) {
    for (let i = 0; i < 4; i++) flat(p, 0.05, 0.05, pick([0xffffff, 0xffe066]), x + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.5, 0.01);
  },
  oil(p, x, z) {
    flat(p, 0.42, 0.3, 0x2a2a36, x, z);
    flat(p, 0.2, 0.16, 0x3a2a4a, x + 0.18, z - 0.1, 0.008);
  },
  rope(p, x, z) {
    disc(p, 0.17, 0xd8c8a0, x, z);
    disc(p, 0.09, 0x9a8a6a, x, z, 0.008);
  },
  patch(p, x, z) { flat(p, rand(0.5, 0.9), rand(0.3, 0.5), 0x2e3152, x, z, -0.074); },
  skid(p, x, z) { for (const dz of [-0.2, 0.2]) flat(p, rand(0.8, 1.6), 0.07, 0x26284a, x, z + dz, -0.073); },
  roadManhole(p, x, z) {
    disc(p, 0.21, 0x50546e, x, z, -0.074);
    for (let i = -1; i <= 1; i++) flat(p, 0.22, 0.02, 0x3a3d55, x, z + i * 0.07, -0.072);
  },
};
