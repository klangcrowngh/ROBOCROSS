// Voxel models built from boxes. Vehicles face +x, the robot faces -z, NPCs face +z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';
import { bake as bakeParts } from './gear.js';

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

// ---------------------------------------------------------------- robot
// Built to the proportions of the AgiBot reference model (agibot 3.glb), but from separate
// parts so arms and legs can swing. Each robot owns its materials so the garage can recolor it.
export const PAL = { white: 0xd9dce4, light: 0xbfc3cf, dark: 0x2a2b33, black: 0x1a1b21, yellow: 0xd6a124 };

// Second robot "Titan": slimmer silver body, dark visor with glowing eyes, red core in the chest.
const PAL_TITAN = { white: 0xd2d5de, light: 0x8e93a3, dark: 0x3a3c46, black: 0x1a1b22, yellow: 0xe8202c };
// Third robot "Dog": a four-legged patrol robot, light body with a dark spine stripe.
const PAL_DOG = { white: 0xd4d7e2, light: 0x9a9eae, dark: 0x3a3c48, black: 0x1c1d24, yellow: 0xff3a3a };
// the new robots: the Agibot's light body and dark parts, each with its own accent
const PAL_NEW = { uni: 0xff6a00, hexa: 0x30d860, rolly: 0x14b8b0, track: 0xffc21a };

export function makeRobot(colors = {}, kind = 'rr') {
  const root = new THREE.Group();  // position + facing (game controlled)
  const body = new THREE.Group();  // squash / stretch
  const model = new THREE.Group(); // the actual mesh
  model.scale.setScalar(0.86);
  root.add(body);
  body.add(model);
  const parts = buildRobot(model, colors, kind);
  return { root, body, model, kind, ...parts };
}

// Swap the body of an existing robot (garage), keeping its root and whatever else is attached
// to the model (jetpack). Callers re-attach things that live on limbs.
export function rebuildRobot(robot, kind) {
  for (const o of robot.parts) robot.model.remove(o);
  // anchors the new body does not have are cleared (only the dog has a neck, tail and paws)
  Object.assign(robot, { neck: null, tail: null, paws: null, motors: null, anim: null, thrust: null, jet: null }, buildRobot(robot.model, {}, kind), { kind, acc: null, items: [] });
}

function buildRobot(model, colors, kind) {
  const before = new Set(model.children);
  const C = { ...(kind === 'titan' ? PAL_TITAN : kind === 'dog' ? PAL_DOG : PAL), ...(PAL_NEW[kind] ? { yellow: PAL_NEW[kind] } : {}), ...colors };
  const mats = {
    body: new THREE.MeshLambertMaterial({ color: C.white }),
    shade: new THREE.MeshLambertMaterial({ color: C.light }),
    dark: new THREE.MeshLambertMaterial({ color: C.dark }),
    black: new THREE.MeshLambertMaterial({ color: C.black }),
    accent: new THREE.MeshLambertMaterial({ color: C.yellow }),
    eyes: new THREE.MeshBasicMaterial({ color: 0xf4f6ff }),
    dot: new THREE.MeshBasicMaterial({ color: kind === 'titan' ? 0xff3a3a : 0xe8893a }),
  };
  const r = ({ titan: buildTitan, dog: buildDog, uni: buildUni, hexa: buildHexa, rolly: buildRolly, track: buildTrack }[kind] ?? buildRR)(model, mats);
  // the static boxes of each limb are merged per material (a robot is ~100 boxes); the eyes
  // blink, so they stay apart. Only the new body is merged, not what else hangs on the model.
  for (const e of r.eyes) e.userData.keep = true;
  const fresh = model.children.filter((o) => !before.has(o));
  const tmp = new THREE.Group();
  for (const o of fresh) if (o.isMesh) tmp.add(o);
  bakeParts(tmp);
  for (const o of [...tmp.children]) model.add(o);
  for (const o of fresh) if (!o.isMesh) bakeParts(o);
  return { ...r, mats, parts: model.children.filter((o) => !before.has(o)) };
}

function buildRR(model, mats) {
  const W = mats.body, L = mats.shade, D = mats.dark, B = mats.black, Y = mats.accent;

  // legs: hip pivot at the top of the thigh (y 0.73)
  // legs: hip pivot at the top of the thigh (y 0.73), knee pivot below it, so steps can bend
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.115, 0.73, 0);
    model.add(hip);
    box(hip, 0.1, 0.24, 0.12, W, 0, -0.12, 0);              // thigh
    const knee = new THREE.Group();
    knee.position.y = -0.265;
    hip.add(knee);
    box(knee, 0.12, 0.05, 0.13, D, 0, 0, 0);                // knee joint
    box(knee, 0.14, 0.27, 0.13, W, -s * 0.005, -0.155, 0);  // shin (wider than the thigh)
    box(knee, 0.145, 0.04, 0.135, L, -s * 0.005, -0.035, 0);
    box(knee, 0.1, 0.06, 0.1, D, 0, -0.315, 0);             // ankle
    box(knee, 0.15, 0.08, 0.22, Y, 0, -0.385, -0.03);       // boot
    box(knee, 0.155, 0.04, 0.225, B, 0, -0.445, -0.03);     // sole
    hip.userData.knee = knee;
    return hip;
  });

  // waist and pelvis
  box(model, 0.23, 0.07, 0.17, D, 0, 0.84, 0);
  box(model, 0.18, 0.09, 0.15, D, 0, 0.765, 0);
  box(model, 0.12, 0.05, 0.13, B, 0, 0.72, 0);

  // torso with the chest details from the reference
  box(model, 0.32, 0.31, 0.24, W, 0, 1.03, 0);
  box(model, 0.322, 0.04, 0.242, L, 0, 0.895, 0);
  box(model, 0.11, 0.025, 0.02, L, 0, 1.12, -0.121);       // light slot
  box(model, 0.025, 0.025, 0.022, mats.dot, 0.035, 1.12, -0.122);
  box(model, 0.075, 0.14, 0.02, B, 0, 1.0, -0.121);        // chest panel
  for (const [dx, dy] of [[-0.018, 0.03], [0.018, 0.03], [-0.018, -0.03], [0.018, -0.03]]) box(model, 0.028, 0.05, 0.022, D, dx, 1.0 + dy, -0.122);
  box(model, 0.08, 0.03, 0.07, D, 0, 1.2, 0);              // neck

  // arms hang from the shoulders (pivot at the top corner of the torso)
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * 0.21, 1.13, 0);
    model.add(sh);
    box(sh, 0.06, 0.1, 0.12, D, -s * 0.02, 0, 0);            // shoulder joint
    box(sh, 0.12, 0.12, 0.13, W, s * 0.035, -0.07, 0);        // shoulder cap
    box(sh, 0.11, 0.22, 0.12, W, s * 0.035, -0.24, 0);        // arm
    box(sh, 0.112, 0.03, 0.122, L, s * 0.035, -0.17, 0);
    box(sh, 0.07, 0.035, 0.08, D, s * 0.035, -0.37, 0);       // wrist
    box(sh, 0.11, 0.1, 0.12, Y, s * 0.035, -0.44, 0);         // hand
    sh.userData.hand = anchor(sh, s * 0.035, -0.44, 0);
    return sh;
  });

  // head: square black helmet, two white eyes, big dark "ears"
  const head = new THREE.Group();
  head.position.set(0, 1.215, 0);
  model.add(head);
  box(head, 0.21, 0.22, 0.21, B, 0, 0.11, 0);
  box(head, 0.212, 0.02, 0.212, D, 0, 0.215, 0);
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.075, 0.02), mats.eyes);
    e.position.set(s * 0.04, 0.115, -0.106);
    head.add(e);
    return e;
  });
  for (const s of [-1, 1]) {
    box(head, 0.035, 0.14, 0.16, D, s * 0.122, 0.115, 0.005);
    box(head, 0.02, 0.07, 0.08, B, s * 0.142, 0.115, 0.005);
  }

  // attachment points for hand and back items (back: +z points out of the back)
  return { legs, arms, head, eyes, hands: arms.map((a) => a.userData.hand), back: anchor(model, 0, 1.03, 0.12) };
}

// A leg of the dog: pivot (animated) -> fixed tilt -> thigh, knee pivot (animated) -> fixed bend
// -> shin, ankle and a black foot. As on the reference sheet every knee points backwards and the
// shin runs forward to the foot. `thigh`/`shin` are lengths, `a`/`b` their angles from vertical.
function dogLeg(model, mats, x, z, thigh, a, shin, b) {
  const W = mats.body, L = mats.shade, D = mats.dark, B = mats.black;
  const hip = new THREE.Group();
  hip.position.set(x, 0.56, z);
  model.add(hip);
  const tilt = new THREE.Group();
  tilt.rotation.x = -a;                                           // thigh down and back
  hip.add(tilt);
  box(tilt, 0.1, thigh, 0.115, W, 0, -thigh / 2, 0);
  box(tilt, 0.102, 0.03, 0.117, L, 0, -thigh * 0.3, 0);
  const knee = new THREE.Group();
  knee.position.y = -thigh;
  tilt.add(knee);
  const bend = new THREE.Group();
  bend.rotation.x = a + b;                                        // shin down and forward
  knee.add(bend);
  box(bend, 0.12, 0.11, 0.12, D, 0, 0, 0);                         // knee joint, a chunky dark block
  box(bend, 0.124, 0.06, 0.07, B, 0, 0, 0);
  box(bend, 0.085, shin - 0.07, 0.095, W, 0, -shin / 2 + 0.01, 0);
  box(bend, 0.087, 0.03, 0.097, L, 0, -shin * 0.6, 0);
  const foot = new THREE.Group();
  foot.position.y = -shin;
  foot.rotation.x = -b;                                           // ankle and foot level
  bend.add(foot);
  box(foot, 0.09, 0.06, 0.1, W, 0, 0.045, 0);                     // ankle
  box(foot, 0.115, 0.075, 0.125, B, 0, -0.015, -0.005);               // black foot block
  hip.userData.knee = knee;
  hip.userData.foot = foot;
  return hip;
}

// Pixel digits for the "02" on the dog's head (3x5 cells, drawn as small boxes).
const DIGITS = {
  0: ['111', '101', '101', '101', '111'], 2: ['111', '001', '111', '100', '111'],
  4: ['101', '101', '111', '001', '001'], 7: ['111', '001', '010', '010', '010'],
};
function digits(p, text, x, y, z, cell, mat, side) {
  [...text].forEach((ch, k) => DIGITS[ch].forEach((row, r) => [...row].forEach((c, i) => {
    if (c === '1') box(p, 0.006, cell, cell, mat, x, y - r * cell, z + side * (k * 4 + i) * cell);
  })));
}

// Third robot "Dog", built after the Unitree-style reference sheet: a long light trunk with
// a black spine panel, a head block as tall as the trunk, motor cubes on the hips and shoulders,
// legs with backward knees.
function buildDog(model, mats) {
  const W = mats.body, L = mats.shade, D = mats.dark, B = mats.black, Y = mats.accent;
  const red = mat(0xff2b3a, true), yellow = mat(0xffd21f, true), white = mat(0xf2f4fa, true);
  // trunk (behind the head), darker belly
  box(model, 0.25, 0.2, 0.775, W, 0, 0.6, 0.0875);
  box(model, 0.252, 0.035, 0.777, L, 0, 0.517, 0.0875);
  box(model, 0.2, 0.03, 0.72, B, 0, 0.49, 0.09);
  // neck: a dark, narrower joint between the trunk and the head, with light collars
  box(model, 0.15, 0.13, 0.17, D, 0, 0.6, -0.38);
  box(model, 0.17, 0.035, 0.05, L, 0, 0.665, -0.33);
  box(model, 0.17, 0.035, 0.04, L, 0, 0.665, -0.44);
  box(model, 0.11, 0.05, 0.17, B, 0, 0.52, -0.38);
  box(model, 0.09, 0.012, 0.52, B, 0, 0.705, 0.04);              // black spine panel
  // raised box with the red light on top, towards the tail
  box(model, 0.12, 0.045, 0.1, W, 0, 0.72, 0.16);
  box(model, 0.06, 0.02, 0.03, red, 0, 0.74, 0.205);
  box(model, 0.08, 0.025, 0.06, L, 0, 0.71, -0.24);               // small cover behind the head
  // rear face: black band with a yellow light
  box(model, 0.07, 0.15, 0.012, B, 0, 0.6, 0.477);
  box(model, 0.03, 0.03, 0.014, yellow, 0, 0.55, 0.479);
  for (const s of [-1, 1]) {
    // long dark slot along the side with two status lights and two black squares
    box(model, 0.012, 0.075, 0.34, D, s * 0.126, 0.6, 0.04);
    box(model, 0.014, 0.05, 0.05, B, s * 0.128, 0.6, -0.07);
    box(model, 0.014, 0.05, 0.05, B, s * 0.128, 0.6, 0.15);
    box(model, 0.015, 0.022, 0.03, Y, s * 0.129, 0.62, 0.04, true);
    box(model, 0.015, 0.022, 0.03, Y, s * 0.129, 0.583, 0.04, true);
    // motor cubes: dark block, a light cap on the outside
    for (const z of [-0.27, 0.42]) {
      box(model, 0.1, 0.15, 0.15, D, s * 0.17, 0.585, z);
      box(model, 0.03, 0.12, 0.12, W, s * 0.226, 0.59, z);
      box(model, 0.032, 0.03, 0.122, L, s * 0.227, 0.54, z);
    }
  }

  // head: in front of the neck, as tall as the trunk, slightly rounded front, a black band down the middle with a
  // camera lens on top and the yellow light below; "02" and stripes on both sides; dark grill
  // under the chin. Accessories sit on its top.
  const head = new THREE.Group();
  head.position.set(0, 0.5, -0.53);
  model.add(head);
  box(head, 0.23, 0.21, 0.15, W, 0, 0.115, 0);
  box(head, 0.2, 0.19, 0.02, W, 0, 0.115, -0.083);                // rounded front
  box(head, 0.232, 0.035, 0.152, L, 0, 0.035, 0);
  box(head, 0.075, 0.17, 0.012, B, 0, 0.115, -0.094);             // black band
  box(head, 0.035, 0.035, 0.014, D, 0, 0.17, -0.098);             // camera lens
  box(head, 0.015, 0.015, 0.016, mat(0x6a6e88, true), 0, 0.17, -0.1);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.034, 0.014), mats.eyes);
  eye.position.set(0, 0.06, -0.1);
  head.add(eye);
  for (const s of [-1, 1]) {
    box(head, 0.006, 0.08, 0.1, L, s * 0.116, 0.12, 0.01);        // number plate
    // reads left to right from either side; the stripes always sit behind the number
    digits(head, '02', s * 0.12, 0.15, s < 0 ? -0.065 : -0.002, 0.009, white, -s);
    for (const dz of [0.035, 0.055]) box(head, 0.006, 0.07, 0.008, white, s * 0.12, 0.12, dz).rotation.x = 0.55;
  }
  box(head, 0.17, 0.06, 0.12, B, 0, -0.02, -0.01);                // grill under the chin
  for (const dx of [-0.06, -0.03, 0, 0.03, 0.06]) box(head, 0.014, 0.065, 0.125, D, dx, -0.02, -0.01);

  // front legs act as "arms", hind legs as "legs" for the shared animations
  const arms = [-1, 1].map((s) => dogLeg(model, mats, s * 0.2, -0.27, 0.2, 0.33, 0.39, 0.61));
  const legs = [-1, 1].map((s) => dogLeg(model, mats, s * 0.2, 0.42, 0.236, 0.63, 0.36, 0.49));
  // attachment points: front paws act as hands, the back faces up, plus neck, tail and all paws
  const back = anchor(model, 0, 0.71, 0.08);
  back.rotation.x = -Math.PI / 2;
  return {
    legs, arms, head, eyes: [eye],
    hands: arms.map((a) => a.userData.foot), back,
    neck: anchor(model, 0, 0.6, -0.38), tail: anchor(model, 0, 0.62, 0.475),
    // tops of the four motor cubes: front left, front right, rear left, rear right
    motors: [[-1, -0.27], [1, -0.27], [-1, 0.42], [1, 0.42]].map(([s, z]) => anchor(model, s * 0.17, 0.66, z)),
    paws: [...arms, ...legs].map((l) => l.userData.foot),
  };
}

// Titan, after its reference render: wide light chest with dark shoulder joints, a lit square in
// a black frame above a big red pentagon that runs into the black belly, a light waist band,
// thick legs with red marks and black knee pads, boots with light toe caps; the head has a
// light cap, big dark ears and a black visor with two wide glowing eyes.
function buildTitan(model, mats) {
  const W = mats.body, L = mats.shade, D = mats.dark, B = mats.black, Y = mats.accent;
  const legs = [-1, 1].map((s) => {
    const hip = new THREE.Group();
    hip.position.set(s * 0.098, 0.745, 0);
    model.add(hip);
    box(hip, 0.165, 0.27, 0.16, W, 0, -0.14, 0);                  // thick thigh
    box(hip, 0.03, 0.27, 0.162, L, -s * 0.07, -0.14, 0);          // shaded inner side
    box(hip, 0.024, 0.07, 0.01, Y, s * 0.04, -0.2, -0.082);       // red mark
    const knee = new THREE.Group();
    knee.position.y = -0.29;
    hip.add(knee);
    box(knee, 0.15, 0.08, 0.15, D, 0, 0.01, 0);                   // knee joint
    box(knee, 0.13, 0.11, 0.05, B, 0, 0.0, -0.085);               // black knee pad
    box(knee, 0.155, 0.29, 0.15, W, 0, -0.18, 0);                 // shin
    box(knee, 0.03, 0.29, 0.152, L, s * 0.064, -0.18, 0);         // shaded outer side
    box(knee, 0.12, 0.04, 0.12, D, 0, -0.335, 0);                 // ankle
    box(knee, 0.17, 0.09, 0.23, D, 0, -0.395, -0.025);            // boot
    box(knee, 0.172, 0.05, 0.07, W, 0, -0.4, -0.115);             // light toe cap
    box(knee, 0.175, 0.03, 0.235, B, 0, -0.44, -0.025);           // sole
    hip.userData.knee = knee;
    return hip;
  });

  // pelvis: light crotch plate between dark hip joints, dark waist, light waist band
  box(model, 0.13, 0.1, 0.15, W, 0, 0.72, 0);
  for (const s of [-1, 1]) box(model, 0.06, 0.09, 0.14, D, s * 0.13, 0.75, 0);
  box(model, 0.26, 0.04, 0.16, B, 0, 0.79, 0);
  box(model, 0.24, 0.025, 0.17, L, 0, 0.825, 0);
  // black belly, the light chest above it
  box(model, 0.3, 0.16, 0.2, B, 0, 0.92, 0);
  box(model, 0.4, 0.23, 0.24, W, 0, 1.08, 0);
  box(model, 0.402, 0.03, 0.242, L, 0, 0.98, 0);
  for (const s of [-1, 1]) {
    box(model, 0.07, 0.07, 0.02, L, s * 0.16, 1.15, -0.122);      // shaded shoulder corners
    box(model, 0.08, 0.1, 0.02, L, s * 0.15, 1.02, -0.121);
    box(model, 0.06, 0.08, 0.02, B, s * 0.075, 0.99, -0.121);     // black wedges beside the pentagon
  }
  // red pentagon pointing down into the belly
  box(model, 0.13, 0.07, 0.02, Y, 0, 0.99, -0.124);
  box(model, 0.1, 0.035, 0.02, Y, 0, 0.94, -0.124);
  box(model, 0.06, 0.03, 0.02, Y, 0, 0.91, -0.124);
  // lit square in a black frame
  box(model, 0.085, 0.075, 0.02, B, 0, 1.115, -0.122);
  box(model, 0.05, 0.045, 0.022, mats.dot, 0, 1.115, -0.124);
  box(model, 0.02, 0.02, 0.024, mats.eyes, 0, 1.115, -0.126);
  box(model, 0.1, 0.04, 0.1, D, 0, 1.205, 0);                     // neck

  // arms: dark shoulder joint with a square inset, one long light segment, dark wrist and hand
  const arms = [-1, 1].map((s) => {
    const sh = new THREE.Group();
    sh.position.set(s * 0.245, 1.15, 0);
    model.add(sh);
    box(sh, 0.13, 0.15, 0.15, D, s * 0.05, -0.05, 0);
    box(sh, 0.05, 0.05, 0.155, B, s * 0.05, -0.05, 0);
    box(sh, 0.125, 0.26, 0.135, W, s * 0.05, -0.25, 0);
    box(sh, 0.127, 0.04, 0.137, L, s * 0.05, -0.15, 0);
    box(sh, 0.03, 0.26, 0.137, L, s * 0.1, -0.25, 0);
    box(sh, 0.1, 0.03, 0.11, D, s * 0.05, -0.395, 0);             // wrist
    box(sh, 0.13, 0.11, 0.14, B, s * 0.05, -0.465, 0);            // hand
    sh.userData.hand = anchor(sh, s * 0.05, -0.465, 0);
    return sh;
  });

  // head: light cap, grey block, big dark ears, black visor with wide glowing eyes,
  // light lower face with a seam and a dark chin
  const head = new THREE.Group();
  head.position.set(0, 1.22, 0);
  model.add(head);
  box(head, 0.24, 0.22, 0.23, L, 0, 0.11, 0);
  box(head, 0.242, 0.055, 0.232, W, 0, 0.195, 0);
  box(head, 0.16, 0.02, 0.02, D, -0.02, 0.2, -0.117);             // dark strip on the cap front
  for (const s of [-1, 1]) {
    box(head, 0.035, 0.14, 0.17, D, s * 0.135, 0.12, 0.01);       // ears
    box(head, 0.02, 0.06, 0.08, B, s * 0.155, 0.12, 0.01);
  }
  box(head, 0.22, 0.06, 0.02, B, 0, 0.135, -0.116);               // visor
  const eyes = [-1, 1].map((s) => {
    const e = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.026, 0.02), mats.eyes);
    e.position.set(s * 0.052, 0.137, -0.124);
    head.add(e);
    return e;
  });
  box(head, 0.16, 0.08, 0.02, W, 0, 0.065, -0.116);               // lower face
  box(head, 0.014, 0.05, 0.022, D, -0.03, 0.065, -0.117);         // seam
  box(head, 0.1, 0.03, 0.022, D, 0, 0.02, -0.117);                // chin
  // attachment points for hand and back items (back: +z points out of the back)
  return { legs, arms, head, eyes, hands: arms.map((a) => a.userData.hand), back: anchor(model, 0, 1.07, 0.12) };
}

// ---------------------------------------------------------------- robots that do not walk
// Unicycle, hexapod, rolling ball and tracks. Besides the usual parts each one returns an `anim`
// with its own poses (step / idle / fly / menu), `thrust` anchors for the flight flames (cones
// pointing down) and `jet`: where the jetpack sits ({ y, z, lying }).
function cyl(p, rt, rb, h, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, n = 16) {
  const material = typeof m === 'object' ? m : mat(m);
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, n), material);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.castShadow = !material.isMeshBasicMaterial;
  p.add(o);
  return o;
}
const grp = (p, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; };
const own = (c) => new THREE.MeshBasicMaterial({ color: c }); // lights that pulse get their own material
const keep = (o) => { o.userData.keep = true; return o; };
// a rounded rectangle (track loops)
function rrShape(w, h, r, path = new THREE.Shape()) {
  const x = -w / 2, y = -h / 2;
  path.moveTo(x + r, y); path.lineTo(x + w - r, y); path.quadraticCurveTo(x + w, y, x + w, y + r);
  path.lineTo(x + w, y + h - r); path.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  path.lineTo(x + r, y + h); path.quadraticCurveTo(x, y + h, x, y + h - r);
  path.lineTo(x, y + r); path.quadraticCurveTo(x, y, x + r, y);
  return path;
}
// progress of a step since the last frame (the anims turn wheels by the distance travelled)
function stepper() {
  let last = 0;
  return (t) => { const d = t >= last ? t - last : t; last = t >= 1 ? 0 : t; return d; };
}

// Юни: a unicycle robot. Square side covers on a squat tyre, a boxy frame and torso with accent
// plates, arms like the Agibot's, a wide head with a black visor.
function buildUni(model, mats) {
  const W = mats.body, L = mats.shade, D = mats.dark, B = mats.black, Y = mats.accent;
  const RUB = mat(0x1b1b1f), red = mat(0xff3a2a, true), amber = mat(0xffa21a, true), white = mat(0xf2f4fa, true);
  const AX = 0.25, R = 0.245;
  const wheel = grp(model, 0, AX, 0);
  cyl(wheel, R, R, 0.15, RUB, 0, 0, 0, 0, 0, Math.PI / 2, 28);
  for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; box(wheel, 0.16, 0.022, 0.05, RUB, 0, Math.cos(a) * 0.252, Math.sin(a) * 0.252).rotation.x = a; }
  cyl(wheel, 0.15, 0.15, 0.152, D, 0, 0, 0, 0, 0, Math.PI / 2, 20);
  // the body sways round the axle: square side covers with bolts and a light, the frame arms
  const body = grp(model, 0, AX, 0);
  for (const s of [-1, 1]) {
    box(body, 0.03, 0.3, 0.3, L, s * 0.095, 0, 0);
    box(body, 0.034, 0.2, 0.2, W, s * 0.1, 0, 0);
    box(body, 0.036, 0.04, 0.304, Y, s * 0.1, -0.11, 0);
    box(body, 0.036, 0.012, 0.304, D, s * 0.1, 0.11, 0);
    box(body, 0.04, 0.07, 0.07, D, s * 0.105, 0, 0);
    box(body, 0.044, 0.03, 0.03, B, s * 0.108, 0, 0);
    for (const [y, z] of [[0.07, 0.07], [0.07, -0.07], [-0.07, 0.07], [-0.07, -0.07]]) box(body, 0.04, 0.018, 0.018, D, s * 0.104, y, z);
    box(body, 0.042, 0.02, 0.03, red, s * 0.107, 0.08, -0.12);
    box(body, 0.05, 0.26, 0.12, D, s * 0.1, 0.22, 0);
    box(body, 0.052, 0.03, 0.122, L, s * 0.1, 0.3, 0);
    cyl(body, 0.012, 0.012, 0.16, L, s * 0.1, 0.2, 0.075, 0, 0, 0, 8);
    cyl(body, 0.018, 0.018, 0.06, D, s * 0.1, 0.27, 0.075, 0, 0, 0, 8);
  }
  // housing over the tyre with an amber running light and side vents, waist
  box(body, 0.25, 0.1, 0.24, D, 0, 0.34, 0);
  box(body, 0.252, 0.03, 0.242, Y, 0, 0.31, 0);
  box(body, 0.08, 0.02, 0.01, amber, 0, 0.35, -0.122);
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) box(body, 0.006, 0.01, 0.15, B, s * 0.126, 0.33 + i * 0.02, 0);
  box(body, 0.17, 0.08, 0.15, B, 0, 0.43, 0);
  box(body, 0.2, 0.03, 0.16, L, 0, 0.47, 0);
  // torso: light box, shaded sides with the number, accent chest plates, black chest panel
  const torso = grp(body, 0, 0.62, 0);
  box(torso, 0.34, 0.26, 0.22, W, 0, 0, 0);
  box(torso, 0.342, 0.03, 0.222, L, 0, -0.1, 0);
  for (const s of [-1, 1]) {
    box(torso, 0.03, 0.26, 0.222, L, s * 0.155, 0, 0);
    digits(torso, '07', s * 0.172, 0.06, s < 0 ? -0.04 : 0.04, 0.014, B, -s);
    box(torso, 0.09, 0.08, 0.02, Y, s * 0.09, 0.05, -0.115);
    box(torso, 0.006, 0.08, 0.022, D, s * 0.09, 0.05, -0.116);
    box(torso, 0.05, 0.05, 0.02, D, s * 0.09, -0.06, -0.113);
  }
  box(torso, 0.07, 0.13, 0.02, B, 0, 0, -0.115);
  for (let i = 0; i < 4; i++) box(torso, 0.05, 0.012, 0.022, D, 0, -0.04 + i * 0.026, -0.116);
  box(torso, 0.025, 0.025, 0.022, amber, 0, 0.09, -0.116);
  box(torso, 0.22, 0.16, 0.05, L, 0, 0.01, 0.13);
  for (let i = 0; i < 3; i++) box(torso, 0.18, 0.012, 0.01, D, 0, -0.03 + i * 0.03, 0.157);
  box(torso, 0.04, 0.02, 0.01, red, 0.07, 0.06, 0.157);
  box(torso, 0.09, 0.04, 0.09, D, 0, 0.15, 0);
  // arms like the Agibot's: dark joint, accent cap, light arm, elbow, forearm, black hand
  const arms = [-1, 1].map((s) => {
    const sh = grp(torso, s * 0.2, 0.09, 0);
    box(sh, 0.06, 0.1, 0.12, D, -s * 0.01, 0, 0);
    box(sh, 0.12, 0.08, 0.14, Y, s * 0.035, 0.03, 0);
    box(sh, 0.122, 0.015, 0.142, D, s * 0.035, 0.06, 0);
    box(sh, 0.1, 0.12, 0.11, W, s * 0.035, -0.1, 0);
    box(sh, 0.08, 0.04, 0.09, D, s * 0.035, -0.18, 0);
    box(sh, 0.1, 0.1, 0.11, W, s * 0.035, -0.25, 0);
    box(sh, 0.025, 0.1, 0.112, L, s * 0.075, -0.25, 0);
    box(sh, 0.07, 0.03, 0.08, D, s * 0.035, -0.315, 0);
    box(sh, 0.1, 0.08, 0.11, B, s * 0.035, -0.36, 0);
    box(sh, 0.102, 0.015, 0.112, Y, s * 0.035, -0.33, 0);
    for (const z of [-0.035, 0.035]) box(sh, 0.03, 0.05, 0.03, D, s * 0.035, -0.42, z);
    sh.userData.hand = anchor(sh, s * 0.035, -0.36, 0);
    return sh;
  });
  // head: wide light box, accent cap, black visor with white eyes, ear blocks with lights
  const head = grp(torso, 0, 0.17, 0);
  box(head, 0.26, 0.18, 0.2, W, 0, 0.09, 0);
  box(head, 0.262, 0.03, 0.202, Y, 0, 0.165, 0);
  box(head, 0.262, 0.025, 0.202, L, 0, 0.012, 0);
  box(head, 0.22, 0.08, 0.02, B, 0, 0.09, -0.1);
  const eyes = [-1, 1].map((s) => box(head, 0.05, 0.05, 0.006, mats.eyes, s * 0.05, 0.09, -0.111));
  box(head, 0.02, 0.01, 0.006, white, 0.085, 0.05, -0.101);
  box(head, 0.1, 0.02, 0.022, D, 0, 0.03, -0.1);
  for (const s of [-1, 1]) {
    box(head, 0.03, 0.11, 0.13, D, s * 0.145, 0.09, 0);
    box(head, 0.012, 0.05, 0.06, Y, s * 0.162, 0.09, 0);
    box(head, 0.013, 0.015, 0.015, amber, s * 0.163, 0.13, 0.04);
  }
  for (let i = 0; i < 3; i++) box(head, 0.006, 0.006, 0.16, D, -0.05 + i * 0.05, 0.181, 0.0);
  const roll = stepper();
  const anim = {
    step(t, sign) {
      wheel.rotation.x -= roll(t) / R;
      const reach = Math.sin(t * Math.PI);
      body.rotation.set(-0.12 * reach, 0, 0);
      const sw = (t - 0.5) * 0.8;
      arms[0].rotation.set(sw * sign, 0, -0.1);
      arms[1].rotation.set(-sw * sign, 0, 0.1);
      head.rotation.set(0.06 * reach, 0, 0);
    },
    idle(time, idle, riding) {
      body.rotation.set(Math.sin(time * 2.2) * 0.035, 0, Math.sin(time * 1.3) * (riding ? 0.06 : 0.02));
      const out = riding ? 0.5 + Math.sin(time * 2.2) * 0.12 : 0.08 + Math.sin(time * 2.4) * 0.03;
      arms[0].rotation.set(Math.sin(time * 1.3) * 0.06, 0, -out);
      arms[1].rotation.set(-Math.sin(time * 1.3) * 0.06, 0, out);
      head.rotation.set(0, idle > 1.5 ? Math.sin((idle - 1.5) * 1.6) * 0.5 : 0, 0);
    },
    fly(level) {
      body.rotation.set(-0.25 * level, 0, 0);
      arms[0].rotation.set(0.5 * level, 0, -0.35 * level);
      arms[1].rotation.set(0.5 * level, 0, 0.35 * level);
      head.rotation.set(0.15 * level, 0, 0);
    },
  };
  return {
    legs: [], arms, head, eyes, hands: arms.map((a) => a.userData.hand), back: anchor(torso, 0, 0.0, 0.155), anim,
    thrust: [anchor(body, 0, -0.25, 0), ...arms.map((a) => a.userData.hand)],
    jet: { y: AX + 0.62, z: 0.2 },
  };
}

// Трак: a small tracked robot in the style of the Go2. Rubber tracks with light road wheels, a
// light box body with a spine panel and yellow stripes, two manipulator arms with claws, a
// Go2-like head block with number plates, a black visor with white eyes and a chin grill.
function buildTrack(model, mats) {
  const W = mats.body, L = mats.shade, D = mats.dark, B = mats.black, Y = mats.accent;
  const RUB = mat(0x22232a), red = mat(0xff2b3a, true), green = mat(0x30ff90, true), white = mat(0xf2f4fa, true);
  const LEN = 0.52, HT = 0.2, RR = HT / 2;
  const loop = (() => {
    const s = rrShape(LEN, HT, RR);
    s.holes.push(rrShape(LEN - 0.05, HT - 0.05, RR - 0.025, new THREE.Path()));
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false, curveSegments: 10 });
    g.translate(0, 0, -0.05); g.rotateY(-Math.PI / 2);
    return g;
  })();
  const straight = LEN - HT, per = 2 * straight + 2 * Math.PI * RR;
  const along = (u) => { // [y, z, angle] on the loop
    u = ((u % per) + per) % per;
    if (u < straight) return [RR, -straight / 2 + u, 0];
    u -= straight;
    if (u < Math.PI * RR) { const a = u / RR; return [Math.cos(a) * RR, straight / 2 + Math.sin(a) * RR, a]; }
    u -= Math.PI * RR;
    if (u < straight) return [-RR, straight / 2 - u, Math.PI];
    u -= straight;
    const a = Math.PI + u / RR; return [Math.cos(a) * RR, -straight / 2 + Math.sin(a) * RR, a];
  };
  const lugs = [], spinners = [];
  for (const s of [-1, 1]) {
    const tr = grp(model, s * 0.2, RR + 0.01, 0);
    const belt = new THREE.Mesh(loop, RUB); belt.castShadow = true; tr.add(belt);
    for (let i = 0; i < 22; i++) lugs.push([keep(box(tr, 0.104, 0.016, 0.03, B)), i]);
    for (const [z, y, r] of [[-straight / 2, 0, RR - 0.03], [straight / 2, 0, RR - 0.03], [-0.06, -0.035, 0.045], [0.06, -0.035, 0.045]]) {
      const w = grp(tr, 0, y, z);
      cyl(w, r, r, 0.09, L, 0, 0, 0, 0, 0, Math.PI / 2, 16);
      cyl(w, r * 0.45, r * 0.45, 0.094, D, 0, 0, 0, 0, 0, Math.PI / 2, 10);
      for (const sx of [-1, 1]) box(w, 0.004, r * 1.3, r * 0.25, D, sx * 0.046, 0, 0);
      spinners.push([w, r]);
    }
    box(tr, 0.02, 0.05, LEN - 0.1, Y, s * 0.06, RR - 0.02, 0);
    for (const z of [-0.15, 0.15]) box(tr, 0.022, 0.018, 0.018, D, s * 0.06, RR - 0.02, z);
  }
  // body: dark base, light box with a shaded band, spine panel, stripes, the number, lights
  const body = grp(model);
  box(body, 0.3, 0.07, 0.42, D, 0, 0.21, 0);
  box(body, 0.3, 0.16, 0.4, W, 0, 0.32, 0);
  box(body, 0.302, 0.03, 0.402, L, 0, 0.255, 0);
  box(body, 0.08, 0.012, 0.3, B, 0, 0.406, 0.03);
  for (const s of [-1, 1]) {
    box(body, 0.006, 0.05, 0.3, Y, s * 0.152, 0.33, 0.02);
    box(body, 0.006, 0.07, 0.09, L, s * 0.152, 0.33, -0.15);
    digits(body, '04', s * 0.156, 0.36, s < 0 ? -0.19 : -0.13, 0.012, B, -s);
    for (const z of [0.12, 0.15]) box(body, 0.008, 0.06, 0.012, B, s * 0.153, 0.32, z).rotation.x = 0.5;
  }
  box(body, 0.06, 0.03, 0.06, B, 0, 0.42, 0.13);
  box(body, 0.03, 0.012, 0.02, red, 0, 0.44, 0.13);
  for (const x of [-0.04, 0.04]) box(body, 0.02, 0.02, 0.006, green, x, 0.36, 0.201);
  box(body, 0.14, 0.03, 0.02, D, 0, 0.29, 0.202);
  for (const x of [-0.11, 0.11]) { box(body, 0.05, 0.03, 0.012, B, x, 0.3, -0.2); box(body, 0.03, 0.016, 0.006, white, x, 0.3, -0.207); }
  for (let i = 0; i < 3; i++) box(body, 0.12, 0.006, 0.006, B, 0, 0.27 + i * 0.012, -0.203);
  box(body, 0.04, 0.012, 0.012, D, 0.08, 0.41, 0.12);
  // manipulator arms on the shoulders reaching forward, two-finger claws
  const claws = [], uppers = [];
  const arms = [-1, 1].map((s) => {
    const sh = grp(body, s * 0.185, 0.42, -0.1);
    box(sh, 0.06, 0.08, 0.08, D, 0, 0, 0);
    box(sh, 0.064, 0.02, 0.084, Y, 0, 0.03, 0);
    const up = grp(sh, s * 0.01, 0, 0);
    up.rotation.set(1.0, 0, s * 0.12);
    box(up, 0.05, 0.16, 0.06, W, 0, -0.08, 0);
    box(up, 0.052, 0.02, 0.062, L, 0, -0.03, 0);
    cyl(up, 0.01, 0.01, 0.12, L, s * 0.03, -0.08, 0.02, 0, 0, 0, 8);
    const el = grp(up, 0, -0.17, 0);
    el.rotation.x = 0.6;
    box(el, 0.055, 0.045, 0.055, D, 0, 0, 0);
    box(el, 0.044, 0.14, 0.05, W, 0, -0.08, 0);
    box(el, 0.046, 0.02, 0.052, Y, 0, -0.13, 0);
    const wr = grp(el, 0, -0.16, 0);
    box(wr, 0.05, 0.03, 0.05, D, 0, 0, 0);
    for (const k of [-1, 1]) { const f = grp(wr, 0, -0.01, k * 0.018); box(f, 0.02, 0.06, 0.012, B, 0, -0.03, 0); claws.push([f, k]); }
    uppers.push(up);
    sh.userData.hand = anchor(wr, 0, -0.03, 0);
    return sh;
  });
  // neck and the Go2-like head
  box(body, 0.12, 0.08, 0.1, D, 0, 0.43, -0.12);
  const head = grp(body, 0, 0.46, -0.14);
  box(head, 0.23, 0.19, 0.16, W, 0, 0.1, 0);
  box(head, 0.2, 0.17, 0.02, W, 0, 0.1, -0.085);
  box(head, 0.232, 0.03, 0.162, L, 0, 0.02, 0);
  box(head, 0.234, 0.022, 0.164, Y, 0, 0.18, 0);
  box(head, 0.18, 0.07, 0.012, B, 0, 0.11, -0.096);
  const eyes = [-1, 1].map((s) => box(head, 0.04, 0.04, 0.006, mats.eyes, s * 0.045, 0.11, -0.103));
  box(head, 0.022, 0.022, 0.008, D, 0, 0.165, -0.098);
  box(head, 0.01, 0.01, 0.009, mat(0x6a6e88, true), 0, 0.165, -0.1);
  box(head, 0.15, 0.05, 0.11, B, 0, -0.02, -0.01);
  for (const dx of [-0.05, -0.025, 0, 0.025, 0.05]) box(head, 0.012, 0.055, 0.115, D, dx, -0.02, -0.01);
  for (const s of [-1, 1]) {
    box(head, 0.006, 0.08, 0.1, L, s * 0.116, 0.1, 0.01);
    digits(head, '04', s * 0.12, 0.13, s < 0 ? -0.06 : 0.0, 0.009, white, -s);
    for (const dz of [0.035, 0.055]) box(head, 0.006, 0.07, 0.008, Y, s * 0.12, 0.1, dz).rotation.x = 0.55;
  }
  const moved = stepper();
  let run = 0;
  const roll = (d) => {
    run += d;
    for (const [l, i] of lugs) { const [y, z, a] = along(i / 22 * per - run); l.position.set(0, y + Math.cos(a) * 0.006, z + Math.sin(a) * 0.006); l.rotation.x = a; }
    for (const [w, r] of spinners) w.rotation.x -= d / r;
  };
  roll(0);
  const anim = {
    step(t) {
      roll(moved(t));
      body.position.y = Math.abs(Math.sin(t * Math.PI * 4)) * 0.006;
      head.rotation.set(0.05 * Math.sin(t * Math.PI), 0, 0);
    },
    idle(time, idle) {
      body.position.y = 0;
      uppers.forEach((u, i) => { u.rotation.x = 1.0 + Math.sin(time * 1.5 + i) * 0.08; });
      claws.forEach(([f, k]) => { f.rotation.x = k * (0.1 + Math.max(0, Math.sin(time * 2)) * 0.25); });
      head.rotation.set(0, idle > 1.5 ? Math.sin((idle - 1.5) * 1.6) * 0.5 : 0, 0);
    },
    fly(level) {
      uppers.forEach((u) => { u.rotation.x = 1.0 - 0.6 * level; });
      head.rotation.set(0.1 * level, 0, 0);
    },
    menu(time, wave) {
      uppers[1].rotation.x = 1.0 + wave * 1.2;
      claws.forEach(([f, k], i) => { if (i > 1) f.rotation.x = k * wave * (0.3 + 0.3 * Math.sin(time * 14)); });
      head.rotation.y = Math.sin(time * 0.7) * 0.35;
    },
  };
  return {
    legs: [], arms, head, eyes, hands: arms.map((a) => a.userData.hand), back: anchor(body, 0, 0.33, 0.2), anim,
    thrust: [-1, 1].map((s) => anchor(model, s * 0.2, 0.02, 0)),
    jet: { y: 0.55, z: 0.13 },
  };
}

// Гекса: a hexapod. A layered hexagonal body with six legs on its corners, a sensor turret on
// top, a battery at the back, an armoured head with a black visor, four eyes, mandibles, feelers.
function buildHexa(model, mats) {
  const W = mats.body, L = mats.shade, D = mats.dark, B = mats.black, Y = mats.accent;
  const red = mat(0xff2b4a, true), steel = mat(0x9aa0b8);
  const lamp = own(0x6dffb0);
  const hexGeo = (r, d, hole = 0) => {
    const pts = (rad) => [...Array(6)].map((_, i) => new THREE.Vector2(Math.cos(Math.PI / 6 + i / 6 * Math.PI * 2) * rad, Math.sin(Math.PI / 6 + i / 6 * Math.PI * 2) * rad));
    const s = new THREE.Shape(pts(r));
    if (hole) s.holes.push(new THREE.Path(pts(hole).reverse()));
    const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false });
    g.translate(0, 0, -d / 2); g.rotateX(-Math.PI / 2);
    return g;
  };
  const hex = (p, r, d, m, y, hole = 0) => { const o = new THREE.Mesh(hexGeo(r, d, hole), m); o.position.y = y; o.castShadow = true; p.add(o); return o; };
  const body = grp(model, 0, 0.42, 0);
  hex(body, 0.27, 0.05, B, -0.075);
  hex(body, 0.315, 0.12, W, 0);
  hex(body, 0.32, 0.022, L, -0.045);
  hex(body, 0.26, 0.04, L, 0.075);
  hex(body, 0.215, 0.012, Y, 0.098, 0.17);
  hex(body, 0.15, 0.02, D, 0.1);
  hex(body, 0.06, 0.012, lamp, 0.112);
  const sideLights = [];
  for (let i = 1; i < 6; i++) {
    const a = i / 6 * Math.PI * 2;
    const f = grp(body, Math.sin(a) * 0.272, 0, -Math.cos(a) * 0.272);
    f.rotation.y = -a;
    box(f, 0.14, 0.05, 0.02, D, 0, 0, -0.004);
    for (let k = 0; k < 3; k++) box(f, 0.1, 0.006, 0.006, B, 0, -0.014 + k * 0.014, -0.016);
    for (const x of [-0.055, 0.055]) { const m = own(0x6dffb0); sideLights.push(m); box(f, 0.014, 0.014, 0.006, m, x, 0, -0.016); }
  }
  box(body, 0.18, 0.08, 0.1, D, 0, 0.07, 0.24);
  box(body, 0.184, 0.012, 0.104, Y, 0, 0.1, 0.24);
  for (let k = 0; k < 3; k++) box(body, 0.15, 0.008, 0.006, B, 0, 0.055 + k * 0.015, 0.292);
  const dome = grp(body, 0, 0.115, 0.04);
  box(dome, 0.08, 0.03, 0.08, D, 0, 0.015, 0);
  box(dome, 0.06, 0.04, 0.05, W, 0, 0.05, 0);
  box(dome, 0.04, 0.008, 0.006, red, 0, 0.05, -0.026);
  // head (its origin at the bottom, so head items sit on top)
  const head = grp(body, 0, -0.045, -0.3);
  box(head, 0.1, 0.07, 0.08, D, 0, 0.065, 0.06);
  box(head, 0.24, 0.13, 0.16, W, 0, 0.065, 0);
  box(head, 0.245, 0.03, 0.165, Y, 0, 0.125, 0);
  box(head, 0.246, 0.02, 0.165, L, 0, 0.01, 0);
  box(head, 0.2, 0.08, 0.02, B, 0, 0.065, -0.08);
  const eyes = [[-0.045, 0.005, 0.04, 0.045], [0.045, 0.005, 0.04, 0.045], [-0.08, 0.018, 0.016, 0.018], [0.08, 0.018, 0.016, 0.018]]
    .map(([x, y, w, h]) => box(head, w, h, 0.006, mats.eyes, x, 0.065 + y, -0.091));
  const jaws = [-1, 1].map((s) => {
    const j = grp(head, s * 0.07, 0.0, -0.06);
    box(j, 0.035, 0.03, 0.08, D, 0, 0, -0.03);
    box(j, 0.02, 0.02, 0.04, steel, -s * 0.01, 0, -0.08).rotation.y = s * 0.4;
    return [j, s];
  });
  for (const s of [-1, 1]) {
    const f = grp(head, s * 0.1, 0.12, -0.05);
    f.rotation.set(-0.9, 0, -s * 0.5);
    box(f, 0.008, 0.12, 0.008, steel, 0, 0.06, 0);
    box(f, 0.016, 0.016, 0.016, lamp, 0, 0.125, 0);
  }
  const legs = [];
  for (let i = 0; i < 6; i++) {
    const ang = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const hip = grp(body, Math.sin(ang) * 0.3, -0.01, -Math.cos(ang) * 0.3);
    hip.rotation.y = -ang + Math.PI / 2;
    const yaw = grp(hip);
    box(yaw, 0.09, 0.09, 0.09, D);
    box(yaw, 0.094, 0.02, 0.094, Y, 0, 0.04, 0);
    const femur = grp(yaw, 0.03, 0, 0);
    femur.rotation.z = 0.7;
    box(femur, 0.26, 0.065, 0.075, W, 0.14, 0, 0);
    box(femur, 0.26, 0.02, 0.077, L, 0.14, -0.03, 0);
    box(femur, 0.1, 0.067, 0.012, Y, 0.1, 0, 0.034);
    cyl(femur, 0.013, 0.013, 0.12, D, 0.13, -0.05, 0, 0, 0, Math.PI / 2, 8);
    cyl(femur, 0.007, 0.007, 0.08, steel, 0.22, -0.05, 0, 0, 0, Math.PI / 2, 8);
    const knee = grp(femur, 0.28, 0, 0);
    knee.rotation.z = -1.95;
    box(knee, 0.08, 0.08, 0.08, D);
    box(knee, 0.03, 0.03, 0.082, lamp);
    box(knee, 0.32, 0.06, 0.065, W, 0.18, 0, 0);
    box(knee, 0.32, 0.018, 0.067, L, 0.18, 0.025, 0);
    box(knee, 0.06, 0.07, 0.075, D, 0.35, 0, 0);
    box(knee, 0.03, 0.09, 0.09, B, 0.39, 0, 0);
    legs.push({ yaw, femur, knee, i });
  }
  const back = anchor(body, 0, 0.12, 0.05);
  back.rotation.x = -Math.PI / 2;
  const gait = (ph, lift = 1) => {
    for (const l of legs) {
      const p = ph + (l.i % 2) * Math.PI;
      l.yaw.rotation.y = Math.sin(p) * 0.3;
      l.femur.rotation.z = 0.7 + Math.max(0, Math.cos(p)) * 0.35 * lift;
      l.knee.rotation.z = -1.95;
    }
  };
  const anim = {
    step(t) {
      gait(t * Math.PI * 2);
      body.position.y = 0.42 + Math.abs(Math.sin(t * Math.PI * 2)) * 0.015;
      head.rotation.set(0, 0, 0);
    },
    idle(time, idle) {
      for (const l of legs) { l.yaw.rotation.y = 0; l.femur.rotation.z = 0.7; l.knee.rotation.z = -1.95; }
      if (idle > 2.5) legs[0].femur.rotation.z = 0.7 + Math.max(0, Math.sin(time * 8)) * 0.3;
      body.position.y = 0.42 + Math.sin(time * 2.4) * 0.006;
      head.rotation.set(0, idle > 1.5 ? Math.sin((idle - 1.5) * 1.6) * 0.45 : 0, 0);
      jaws.forEach(([j, s]) => { j.rotation.y = s * (0.1 + Math.max(0, Math.sin(time * 3)) * 0.2); });
    },
    fly(level, time) {
      for (const l of legs) { l.yaw.rotation.y = 0; l.femur.rotation.z = 0.7 + 0.6 * level; l.knee.rotation.z = -1.95 - 0.5 * level + Math.sin(time * 6 + l.i) * 0.05; }
      body.position.y = 0.42;
    },
    menu(time, wave) {
      legs[1].femur.rotation.z = 0.7 + wave * 1.0;
      legs[1].yaw.rotation.y = wave * Math.sin(time * 14) * 0.25;
      head.rotation.y = Math.sin(time * 0.7) * 0.35;
    },
    tick(time) {
      dome.rotation.y = time * 2;
      lamp.color.setHSL(0.4, 1, 0.55 + 0.15 * Math.sin(time * 2));
      sideLights.forEach((m, i) => m.color.setHex((Math.floor(time * 6) % 10) === i ? 0x0d3020 : 0x6dffb0));
    },
  };
  return {
    legs: [], arms: [], head, eyes, hands: [], back, anim,
    thrust: [[0, -0.2], [-0.15, 0.12], [0.15, 0.12]].map(([x, z]) => anchor(body, x, -0.1, z)),
    jet: { y: 0.62, z: 0.05, lying: true },
  };
}

// Ролли: a rolling ball droid. A ball with hexagonal hatches sunk into it (a flush accent rim, a
// wall, a dark floor with a lamp, a vent, lights or bolts), seams, and a dome head with a black
// visor and two eyes floating on a glowing magnet ring; a camera on an arm.
function buildRolly(model, mats) {
  const W = mats.body, L = mats.shade, D = mats.dark, B = mats.black, Y = mats.accent;
  const RAD = 0.36, DEPTH = 0.02;
  for (const m of [Y, D, B]) m.side = THREE.DoubleSide;
  const ball = grp(model, 0, RAD, 0);
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0.7, 0.55, 0.7], [-0.7, 0.55, -0.7], [0.7, -0.6, -0.7], [-0.7, -0.6, 0.7]];
  const hatch = dirs.map((d, i) => {
    const n = new THREE.Vector3(...d).normalize();
    const t1 = new THREE.Vector3(0, 1, 0).cross(n);
    if (t1.lengthSq() < 1e-4) t1.set(1, 0, 0);
    t1.normalize();
    return { n, t1, t2: n.clone().cross(t1), r: i < 4 ? 0.36 : 0.26 };
  });
  const HEX = [[1.1547, 0], [0.5774, 1], [-0.5774, 1], [-1.1547, 0], [-0.5774, -1], [0.5774, -1]];
  const hexDist = (h, v) => {
    const z = v.dot(h.n);
    if (z < 0.5) return 9;
    const x = Math.abs(v.dot(h.t1) / z), y = Math.abs(v.dot(h.t2) / z);
    return Math.max(y, x * 0.866 + y * 0.5) / h.r;
  };
  const onBall = (h, x, y, rad) => h.n.clone().addScaledVector(h.t1, x).addScaledVector(h.t2, y).normalize().multiplyScalar(rad);
  const ring = (h, k0, rad0, k1, rad1, steps = 5) => {
    const pts = [], ix = [];
    for (let e = 0; e < 6; e++) {
      const [ax, ay] = HEX[e], [bx, by] = HEX[(e + 1) % 6];
      for (let j = 0; j < steps; j++) {
        const f = j / steps, x = (ax + (bx - ax) * f) * h.r, y = (ay + (by - ay) * f) * h.r;
        pts.push(onBall(h, x * k0, y * k0, rad0), onBall(h, x * k1, y * k1, rad1));
      }
    }
    const n = pts.length / 2;
    for (let i = 0; i < n; i++) { const a = i * 2, b = ((i + 1) % n) * 2; ix.push(a, b, a + 1, b, b + 1, a + 1); }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    g.setIndex(ix); g.computeVertexNormals();
    return g;
  };
  const floor = (h, k, rad, steps = 5) => {
    const pts = [h.n.clone().multiplyScalar(rad)], ix = [];
    for (let e = 0; e < 6; e++) {
      const [ax, ay] = HEX[e], [bx, by] = HEX[(e + 1) % 6];
      for (let j = 0; j < steps; j++) { const f = j / steps; pts.push(onBall(h, (ax + (bx - ax) * f) * h.r * k, (ay + (by - ay) * f) * h.r * k, rad)); }
    }
    const n = pts.length - 1;
    for (let i = 0; i < n; i++) ix.push(0, 1 + ((i + 1) % n), 1 + i);
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    g.setIndex(ix); g.computeVertexNormals();
    return g;
  };
  const mesh = (g, m) => { const o = new THREE.Mesh(g, m); o.castShadow = true; ball.add(o); return o; };
  // the shell with the hatches cut out (the ragged cut hides under each rim)
  const shell = new THREE.SphereGeometry(RAD, 72, 54);
  const pos = shell.attributes.position, v = new THREE.Vector3(), c = new THREE.Vector3();
  const idx = shell.index.array, kept = [];
  for (let t = 0; t < idx.length; t += 3) {
    c.set(0, 0, 0);
    for (let k = 0; k < 3; k++) c.add(v.fromBufferAttribute(pos, idx[t + k]));
    c.normalize();
    if (hatch.every((h) => hexDist(h, c) > 0.88)) kept.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  shell.setIndex(kept);
  mesh(shell, W);
  const UP = RAD + 0.0008;
  const lamps = [];
  hatch.forEach((h, i) => {
    mesh(ring(h, 0.78, UP, 1.0, UP), Y);
    mesh(ring(h, 1.0, RAD + 0.0006, 1.045, RAD + 0.0006), D);
    mesh(ring(h, 0.7, RAD - DEPTH, 0.78, UP), D);
    mesh(floor(h, 0.7, RAD - DEPTH), B);
    const g = grp(ball);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), h.n);
    const k = i < 4 ? 1 : 0.72, z = RAD - DEPTH + 0.004, kind = i % 4;
    if (kind === 0) for (let j = 0; j < 4; j++) box(g, (0.12 - Math.abs(j - 1.5) * 0.025) * k, 0.012 * k, 0.006, D, 0, (-0.039 + j * 0.026) * k, z);
    if (kind === 1) { cyl(g, 0.04 * k, 0.04 * k, 0.006, L, 0, 0, z, Math.PI / 2, 0, 0, 20); const m = own(0x35e6ff); lamps.push(m); cyl(g, 0.026 * k, 0.026 * k, 0.008, m, 0, 0, z + 0.002, Math.PI / 2, 0, 0, 20); }
    if (kind === 2) { const m = own(0xff7a2a); lamps.push(m); for (let j = 0; j < 3; j++) box(g, 0.016 * k, 0.06 * k, 0.006, m, (-0.03 + j * 0.03) * k, 0, z); }
    if (kind === 3) for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2; cyl(g, 0.009 * k, 0.009 * k, 0.006, L, Math.cos(a) * 0.055 * k, Math.sin(a) * 0.055 * k, z, Math.PI / 2, 0, 0, 8); }
  });
  for (const [rx, ry] of [[0.3, 0], [Math.PI / 2, 0.7], [1.1, 2.2]]) {
    const s = new THREE.Mesh(new THREE.TorusGeometry(RAD, 0.0025, 4, 72), D);
    s.rotation.set(rx, ry, 0);
    ball.add(s);
  }
  // magnet ring and the head
  const ringY = RAD * 2 + 0.012;
  const glowRing = own(0x35e6ff);
  const magnet = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.01, 6, 24), glowRing);
  magnet.rotation.x = Math.PI / 2; magnet.position.y = ringY;
  model.add(magnet);
  const haze = keep(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.06, 0.05, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0x35e6ff, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending })));
  haze.position.y = ringY + 0.025;
  model.add(haze);
  const head = grp(model, 0, ringY + 0.065, 0);
  const lathe = (pts, m) => { const o = new THREE.Mesh(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 32), m); o.castShadow = true; head.add(o); return o; };
  lathe([[0.09, -0.05], [0.15, -0.048], [0.172, -0.032], [0.18, -0.01]], D);
  lathe([[0.18, -0.01], [0.182, 0.04], [0.176, 0.09], [0.156, 0.13], [0.12, 0.16], [0.07, 0.177], [0, 0.181]], W);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.181, 0.012, 6, 40), Y);
  band.rotation.x = Math.PI / 2; band.position.y = 0.018; head.add(band);
  lathe([[0, 0.188], [0.045, 0.184], [0.06, 0.176]], Y);
  box(head, 0.22, 0.095, 0.07, B, 0, 0.075, -0.16);
  box(head, 0.226, 0.012, 0.072, Y, 0, 0.128, -0.158);
  const eyes = [-1, 1].map((s) => box(head, 0.04, 0.05, 0.008, mats.eyes, s * 0.048, 0.078, -0.197));
  box(head, 0.03, 0.008, 0.006, mat(0x35e6ff, true), 0, 0.04, -0.196);
  box(head, 0.05, 0.03, 0.04, D, -0.18, 0.09, -0.02);
  const cam = grp(head, -0.2, 0.09, -0.02);
  cyl(cam, 0.028, 0.028, 0.08, W, 0, 0, 0, Math.PI / 2, 0, 0, 16);
  cyl(cam, 0.019, 0.019, 0.01, B, 0, 0, -0.042, Math.PI / 2, 0, 0, 16);
  cyl(cam, 0.009, 0.009, 0.012, mat(0xff3a2a, true), 0, 0, -0.045, Math.PI / 2, 0, 0, 10);
  const rolled = stepper();
  const anim = {
    step(t) {
      ball.rotation.x -= rolled(t) / RAD;
      head.position.y = ringY + 0.065 + Math.sin(t * Math.PI) * 0.02;
      head.rotation.set(-0.12 * Math.sin(t * Math.PI), 0, 0);
    },
    idle(time, idle, riding) {
      head.position.y = ringY + 0.065 + Math.sin(time * 3) * 0.008;
      head.rotation.set(Math.sin(time * 1.6) * 0.05, idle > 1.5 ? Math.sin((idle - 1.5) * 1.6) * 0.5 : 0, riding ? Math.sin(time * 2.2) * 0.08 : 0);
    },
    fly(level) { head.rotation.set(0.1 * level, 0, 0); },
    menu(time, wave) {
      head.rotation.set(0, Math.sin(time * 0.7) * 0.35 + wave * Math.sin(time * 9) * 0.3, wave * 0.2);
    },
    tick(time) {
      glowRing.color.setHSL(0.52, 1, 0.5 + 0.15 * Math.sin(time * 6));
      haze.scale.set(1 + 0.08 * Math.sin(time * 6), 1, 1 + 0.08 * Math.sin(time * 6));
      lamps.forEach((m, i) => { m.color.setHex(Math.floor(time * 3 + i) % 4 ? (m.userData.on ??= m.color.getHex()) : 0x111318); });
    },
  };
  return {
    legs: [], arms: [], head, eyes, hands: [], back: null, anim,
    thrust: [anchor(model, 0, 0.0, 0)],
    jet: { y: ringY + 0.09, z: 0.2 },
  };
}

// An empty group where garage items get attached.
function anchor(parent, x, y, z) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// Recolor a robot built by makeRobot (garage skins).
export function paintRobot(robot, colors) {
  const m = robot.mats;
  if (!m) return;
  if (colors.white != null) m.body.color.setHex(colors.white);
  if (colors.light != null) m.shade.color.setHex(colors.light);
  if (colors.yellow != null) m.accent.color.setHex(colors.yellow);
  if (colors.black != null) m.black.color.setHex(colors.black);
  if (colors.dark != null) m.dark.color.setHex(colors.dark);
  // accents glow a little (more in the neon schemes) so they read on any body colour
  if (colors.glow != null && colors.yellow != null) m.accent.emissive.setHex(colors.yellow).multiplyScalar(colors.glow);
  // the light bands can glow too (neon schemes)
  if (colors.light != null) m.shade.emissive.setHex(colors.light).multiplyScalar(colors.bandGlow ?? 0);
  if (colors.eyes != null) m.eyes.color.setHex(colors.eyes);
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
// Anti-gravity pad: a bright, clearly solid deck with a thick neon rim and a glow underneath,
// so it reads at a glance against the dark gap.
export function makePad(len) {
  const g = new THREE.Group();
  const L = len - 0.08;
  box(g, L, 0.18, 0.86, 0x3a3e6a, 0, -0.11, 0);          // body
  box(g, L - 0.04, 0.03, 0.8, 0xd4d8ee, 0, -0.005, 0);   // light deck
  for (let i = 1; i < len; i++) box(g, 0.03, 0.035, 0.7, 0x9aa0c4, -len / 2 + i, -0.002, 0);
  for (const z of [-0.43, 0.43]) box(g, L + 0.02, 0.07, 0.06, 0x35e6ff, 0, -0.04, z, true);   // thick rim
  for (const x of [-L / 2, L / 2]) box(g, 0.08, 0.08, 0.86, 0xff4fd8, x, -0.04, 0, true);       // glowing ends
  // small thrusters under the deck instead of a glowing slab
  for (let i = 0; i < len; i++) {
    const x = -len / 2 + 0.5 + i;
    box(g, 0.22, 0.08, 0.22, 0x23253a, x, -0.24, 0);
    box(g, 0.12, 0.03, 0.12, 0x9ff3ff, x, -0.29, 0, true);
  }
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
// Electrified floor panel: a raised yellow/black frame you can see from far away. The game adds
// the swapping centre, the lightning glyph and the warning hologram.
export function shockTile(p, x) {
  box(p, 0.96, 0.03, 0.96, 0x1a1a22, x, 0.015, 0);
  for (const [w, d, dx, dz] of [[0.96, 0.09, 0, 0.44], [0.96, 0.09, 0, -0.44], [0.09, 0.78, 0.44, 0], [0.09, 0.78, -0.44, 0]]) {
    const n = 6;
    for (let i = 0; i < n; i++) {
      const along = w > d;
      const len = (along ? w : d) / n;
      const ox = along ? -w / 2 + len * (i + 0.5) : 0;
      const oz = along ? 0 : -d / 2 + len * (i + 0.5);
      box(p, along ? len : w, 0.06, along ? d : len, i % 2 ? 0x1a1a1a : 0xffc21a, x + dx + ox, 0.03, dz + oz);
    }
  }
}
// zig-zag lightning glyph on the panel (material is per tile so it can blink)
export function boltGlyph(p, x, material) {
  const parts = [[0.08, 0.26, 0.05, -0.1, 0.5], [0.08, 0.2, -0.02, 0.0, -0.9], [0.08, 0.26, -0.05, 0.12, 0.5]];
  for (const [w, d, dx, dz, r] of parts) {
    const m = new THREE.Mesh(geo(w, 0.012, d, false), material);
    m.position.set(x + dx, 0.035, dz);
    m.rotation.y = r;
    p.add(m);
  }
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
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.45, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.015;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.48, 24), new THREE.MeshBasicMaterial({ color: 0xff2b4a, transparent: true, opacity: 0.9, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.017;
  g.add(shadow, ring);
  // striped target square around the cell
  for (const [w, d, dx, dz] of [[0.96, 0.06, 0, 0.47], [0.96, 0.06, 0, -0.47], [0.06, 0.96, 0.47, 0], [0.06, 0.96, -0.47, 0]]) {
    for (let i = 0; i < 6; i++) {
      const along = w > d;
      const len = (along ? w : d) / 6;
      const m = new THREE.Mesh(geo(along ? len : w, 0.02, along ? d : len, false), mat(i % 2 ? 0x1a1a1a : 0xffc21a, true));
      m.position.set(dx + (along ? -w / 2 + len * (i + 0.5) : 0), 0.02, dz + (along ? 0 : -d / 2 + len * (i + 0.5)));
      g.add(m);
    }
  }
  // targeting laser from the sky
  const column = new THREE.Mesh(geo(0.05, 9, 0.05, false), new THREE.MeshBasicMaterial({ color: 0xff3050, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
  column.position.y = 4.5;
  g.add(column);
  g.userData = { shadow, ring, column };
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

// ---------------------------------------------------------------- flight center & jetpack
// A landing pad across the whole street (the robot cannot miss it) under a neon arch, with hangars.
// Ability stations (flight center, shield generator): a glowing pad across the street, a ring
// in the middle under a hologram, and tall booths with screens on both sides, all in the
// station's own colour so it reads from far away.
export const STATION_COLOR = { flight: 0x35e6ff, shield: 0x6dffb0 };
export function station(p, half, kind) {
  const c = STATION_COLOR[kind] ?? 0x35e6ff;
  const w = half * 2 + 1.4;
  box(p, w, 0.04, 0.96, 0x23253e, 0, 0.02, 0);
  for (const z of [-0.45, 0.45]) box(p, w, 0.03, 0.06, c, 0, 0.045, z, true);
  for (let x = -half; x <= half; x++) {
    if (x === 0) continue;
    // chevrons pointing forward on every cell
    for (const s of [-1, 1]) box(p, 0.3, 0.012, 0.07, 0xffd21f, x + s * 0.1, 0.045, 0.05, true).rotation.y = s * 0.7;
  }
  // ring under the hologram
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.34, 0.46, 24), new THREE.MeshBasicMaterial({ color: c }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.05;
  p.add(ring);
  box(p, 0.5, 0.02, 0.5, 0x1a1c34, 0, 0.042, 0);
  for (const s of [-1, 1]) {
    const x = s * (half + 1.7);
    box(p, 1.6, 2.6, 0.96, 0x2e3256, x, 1.3, 0);                // booth
    box(p, 1.7, 0.12, 1.0, c, x, 2.66, 0, true);                // neon roof edge
    box(p, 1.3, 0.3, 1.0, 0x3a3e66, x, 2.85, 0);
    box(p, 0.08, 1.2, 0.08, 0x55597a, x - s * 0.5, 3.6, 0);     // antenna
    box(p, 0.16, 0.16, 0.16, 0xff2b4a, x - s * 0.5, 4.25, 0, true);
    box(p, 1.2, 1.0, 0.04, 0x0b1426, x, 1.5, 0.49);              // screen
    box(p, 1.22, 0.06, 0.05, c, x, 2.04, 0.5, true);
    box(p, 1.22, 0.06, 0.05, c, x, 0.98, 0.5, true);
    box(p, 0.06, 2.6, 0.06, c, x - s * 0.82, 1.3, 0.47, true);   // corner light on the street side
  }
}

// The hologram above the ring: the reward of the station, turning slowly in a beam of light.
export function stationHolo(kind) {
  const c = STATION_COLOR[kind] ?? 0x35e6ff;
  const g = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 2.4, 16, 1, true), ADD(c, 0.16));
  beam.position.y = 1.25;
  g.add(beam);
  const holo = new THREE.Group();
  holo.position.y = 1.7;
  g.add(holo);
  const mat = new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85 });
  const glowMat = ADD(c, 0.35);
  if (kind === 'shield') {
    // hexagonal shield with a bright rim
    const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 6), mat);
    hex.rotation.x = Math.PI / 2;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    rim.rotation.z = Math.PI / 6;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    core.rotation.x = Math.PI / 2;
    holo.add(hex, rim, core);
  } else {
    // jetpack: two tanks, a strap plate and flames
    for (const sx of [-1, 1]) {
      const tank = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.62, 0.26), mat);
      tank.position.x = sx * 0.17;
      const flame = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.16), new THREE.MeshBasicMaterial({ color: 0xffa21a }));
      flame.position.set(sx * 0.17, -0.5, 0);
      holo.add(tank, flame);
    }
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.5, 0.1), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    plate.position.z = 0.12;
    holo.add(plate);
  }
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.75, 12, 10), glowMat);
  holo.add(halo);
  g.userData = { holo, beam };
  return g;
}

export function makeJetpack() {
  // a back plate with straps, two tanks with domed caps and accent rings, a glowing core and
  // flared nozzles; the flames are cones that the game flickers
  const g = new THREE.Group();
  const lit = (c) => new THREE.MeshLambertMaterial({ color: c });
  const glow = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, depthWrite: o >= 1 });
  const add = (geo, m, x, y, z, rx = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.x = rx; o.castShadow = !m.isMeshBasicMaterial; g.add(o); return o; };
  const plate = lit(0x2e3148), tank = lit(0xdfe3ee), ring = lit(0xd6a124), metal = lit(0x8a90a8), dark = lit(0x1a1b24);
  add(new THREE.BoxGeometry(0.2, 0.28, 0.04), plate, 0, 0, -0.01);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.035, 0.3, 0.02), dark, s * 0.07, 0.0, -0.035);
  const flames = [];
  for (const s of [-1, 1]) {
    const x = s * 0.075;
    add(new THREE.CylinderGeometry(0.058, 0.058, 0.24, 16), tank, x, 0.0, 0.05);
    add(new THREE.SphereGeometry(0.058, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), tank, x, 0.12, 0.05);
    for (const y of [0.07, -0.07]) add(new THREE.CylinderGeometry(0.06, 0.06, 0.022, 16), ring, x, y, 0.05);
    add(new THREE.CylinderGeometry(0.012, 0.012, 0.03, 8), metal, x, 0.185, 0.05);
    add(new THREE.CylinderGeometry(0.05, 0.04, 0.03, 14), metal, x, -0.135, 0.05);
    add(new THREE.CylinderGeometry(0.036, 0.05, 0.06, 14), dark, x, -0.18, 0.05);
    add(new THREE.CylinderGeometry(0.03, 0.03, 0.004, 12), glow(0xffa21a), x, -0.211, 0.05);
    const f = add(new THREE.CylinderGeometry(0.045, 0, 0.28, 12), glow(0xffa21a, 0.9), x, -0.35, 0.05);
    const core = add(new THREE.CylinderGeometry(0.024, 0, 0.2, 10), glow(0xfff1a8), x, -0.31, 0.05);
    f.visible = core.visible = false;
    flames.push(f, core);
  }
  // glowing core between the tanks, with a status light
  add(new THREE.BoxGeometry(0.05, 0.16, 0.05), dark, 0, 0.0, 0.06);
  add(new THREE.BoxGeometry(0.03, 0.12, 0.012), glow(0x35e6ff), 0, 0.0, 0.088);
  add(new THREE.BoxGeometry(0.02, 0.02, 0.012), glow(0xff3a5a), 0, 0.095, 0.088);
  g.userData.flames = flames;
  for (const f of flames) f.userData.keep = true;
  return bakeParts(g);
}

// Sky obstacles for jetpack flights. Every one gets a pulsing red danger aura and a blinking
// beacon (materials returned in userData so the game can animate them) so it reads at a glance.
export const AIR_WIDTH = { taxi: 2, cargo: 1, laser: 3, billboard: 2, blimp: 2, swarm: 1, mast: 1 };

export function makeAirObstacle(kind) {
  const w = AIR_WIDTH[kind];
  const g = new THREE.Group();
  let h = 0.9; // height of the danger aura
  if (kind === 'taxi') {
    const car = makeVehicle(Math.random() < 0.5 ? 'hovercar' : 'taxi');
    car.position.y = -0.4;
    g.add(car);
  } else if (kind === 'cargo') {
    box(g, 0.5, 0.14, 0.4, 0x2a2c48, 0, 0.42, 0);
    for (const [dx, dz] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) box(g, 0.24, 0.02, 0.24, 0x35e6ff, dx, 0.5, dz, true);
    box(g, 0.04, 0.2, 0.04, 0x55597a, 0, 0.27, 0);
    box(g, 0.78, 0.55, 0.6, pick([0xd84a3a, 0x2b6bff, 0xffa21a, 0x3dbf6a]), 0, -0.08, 0);
    for (let i = -2; i <= 2; i++) box(g, 0.02, 0.5, 0.61, 0x1a1a1a, i * 0.15, -0.08, 0);
    h = 1.1;
  } else if (kind === 'laser') {
    // two hovering emitters with a red beam between them (3 lanes wide)
    for (const s of [-1, 1]) {
      box(g, 0.3, 0.3, 0.3, 0x2a2c48, s * 1.35, 0, 0);
      box(g, 0.34, 0.04, 0.34, 0xff2b4a, s * 1.35, 0.17, 0, true);
    }
    const beam = new THREE.Mesh(geo(2.4, 0.08, 0.08, false), new THREE.MeshBasicMaterial({ color: 0xff3050 }));
    const glow = new THREE.Mesh(geo(2.4, 0.3, 0.3, false), new THREE.MeshBasicMaterial({ color: 0xff2b4a, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(beam, glow);
    h = 0.5;
  } else if (kind === 'billboard') {
    box(g, 1.9, 1.0, 0.08, 0x1d1e30, 0, 0, 0);
    sign(g, 1.7, 0.85, 0.1, 'logo', Math.floor(Math.random() * 3), 0, 0, 0);
    box(g, 1.94, 0.05, 0.1, 0xff2b4a, 0, 0.52, 0, true);
    box(g, 1.94, 0.05, 0.1, 0xff2b4a, 0, -0.52, 0, true);
    for (const s of [-1, 1]) box(g, 0.2, 0.12, 0.2, 0x2a2c48, s * 0.8, 0.6, 0);
    h = 1.2;
  } else if (kind === 'blimp') {
    box(g, w * 0.95, 0.5, 0.6, 0x7b3fe4);
    box(g, w * 0.75, 0.66, 0.5, 0x7b3fe4);
    box(g, w * 0.5, 0.2, 0.3, 0x2a2c48, 0, -0.42, 0);
    box(g, 0.2, 0.4, 0.06, 0xff4fd8, -w * 0.48, 0.15, 0);
    sign(g, w * 0.55, 0.3, 0.62, 'word', 0, 0, 0.02, 0);
  } else if (kind === 'mast') {
    // antenna mast rising from the street below up into the flight path
    box(g, 0.18, 4.4, 0.18, 0x6a6f98, 0, -2.0, 0);
    for (let y = -3.6; y < 0; y += 0.6) box(g, 0.34, 0.04, 0.34, 0x8a8fb8, 0, y, 0);
    box(g, 0.5, 0.5, 0.1, 0xd9dce4, 0, 0.1, 0.12);
    box(g, 0.06, 0.6, 0.06, 0x6a6f98, 0, 0.5, 0);
    h = 1.3;
  } else {
    for (const [dx, dy] of [[-0.22, 0.12], [0.2, -0.05], [0, 0.3]]) {
      box(g, 0.26, 0.1, 0.22, 0x2a2c48, dx, dy, 0);
      box(g, 0.3, 0.02, 0.3, 0xff6a7a, dx, dy + 0.07, 0, true);
      box(g, 0.14, 0.12, 0.14, 0xffc21a, dx, dy - 0.1, 0);
    }
  }
  // danger aura + beacon
  const aura = new THREE.MeshBasicMaterial({ color: 0xff2b4a, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending });
  const auraBox = new THREE.Mesh(geo(w - 0.1, h, 0.75, false), aura);
  g.add(auraBox);
  const beacon = new THREE.MeshBasicMaterial({ color: 0xff2b4a });
  const b = new THREE.Mesh(geo(0.14, 0.14, 0.14, false), beacon);
  b.position.y = h / 2 + 0.12;
  g.add(b);
  g.userData = { w, aura, beacon, top: h / 2 + 0.45 };
  return g;
}
