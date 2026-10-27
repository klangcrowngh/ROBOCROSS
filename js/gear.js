// Garage items: head, neck, hand (dog: modules and sneakers) and back items, plus the bake step
// that merges the static parts of an item into one mesh per material (many details, few draw
// calls). Animated parts are kept apart with live().
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- kit
const GEO = new Map();
const cached = (key, make) => { let g = GEO.get(key); if (!g) GEO.set(key, (g = make())); return g; };
// rounded box, plain box, cylinder (axis y), sphere (part), torus (in the xy plane), cone (apex up)
const R = (w, h, d, r = Math.min(w, h, d) * 0.3) => cached(`R${w},${h},${d},${r}`, () => new RoundedBoxGeometry(w, h, d, 2, r));
const B = (w, h, d) => cached(`B${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const C = (rt, rb, h, n = 14, open = false) => cached(`C${rt},${rb},${h},${n},${open}`, () => new THREE.CylinderGeometry(rt, rb, h, n, 1, open));
const S = (r, n = 14, th = Math.PI) => cached(`S${r},${n},${th}`, () => new THREE.SphereGeometry(r, n, Math.max(4, Math.round(n * 0.6 * th / Math.PI)), 0, Math.PI * 2, 0, th));
const T = (r, tube, n = 18, arc = Math.PI * 2) => cached(`T${r},${tube},${n},${arc}`, () => new THREE.TorusGeometry(r, tube, 6, n, arc));
const K = (r, h, n = 14) => C(0, r, h, n);

const lit = (c) => new THREE.MeshLambertMaterial({ color: c });
// lit, but also glowing a little in its own colour (reads at night and next to neon)
const shine = (c, k = 0.35) => new THREE.MeshLambertMaterial({ color: c, emissive: new THREE.Color(c).multiplyScalar(k) });
const glow = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c, transparent: o < 1, opacity: o, depthWrite: o >= 1 });
const haze = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending });
const glass = (c, o) => new THREE.MeshLambertMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide });
const tone = (c, k) => new THREE.Color(c).multiplyScalar(k).getHex();
const toward = (c, d, k) => new THREE.Color(c).lerp(new THREE.Color(d), k).getHex();

function part(p, geo, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.castShadow = !m.isMeshBasicMaterial && !m.transparent;
  p.add(o);
  return o;
}
const live = (o) => { o.userData.keep = true; return o; };
const grp = (p, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); p.add(g); return g; };

// Merge the static meshes of every group (per material) into one mesh. Groups and live() meshes
// stay as they are, so anything animated keeps its own transform.
export function bake(g) {
  for (const c of [...g.children]) if (!c.isMesh) bake(c);
  const by = new Map();
  for (const c of g.children) {
    if (!c.isMesh || c.userData.keep) continue;
    if (!by.has(c.material)) by.set(c.material, []);
    by.get(c.material).push(c);
  }
  for (const [m, list] of by) {
    if (list.length < 2) continue;
    const geos = list.map((o) => {
      o.updateMatrix();
      const gg = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
      gg.morphAttributes = {};
      return gg.applyMatrix4(o.matrix);
    });
    const merged = mergeGeometries(geos);
    geos.forEach((gg) => gg.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, m);
    mesh.castShadow = list[0].castShadow;
    for (const o of list) g.remove(o);
    g.add(mesh);
  }
  return g;
}

// ---------------------------------------------------------------- head items
// Built for the Agibot head (0.21 wide, top at y 0.22, face at z -0.106); the group is stretched
// to the other heads. Items that belong to the dog's jaw use the unscaled root.
const HEAD = { rr: [0.105, -0.106, 0.106, 0.22], titan: [0.121, -0.117, 0.116, 0.222], dog: [0.115, -0.094, 0.075, 0.22] };

export function accessory(kind, a, model = 'rr') {
  const root = new THREE.Group();
  const [hw, front, back, top] = HEAD[model] ?? HEAD.rr;
  const g = grp(root, 0, 0, (front + back) / 2);
  g.scale.set(hw / 0.105, top / 0.22, (back - front) / 0.212);
  const metal = lit(0xb2b8cc), dark = lit(0x24252e), steel = lit(0x6c7290);
  const ticks = [];
  const pulse = (m, c, speed, lo = 0.55) => { const base = new THREE.Color(c); ticks.push((t) => m.color.copy(base).multiplyScalar(lo + (1 - lo) * (Math.sin(t * speed) * 0.5 + 0.5))); };

  if (kind === 'antenna') {
    part(g, C(0.034, 0.04, 0.02), dark, 0.05, 0.23, 0);
    part(g, C(0.022, 0.026, 0.014), steel, 0.05, 0.246, 0);
    part(g, C(0.007, 0.009, 0.1), metal, 0.05, 0.3, 0);
    part(g, T(0.013, 0.004, 12), shine(a), 0.05, 0.33, 0, Math.PI / 2);
    part(g, C(0.005, 0.006, 0.06), metal, 0.05, 0.375, 0);
    const ball = glow(a);
    part(g, S(0.022), ball, 0.05, 0.415, 0);
    const halo = live(part(g, S(0.04, 10), haze(a, 0.3), 0.05, 0.415, 0));
    pulse(ball, a, 6);
    ticks.push((t) => halo.scale.setScalar(0.8 + 0.35 * (Math.sin(t * 6) * 0.5 + 0.5)));
    // a short second whip
    part(g, C(0.004, 0.006, 0.07), metal, -0.055, 0.26, 0.03, 0, 0, 0.35);
    part(g, S(0.01, 8), glow(0xffffff), -0.067, 0.293, 0.03);
  } else if (kind === 'cone') {
    // a traffic cone stuck on the head, reflective bands, scuffed base
    const o = shine(0xff6a00, 0.25), w = shine(0xf4f6ff, 0.4);
    part(g, R(0.21, 0.025, 0.21, 0.008), o, 0, 0.232, 0);
    part(g, R(0.21, 0.006, 0.21, 0.003), dark, 0, 0.222, 0);
    part(g, C(0.016, 0.075, 0.2, 18), o, 0, 0.345, 0);
    part(g, C(0.058, 0.066, 0.028, 18), w, 0, 0.3, 0);
    part(g, C(0.036, 0.044, 0.028, 18), w, 0, 0.38, 0);
    part(g, S(0.017, 10), o, 0, 0.445, 0);
  } else if (kind === 'shades') {
    // wraparound visor glasses: frame, glowing lenses with a glint, arms back to the ears
    const frame = lit(0x111218), lens = shine(a, 0.6);
    part(g, R(0.225, 0.052, 0.02, 0.008), frame, 0, 0.126, -0.114);
    for (const s of [-1, 1]) {
      part(g, R(0.088, 0.04, 0.012, 0.006), lens, s * 0.05, 0.126, -0.125);
      part(g, B(0.03, 0.008, 0.004), glow(0xffffff), s * 0.05 - 0.018, 0.136, -0.132, 0, 0, 0.5);
      part(g, B(0.01, 0.006, 0.004), glow(0xffffff), s * 0.05 + 0.004, 0.13, -0.132, 0, 0, 0.5);
      part(g, R(0.012, 0.016, 0.2, 0.005), frame, s * 0.112, 0.13, -0.02);
    }
    part(g, B(0.022, 0.012, 0.014), frame, 0, 0.118, -0.128);
    part(g, B(0.23, 0.007, 0.008), glow(a), 0, 0.153, -0.122);
  } else if (kind === 'cap') {
    // baseball cap: panelled crown, curved visor, glowing badge, button on top
    const c = lit(a), c2 = lit(tone(a, 0.72));
    part(g, R(0.226, 0.055, 0.226, 0.022), c, 0, 0.243, 0);
    part(g, R(0.19, 0.035, 0.19, 0.016), c, 0, 0.278, 0);
    for (const r of [0, Math.PI / 2]) part(g, B(0.006, 0.072, 0.228), c2, 0, 0.26, 0, 0, r);
    part(g, R(0.2, 0.014, 0.12, 0.006), c2, 0, 0.228, -0.155, -0.1);
    part(g, R(0.17, 0.006, 0.09, 0.003), dark, 0, 0.22, -0.145, -0.1);
    part(g, R(0.05, 0.034, 0.008, 0.004), glow(0xffffff), 0, 0.255, -0.114);
    part(g, R(0.032, 0.018, 0.009, 0.003), glow(a), 0, 0.255, -0.117);
    part(g, S(0.016, 10, Math.PI / 2), c2, 0, 0.295, 0);
    part(g, R(0.08, 0.018, 0.012, 0.004), dark, 0, 0.238, 0.114);
  } else if (kind === 'bulb') {
    // an idea lamp: ribbed screw base, glass bulb, glowing filament, a pulsing halo
    for (let i = 0; i < 4; i++) part(g, C(i % 2 ? 0.03 : 0.034, i % 2 ? 0.03 : 0.034, 0.014), metal, 0, 0.232 + i * 0.013, 0);
    part(g, C(0.042, 0.03, 0.03), metal, 0, 0.287, 0);
    part(g, S(0.068, 16), glass(0xfff2b0, 0.45), 0, 0.35, 0);
    const fil = glow(0xffe680);
    part(g, T(0.016, 0.004, 12), fil, 0, 0.355, 0);
    for (const s of [-1, 1]) part(g, B(0.003, 0.05, 0.003), steel, s * 0.016, 0.322, 0);
    const halo = live(part(g, S(0.095, 12), haze(0xffd84a, 0.18), 0, 0.35, 0));
    ticks.push((t) => {
      const k = Math.sin(t * 4) * 0.5 + 0.5;
      fil.color.setHSL(0.13, 1, 0.6 + 0.3 * k);
      halo.scale.setScalar(0.85 + 0.25 * k);
    });
  } else if (kind === 'party') {
    // striped party hat with a fluffy pompom and an elastic, a little askew
    const hat = grp(g, 0.02, 0.22, 0);
    hat.rotation.z = -0.2;
    const cols = [lit(a), lit(0xffffff)];
    const r = (y) => 0.08 * (1 - y / 0.24);
    for (let i = 0; i < 5; i++) {
      const y0 = i * 0.042, y1 = y0 + 0.042;
      part(hat, C(r(y1), r(y0), 0.042, 16), cols[i % 2], 0, (y0 + y1) / 2, 0);
    }
    for (const [x, y, z] of [[0, 0.24, 0], [0.018, 0.25, 0.01], [-0.016, 0.252, -0.008], [0.004, 0.262, 0.014], [-0.006, 0.236, 0.018]]) part(hat, S(0.02, 8), lit(0xffffff), x, y, z);
    for (const s of [-1, 1]) part(g, B(0.006, 0.12, 0.006), dark, s * 0.1, 0.17, -0.02);
  } else if (kind === 'wifi') {
    // a wi-fi sign on a stand whose arcs light up one after another
    part(g, R(0.06, 0.02, 0.05, 0.006), dark, 0, 0.232, 0);
    part(g, C(0.006, 0.006, 0.03), metal, 0, 0.255, 0);
    const dot = glow(a);
    part(g, S(0.016, 10), dot, 0, 0.278, 0);
    const arcs = [0.045, 0.078, 0.11].map((rad) => {
      const m = glow(a);
      part(g, T(rad, 0.01, 16, Math.PI / 2), m, 0, 0.278, 0, 0, 0, Math.PI / 4);
      return m;
    });
    const on = new THREE.Color(a), off = new THREE.Color(a).multiplyScalar(0.18);
    ticks.push((t) => arcs.forEach((m, i) => m.color.copy(Math.floor(t * 3) % 4 > i ? on : off)));
  } else if (kind === 'mohawk') {
    // spiky crest along the head, the tips brighter than the roots
    part(g, R(0.05, 0.016, 0.21, 0.006), dark, 0, 0.226, 0);
    const root = lit(a), tip = shine(toward(a, 0xffffff, 0.45), 0.3);
    [-0.085, -0.05, -0.015, 0.02, 0.055, 0.088].forEach((z, i) => {
      const h = 0.11 - Math.abs(i - 2.2) * 0.018;
      const lean = 0.25 - i * 0.08;
      const sp = grp(g, 0, 0.232, z);
      sp.rotation.x = lean;
      part(sp, C(0.012, 0.028, h * 0.6, 4), root, 0, h * 0.3, 0, 0, Math.PI / 4);
      part(sp, K(0.012, h * 0.45, 4), tip, 0, h * 0.6 + h * 0.22, 0, 0, Math.PI / 4);
    });
  } else if (kind === 'catears') {
    // headband with two cat ears, glowing inner ears and LED tips
    const band = lit(0x2a2b36), inner = shine(a, 0.6);
    part(g, R(0.226, 0.02, 0.04, 0.008), band, 0, 0.226, 0);
    for (const s of [-1, 1]) {
      part(g, R(0.016, 0.07, 0.04, 0.006), band, s * 0.111, 0.2, 0);
      const ear = grp(g, s * 0.068, 0.235, 0);
      ear.rotation.z = -s * 0.28;
      part(ear, K(0.052, 0.1, 4), band, 0, 0.05, 0, 0, Math.PI / 4);
      part(ear, K(0.032, 0.07, 4), inner, 0, 0.04, -0.016, 0, Math.PI / 4);
      part(ear, S(0.008, 8), glow(0xffffff), 0, 0.1, 0);
    }
  } else if (kind === 'horns') {
    // curved horns growing out and forward from metal sockets, with accent rings
    const bone = lit(0xf0e6d2);
    for (const s of [-1, 1]) {
      part(g, C(0.03, 0.034, 0.016), dark, s * 0.072, 0.228, -0.02);
      let seg = grp(g, s * 0.072, 0.232, -0.02);
      const n = 6;
      for (let i = 0; i < n; i++) {
        const r0 = 0.024 * (1 - i / n) + 0.004, r1 = 0.024 * (1 - (i + 1) / n) + 0.004;
        part(seg, C(r1, r0, 0.036, 10), i === 1 ? shine(a, 0.4) : bone, 0, 0.018, 0);
        const next = grp(seg, 0, 0.034, 0);
        next.rotation.set(-0.18, 0, -s * 0.24);
        seg = next;
      }
    }
  } else if (kind === 'propeller') {
    // a striped beanie with a spinning propeller
    const c = lit(a), w = lit(0xffffff);
    part(g, R(0.222, 0.05, 0.222, 0.02), c, 0, 0.24, 0);
    part(g, R(0.17, 0.035, 0.17, 0.015), c, 0, 0.275, 0);
    for (const r of [0, Math.PI / 2]) {
      part(g, R(0.03, 0.012, 0.16, 0.005), w, 0, 0.293, 0, 0, r);
      part(g, R(0.03, 0.04, 0.012, 0.005), w, 0, 0.26, -0.111, 0, r, 0).position.set(Math.sin(r) * -0.111, 0.26, -Math.cos(r) * 0.111);
    }
    part(g, R(0.226, 0.016, 0.226, 0.006), lit(tone(a, 0.7)), 0, 0.222, 0);
    part(g, C(0.008, 0.008, 0.04), metal, 0, 0.31, 0);
    const prop = live(grp(g, 0, 0.33, 0));
    part(prop, C(0.018, 0.018, 0.016), lit(0xffd21f), 0, 0, 0);
    for (const [s, col] of [[1, 0xff3a5a], [-1, 0x35e6ff]]) {
      part(prop, R(0.14, 0.008, 0.04, 0.003), lit(col), s * 0.08, 0, 0, s * 0.25);
    }
    ticks.push((t) => { prop.rotation.y = t * 14; });
  } else if (kind === 'tophat') {
    // a top hat with a curled brim, accent band, a golden buckle
    const black = lit(0x17181f);
    part(g, C(0.15, 0.15, 0.014, 28), black, 0, 0.226, 0);
    part(g, T(0.15, 0.008, 28), black, 0, 0.232, 0, Math.PI / 2);
    part(g, C(0.09, 0.082, 0.17, 24), black, 0, 0.318, 0);
    part(g, C(0.092, 0.092, 0.006, 24), lit(0x25262f), 0, 0.402, 0);
    part(g, C(0.0865, 0.084, 0.034, 24), shine(a, 0.3), 0, 0.256, 0);
    part(g, R(0.036, 0.034, 0.008, 0.004), lit(0xf2c230), 0, 0.256, -0.086);
    part(g, B(0.018, 0.018, 0.009), black, 0, 0.256, -0.088);
  } else if (kind === 'crown') {
    // gold band with eight points, gems on the tips, velvet inside
    const gold = shine(0xf2c230, 0.3);
    part(g, S(0.1, 16, Math.PI / 2), lit(tone(a, 0.6)), 0, 0.226, 0).scale.set(1, 0.55, 1);
    part(g, C(0.108, 0.114, 0.05, 16, true), new THREE.MeshLambertMaterial({ color: 0xf2c230, emissive: 0x4a3a08, side: THREE.DoubleSide }), 0, 0.25, 0);
    part(g, T(0.114, 0.007, 24), gold, 0, 0.226, 0, Math.PI / 2);
    part(g, T(0.108, 0.006, 24), gold, 0, 0.274, 0, Math.PI / 2);
    const gems = [0xff2b4a, 0x2a8bff, 0x30d860, 0xffffff];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const x = Math.sin(ang) * 0.108, z = -Math.cos(ang) * 0.108;
      part(g, K(0.022, 0.06, 4), gold, x, 0.305, z, 0, -ang + Math.PI / 4);
      part(g, S(0.011, 8), glow(gems[i % 4]), x, 0.34, z);
    }
    part(g, R(0.03, 0.03, 0.01, 0.004), glow(0xff2b4a), 0, 0.25, -0.115);
  } else if (kind === 'siren') {
    // police light: chrome base, red and blue domes blinking in turn with a glow around them
    part(g, R(0.16, 0.024, 0.1, 0.008), dark, 0, 0.232, 0);
    part(g, R(0.166, 0.008, 0.106, 0.003), metal, 0, 0.246, 0);
    const red = glow(0xff2030), blue = glow(0x2a6bff);
    const hr = live(part(g, S(0.07, 10), haze(0xff2030, 0.35), -0.04, 0.28, 0));
    const hb = live(part(g, S(0.07, 10), haze(0x2a6bff, 0.35), 0.04, 0.28, 0));
    part(g, C(0.03, 0.034, 0.05, 14), red, -0.04, 0.275, 0);
    part(g, C(0.03, 0.034, 0.05, 14), blue, 0.04, 0.275, 0);
    for (const x of [-0.04, 0.04]) part(g, S(0.03, 12, Math.PI / 2), glass(0xffffff, 0.35), x, 0.3, 0);
    part(g, C(0.012, 0.014, 0.012), metal, 0, 0.256, 0);
    ticks.push((t) => {
      const on = Math.floor(t * 6) % 2;
      red.color.setHex(on ? 0xff2030 : 0x4a0a10);
      blue.color.setHex(on ? 0x0a1440 : 0x2a6bff);
      hr.visible = !!on; hb.visible = !on;
    });
  } else if (kind === 'radar') {
    // rotating radar: base, mast, a slatted antenna and a glowing sweep
    part(g, C(0.04, 0.045, 0.02), dark, 0, 0.23, 0);
    part(g, C(0.01, 0.012, 0.08), metal, 0, 0.28, 0);
    const head = live(grp(g, 0, 0.33, 0));
    const panel = grp(head, 0, 0, 0.01);
    panel.rotation.x = -0.35;
    part(panel, R(0.24, 0.07, 0.014, 0.005), steel, 0, 0, 0);
    for (let i = -5; i <= 5; i++) part(panel, B(0.004, 0.066, 0.018), metal, i * 0.02, 0, 0);
    part(panel, B(0.22, 0.006, 0.006), glow(a), 0, 0.03, -0.009);
    part(head, C(0.016, 0.016, 0.02), dark, 0, 0, 0);
    part(head, S(0.012, 8), glow(a), 0, 0.015, -0.02);
    const sweep = live(part(head, B(0.012, 0.004, 0.16), haze(a, 0.5), 0, -0.01, -0.09));
    ticks.push((t) => { head.rotation.y = t * 2.5; sweep.material.opacity = 0.3 + 0.3 * Math.abs(Math.sin(t * 5)); });
  } else if (kind === 'dish') {
    // satellite dish on a swivel: bowl, rim, three struts and a glowing feed; it slowly tracks
    part(g, C(0.03, 0.035, 0.02), dark, 0.04, 0.23, 0.03);
    part(g, C(0.008, 0.01, 0.06), metal, 0.04, 0.27, 0.03);
    const head = live(grp(g, 0.04, 0.3, 0.03));
    part(head, S(0.014, 8), steel, 0, 0, 0);
    const bowl = grp(head, 0, 0.06, 0.01);
    bowl.rotation.x = -0.5 - Math.PI / 2;
    part(bowl, S(0.12, 18, Math.PI * 0.3), new THREE.MeshLambertMaterial({ color: 0xdfe3ee, side: THREE.DoubleSide }), 0, -0.1, 0);
    part(bowl, T(0.0975, 0.006, 24), metal, 0, -0.07, 0, Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2;
      const st = grp(bowl, Math.cos(ang) * 0.09, -0.07, Math.sin(ang) * 0.09);
      st.lookAt(bowl.localToWorld(new THREE.Vector3(0, 0.02, 0)));
      part(st, B(0.004, 0.004, 0.11), metal, 0, 0, 0.05);
    }
    part(bowl, C(0.012, 0.016, 0.03), dark, 0, 0.02, 0);
    part(bowl, S(0.012, 8), glow(a), 0, 0.04, 0);
    ticks.push((t) => { head.rotation.y = Math.sin(t * 0.7) * 0.5; });
  } else if (kind === 'tesla') {
    // tesla coil: ceramic insulator, copper winding, a toroid with sparks jumping off it
    part(g, C(0.05, 0.056, 0.024), dark, 0, 0.232, 0);
    for (let i = 0; i < 3; i++) part(g, C(0.034, 0.034, 0.01, 14), lit(0xe8e4dc), 0, 0.252 + i * 0.016, 0);
    part(g, C(0.022, 0.022, 0.09, 14), lit(0x8a4a1a), 0, 0.33, 0);
    for (let i = 0; i < 7; i++) part(g, T(0.024, 0.0045, 14), lit(0xd6893a), 0, 0.293 + i * 0.012, 0, Math.PI / 2);
    part(g, T(0.05, 0.017, 20), metal, 0, 0.385, 0, Math.PI / 2);
    const aura = live(part(g, S(0.075, 12), haze(0x9ff3ff, 0.18), 0, 0.385, 0));
    const sparks = [];
    for (let i = 0; i < 5; i++) {
      const sp = live(part(g, B(0.09, 0.006, 0.006), glow(0xbff8ff), 0, 0.385, 0));
      sparks.push(sp);
    }
    ticks.push((t) => {
      aura.scale.setScalar(0.85 + Math.random() * 0.3);
      sparks.forEach((sp, i) => {
        sp.visible = Math.sin(t * 23 + i * 7.1) > 0.2;
        const ang = i * 1.26 + t * 1.3;
        sp.position.set(Math.cos(ang) * 0.09, 0.385 + Math.sin(t * 31 + i) * 0.025, Math.sin(ang) * 0.09);
        sp.rotation.set(0, -ang, Math.sin(t * 40 + i) * 0.6);
      });
    });
  } else if (kind === 'dome') {
    // a brain under a glass dome on a bolted ring, bubbles rising inside
    part(g, C(0.106, 0.112, 0.026, 24), metal, 0, 0.233, 0);
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      part(g, S(0.007, 6), steel, Math.cos(ang) * 0.109, 0.236, Math.sin(ang) * 0.109);
    }
    part(g, T(0.1, 0.005, 24), glow(a), 0, 0.248, 0, Math.PI / 2);
    const pink = lit(0xff86b8), deep = lit(0xd05a8a);
    for (const [x, y, z, r] of [[-0.035, 0.28, -0.02, 0.045], [0.035, 0.28, -0.02, 0.045], [-0.035, 0.28, 0.03, 0.043], [0.035, 0.28, 0.03, 0.043], [-0.02, 0.31, 0, 0.04], [0.02, 0.31, 0, 0.04]]) {
      part(g, S(r, 10), pink, x, y, z);
    }
    part(g, B(0.006, 0.07, 0.11), deep, 0, 0.3, 0);
    part(g, S(0.1, 20, Math.PI / 2), glass(0x9ff3ff, 0.22), 0, 0.245, 0).scale.set(1, 1.15, 1);
    part(g, B(0.02, 0.05, 0.006), glow(0xffffff, 0.7), -0.05, 0.31, -0.07, 0.3, 0.6, 0.2);
    const bubbles = [0, 1, 2].map((i) => live(part(g, S(0.008, 6), glass(0xbff8ff, 0.6), 0.05 - i * 0.04, 0.26, 0.05)));
    ticks.push((t) => bubbles.forEach((b, i) => { b.position.y = 0.26 + (((t * 0.4 + i / 3) % 1) * 0.1); }));
  } else if (kind === 'exhaust') {
    // twin chrome exhaust stacks with heat-blued tips, flames and puffs of smoke
    const chrome = shine(0xd8deec, 0.15), blued = lit(0x5a5fa8);
    const fl = [], smoke = [];
    for (const s of [-1, 1]) {
      part(g, R(0.06, 0.03, 0.06, 0.01), dark, s * 0.06, 0.232, 0.06);
      part(g, C(0.022, 0.022, 0.13, 14), chrome, s * 0.06, 0.3, 0.06);
      part(g, C(0.023, 0.023, 0.03, 14), blued, s * 0.06, 0.355, 0.06);
      part(g, T(0.024, 0.006, 14), chrome, s * 0.06, 0.37, 0.06, Math.PI / 2);
      part(g, C(0.017, 0.017, 0.004, 12), lit(0x0b0b10), s * 0.06, 0.371, 0.06);
      const f = grp(g, s * 0.06, 0.372, 0.06);
      part(f, K(0.02, 0.07, 10), glow(0xff7a1a), 0, 0.035, 0);
      part(f, K(0.011, 0.045, 8), glow(0xfff1a8), 0, 0.023, 0);
      fl.push(live(f));
      smoke.push(live(part(g, S(0.02, 8), glass(0x8a8ea0, 0.4), s * 0.06, 0.42, 0.06)));
    }
    ticks.push((t) => {
      fl.forEach((f, i) => { f.scale.set(1, 0.5 + Math.abs(Math.sin(t * 13 + i * 2)) * 0.9, 1); });
      smoke.forEach((m, i) => { const k = (t * 0.8 + i * 0.5) % 1; m.position.y = 0.41 + k * 0.12; m.scale.setScalar(0.6 + k * 1.2); m.material.opacity = 0.45 * (1 - k); });
    });
  } else if (kind === 'halo') {
    // a golden halo with a soft glow, floating and slowly turning, two sparkles orbiting
    const ring = live(grp(g, 0, 0.34, 0));
    part(ring, T(0.11, 0.013, 32), glow(0xffe066), 0, 0, 0, Math.PI / 2);
    part(ring, T(0.11, 0.03, 32), haze(0xffd84a, 0.25), 0, 0, 0, Math.PI / 2);
    const sp = [0, 1].map(() => live(part(g, B(0.016, 0.016, 0.016), glow(0xffffff), 0, 0.34, 0)));
    ticks.push((t) => {
      ring.position.y = 0.34 + Math.sin(t * 2.5) * 0.012;
      ring.rotation.z = Math.sin(t * 1.2) * 0.08;
      sp.forEach((s, i) => { const ang = t * 2 + i * Math.PI; s.position.set(Math.cos(ang) * 0.11, ring.position.y + 0.01, Math.sin(ang) * 0.11); s.rotation.set(t * 3, t * 2, 0); });
    });
  } else if (kind === 'unicorn') {
    // a twisted rainbow horn on the forehead with a golden root and a sparkling tip
    const cols = [0xff3a5a, 0xffa21a, 0xffe100, 0x30d860, 0x2a8bff, 0xa04dff];
    const horn = grp(g, 0, 0.215, -0.07);
    horn.rotation.x = -0.45;
    part(horn, T(0.03, 0.008, 16), shine(0xf2c230, 0.3), 0, 0.005, 0, Math.PI / 2);
    const h = 0.032, n = 8;
    for (let i = 0; i < n; i++) {
      const r0 = 0.032 * (1 - i / n), r1 = 0.032 * (1 - (i + 1) / n) + 0.002;
      part(horn, C(r1, r0, h, 6), shine(cols[i % 6], 0.3), 0, 0.02 + i * h, 0, 0, i * 0.5);
    }
    const tip = glow(0xffffff);
    part(horn, S(0.008, 8), tip, 0, 0.02 + n * h, 0);
    ticks.push((t) => tip.color.setHSL((t * 0.3) % 1, 1, 0.75));
  } else if (kind === 'arrow') {
    // an arrow straight through the head: shaft, steel head, fletching and a nock
    const wood = lit(0x8a5a2a);
    part(g, C(0.008, 0.008, 0.42, 8), wood, 0, 0.14, 0.02, 0, 0, Math.PI / 2);
    part(g, K(0.022, 0.06, 4), metal, 0.24, 0.14, 0.02, 0, 0, -Math.PI / 2);
    part(g, C(0.011, 0.011, 0.02, 8), steel, 0.205, 0.14, 0.02, 0, 0, Math.PI / 2);
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * Math.PI * 2;
      part(g, B(0.07, 0.03, 0.002), lit(i ? 0xff3a3a : 0xffffff), -0.18, 0.14 + Math.cos(ang) * 0.016, 0.02 + Math.sin(ang) * 0.016, ang);
    }
    part(g, C(0.01, 0.01, 0.014, 8), lit(a), -0.218, 0.14, 0.02, 0, 0, Math.PI / 2);
  } else if (kind === 'headphones') {
    // studio headphones: padded band, big cups with glowing rings, a mic boom on one side
    part(g, T(0.155, 0.011, 24, Math.PI), dark, 0, 0.13, 0);
    part(g, T(0.152, 0.016, 12, Math.PI * 0.55), lit(0x3a3b48), 0, 0.13, 0, 0, 0, Math.PI * 0.225);
    for (const s of [-1, 1]) {
      part(g, R(0.03, 0.05, 0.04, 0.008), steel, s * 0.155, 0.15, 0);
      part(g, C(0.062, 0.062, 0.05, 20), lit(a), s * 0.168, 0.11, 0, 0, 0, Math.PI / 2);
      part(g, C(0.05, 0.05, 0.012, 20), dark, s * 0.196, 0.11, 0, 0, 0, Math.PI / 2);
      part(g, T(0.056, 0.006, 20), glow(toward(a, 0xffffff, 0.3)), s * 0.194, 0.11, 0, 0, Math.PI / 2);
      part(g, T(0.05, 0.014, 18), lit(0x2a2b33), s * 0.142, 0.11, 0, 0, Math.PI / 2);
    }
    const boom = grp(g, -0.19, 0.09, 0);
    boom.rotation.set(0, -0.7, 0.35);
    part(boom, C(0.005, 0.005, 0.13, 6), dark, 0, 0, -0.06, Math.PI / 2);
    part(boom, S(0.013, 8), lit(0x2a2b33), 0, 0, -0.125);
    part(boom, S(0.005, 6), glow(0xff3a3a), 0.01, 0.008, -0.125);
  } else if (kind === 'bone') {
    // a bone in the dog's mouth, across the jaw (unscaled: the dog's own head frame)
    const w = lit(0xf4f0e4);
    part(root, C(0.016, 0.016, 0.2, 10), w, 0, 0.0, -0.13, 0, 0, Math.PI / 2);
    for (const s of [-1, 1]) for (const dz of [-0.016, 0.016]) part(root, S(0.024, 10), w, s * 0.105, 0.0, -0.13 + dz);
  }

  bake(root);
  if (ticks.length) root.userData.tick = (t) => ticks.forEach((f) => f(t));
  return root;
}

// ---------------------------------------------------------------- hand items
// Hand frame: origin at the hand, the arm hangs along -y, forward is -z, outwards is sign(x).
export function handItems(robot, kind, a) {
  const objs = [], ticks = [];
  const [left, right] = robot.hands ?? [];
  const group = (anchor) => { const g = new THREE.Group(); anchor.add(g); objs.push(g); return g; };
  const metal = lit(0xb2b8cc), dark = lit(0x23242c), steel = lit(0x6c7290);
  const pulse = (m, c, speed, lo = 0.5) => { const base = new THREE.Color(c); ticks.push((t) => m.color.copy(base).multiplyScalar(lo + (1 - lo) * (Math.sin(t * speed) * 0.5 + 0.5))); };

  if (robot.motors && ['armor', 'beacons', 'lights', 'rockets', 'turrets'].includes(kind)) {
    // the dog's modules sit on top of its motor cubes (front pair for the weapons and lights)
    const front = robot.motors.slice(0, 2);
    if (kind === 'armor') {
      // layered shoulder plates with glowing edges and rivets
      for (const m of robot.motors) {
        const g = group(m), s = Math.sign(m.position.x);
        part(g, R(0.16, 0.035, 0.21, 0.012), lit(a), 0, 0.02, 0);
        part(g, R(0.12, 0.025, 0.16, 0.01), lit(tone(a, 0.8)), 0, 0.045, 0);
        part(g, R(0.035, 0.14, 0.21, 0.012), lit(a), s * 0.078, -0.045, 0);
        part(g, R(0.03, 0.1, 0.17, 0.01), lit(tone(a, 0.8)), s * 0.096, -0.05, 0);
        part(g, B(0.006, 0.012, 0.2), glow(0xffffff), s * 0.097, -0.11, 0);
        for (const z of [-0.08, 0.08]) part(g, S(0.009, 6), metal, s * 0.097, 0.0, z);
      }
    } else if (kind === 'beacons') {
      // caged warning lamps blinking in turn
      const lamps = robot.motors.map((m) => {
        const g = group(m);
        part(g, C(0.034, 0.04, 0.022), dark, 0, 0.012, 0);
        const mat = glow(a);
        part(g, S(0.03, 12, Math.PI / 2), mat, 0, 0.024, 0);
        part(g, C(0.03, 0.03, 0.02, 12), mat, 0, 0.034, 0).position.y = 0.024;
        for (let i = 0; i < 4; i++) {
          const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
          part(g, B(0.004, 0.06, 0.004), metal, Math.cos(ang) * 0.034, 0.05, Math.sin(ang) * 0.034);
        }
        part(g, T(0.034, 0.004, 12), metal, 0, 0.08, 0, Math.PI / 2);
        const halo = live(part(g, S(0.06, 10), haze(a, 0.3), 0, 0.045, 0));
        return [mat, halo];
      });
      const on = new THREE.Color(a), off = new THREE.Color(a).multiplyScalar(0.15);
      ticks.push((t) => lamps.forEach(([m, h], i) => { const lit_ = (Math.floor(t * 4) + i) % 2; m.color.copy(lit_ ? on : off); h.visible = !!lit_; }));
    } else if (kind === 'lights') {
      // floodlights on brackets with a ribbed housing and light beams
      for (const m of front) {
        const g = group(m);
        for (const s of [-1, 1]) part(g, B(0.008, 0.05, 0.03), steel, s * 0.045, 0.025, 0);
        part(g, R(0.08, 0.07, 0.11, 0.014), dark, 0, 0.06, -0.01);
        for (let i = 0; i < 3; i++) part(g, B(0.082, 0.004, 0.02), steel, 0, 0.096, 0.02 - i * 0.025);
        part(g, B(0.084, 0.012, 0.112), lit(a), 0, 0.03, -0.01);
        part(g, C(0.033, 0.033, 0.012, 16), metal, 0, 0.06, -0.066, Math.PI / 2);
        part(g, C(0.027, 0.027, 0.006, 16), glow(0xfff6c8), 0, 0.06, -0.073, Math.PI / 2);
        part(g, C(0.03, 0.24, 0.8, 16, true), haze(0xfff1a8, 0.13), 0, 0.06, -0.48, Math.PI / 2);
      }
    } else if (kind === 'rockets') {
      // launch pods with four rockets each, hazard stripes and side fins
      for (const m of front) {
        const g = group(m), s = Math.sign(m.position.x);
        part(g, R(0.11, 0.1, 0.15, 0.014), lit(a), 0, 0.055, 0);
        part(g, B(0.112, 0.02, 0.03), dark, 0, 0.055, 0.05);
        for (let i = 0; i < 3; i++) part(g, B(0.016, 0.022, 0.032), lit(0xffd21f), -0.035 + i * 0.035, 0.055, 0.05, 0, 0, 0.6);
        part(g, B(0.1, 0.09, 0.006), dark, 0, 0.055, -0.076);
        for (const [x, y] of [[-0.025, 0.033], [0.025, 0.033], [-0.025, 0.077], [0.025, 0.077]]) {
          part(g, C(0.017, 0.017, 0.02, 10), lit(0x0b0b10), x, y, -0.078, Math.PI / 2);
          part(g, K(0.013, 0.035, 10), shine(0xff2b3a, 0.4), x, y, -0.092, -Math.PI / 2);
        }
        part(g, B(0.006, 0.05, 0.08), lit(tone(a, 0.7)), s * 0.06, 0.08, 0.03);
      }
    } else {
      // twin-barrel turrets with a red sensor that slowly scan left and right
      front.forEach((m, i) => {
        const g = group(m);
        part(g, C(0.045, 0.05, 0.025, 16), dark, 0, 0.012, 0);
        part(g, T(0.047, 0.004, 16), glow(a), 0, 0.026, 0, Math.PI / 2);
        const head = live(grp(g, 0, 0.06, 0));
        part(head, R(0.085, 0.06, 0.095, 0.014), lit(a), 0, 0, 0);
        part(head, R(0.06, 0.02, 0.06, 0.006), lit(tone(a, 0.75)), 0, 0.035, 0.005);
        for (const x of [-0.02, 0.02]) {
          part(head, C(0.01, 0.01, 0.14, 8), steel, x, -0.005, -0.1, Math.PI / 2);
          part(head, C(0.013, 0.013, 0.02, 8), dark, x, -0.005, -0.165, Math.PI / 2);
        }
        part(head, S(0.01, 8), glow(0xff2b3a), 0, 0.016, -0.048);
        part(head, R(0.03, 0.04, 0.05, 0.006), dark, Math.sign(m.position.x) * 0.055, -0.005, 0.01);
        ticks.push((t) => { head.rotation.y = Math.sin(t * 1.2 + i) * 0.5; });
      });
    }
  } else if (kind === 'sneakers' && robot.paws) {
    // sneakers on all four paws: sole, toe cap, laces, glowing side stripe and heel tab
    for (const paw of robot.paws) {
      const g = group(paw);
      part(g, R(0.14, 0.03, 0.17, 0.01), lit(0xffffff), 0, -0.052, -0.012);
      part(g, R(0.142, 0.01, 0.172, 0.004), dark, 0, -0.068, -0.012);
      part(g, R(0.13, 0.075, 0.15, 0.022), lit(a), 0, -0.006, -0.01);
      part(g, R(0.12, 0.04, 0.05, 0.014), lit(0xffffff), 0, -0.025, -0.07);
      for (let i = 0; i < 3; i++) part(g, B(0.06, 0.008, 0.01), lit(0xffffff), 0, 0.032, -0.045 + i * 0.022);
      for (const s of [-1, 1]) part(g, B(0.004, 0.014, 0.08), glow(toward(a, 0xffffff, 0.5)), s * 0.066, -0.012, 0.0, 0.35);
      part(g, R(0.04, 0.05, 0.02, 0.006), dark, 0, 0.02, 0.07);
    }
  } else if (kind === 'bands' || kind === 'bracers' || kind === 'gloves') {
    for (const h of [left, right]) {
      if (!h) continue;
      const g = group(h), s = Math.sign(h.position.x || 1);
      if (kind === 'bands') {
        // glowing wrist bands with a gem on the outside
        const m = glow(a);
        part(g, R(0.13, 0.03, 0.14, 0.01), dark, 0, 0.07, 0);
        part(g, B(0.134, 0.01, 0.144), m, 0, 0.07, 0);
        part(g, R(0.03, 0.03, 0.03, 0.008), shine(toward(a, 0xffffff, 0.4), 0.6), s * 0.068, 0.07, 0, 0, Math.PI / 4);
        pulse(m, a, 5);
      } else if (kind === 'bracers') {
        // armoured forearm guards: ridges, a glow line and rivets
        part(g, R(0.14, 0.14, 0.15, 0.02), lit(a), 0, 0.13, 0);
        part(g, R(0.15, 0.03, 0.16, 0.01), lit(tone(a, 0.7)), 0, 0.07, 0);
        for (const y of [0.11, 0.14, 0.17]) part(g, B(0.006, 0.012, 0.11), dark, s * 0.072, y, 0);
        part(g, B(0.006, 0.12, 0.012), glow(0xffffff), s * 0.073, 0.13, -0.065);
        for (const [y, z] of [[0.08, -0.06], [0.08, 0.06], [0.185, -0.06], [0.185, 0.06]]) part(g, S(0.007, 6), metal, s * 0.072, y, z);
      } else {
        // big padded gloves with a cuff, a thumb and laces
        part(g, R(0.16, 0.15, 0.17, 0.045), lit(a), 0, -0.02, -0.005);
        part(g, R(0.14, 0.11, 0.06, 0.025), lit(a), 0, -0.01, -0.09);
        part(g, R(0.05, 0.08, 0.06, 0.02), lit(tone(a, 0.85)), -s * 0.085, -0.005, -0.03);
        part(g, R(0.15, 0.06, 0.16, 0.02), lit(0xffffff), 0, 0.08, 0);
        part(g, B(0.152, 0.012, 0.162), glow(a), 0, 0.08, 0);
        for (let i = 0; i < 3; i++) part(g, B(0.03, 0.006, 0.006), dark, 0, 0.02 + i * 0.02, 0.087);
      }
    }
  } else if (kind === 'shield' && left) {
    // a round shield on the left forearm: rim, accent ring, glowing emblem, a domed boss
    const s = Math.sign(left.position.x || -1);
    const g = group(left);
    const face = grp(g, s * 0.085, 0.06, 0);
    face.rotation.z = s * Math.PI / 2;
    part(face, C(0.17, 0.17, 0.024, 28), lit(a), 0, 0, 0);
    part(face, T(0.17, 0.014, 28), metal, 0, 0, 0, Math.PI / 2);
    part(face, T(0.12, 0.012, 28), lit(tone(a, 0.65)), 0, 0.013, 0, Math.PI / 2);
    part(face, T(0.085, 0.006, 28), glow(0xffffff), 0, 0.014, 0, Math.PI / 2);
    part(face, S(0.045, 14, Math.PI / 2), metal, 0, 0.012, 0);
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2;
      part(face, S(0.008, 6), steel, Math.cos(ang) * 0.145, 0.014, Math.sin(ang) * 0.145);
    }
  } else if (right) {
    const g = group(right);
    if (kind === 'blaster') {
      // sci-fi pistol: body, rail, coiled barrel with pulsing rings, scope, grip and energy cell
      part(g, R(0.06, 0.07, 0.2, 0.014), dark, 0, 0.0, -0.1);
      part(g, R(0.04, 0.02, 0.16, 0.006), lit(a), 0, 0.045, -0.1);
      part(g, R(0.045, 0.1, 0.05, 0.012), lit(0x34363f), 0, -0.065, -0.01, 0.2);
      part(g, C(0.019, 0.019, 0.15, 12), steel, 0, 0.0, -0.26, Math.PI / 2);
      const coil = glow(a);
      for (let i = 0; i < 3; i++) part(g, T(0.025, 0.006, 14), coil, 0, 0, -0.22 - i * 0.03);
      part(g, C(0.03, 0.026, 0.03, 12), metal, 0, 0, -0.34, Math.PI / 2);
      const muzzle = glow(a);
      part(g, C(0.018, 0.018, 0.006, 12), muzzle, 0, 0, -0.357, Math.PI / 2);
      part(g, C(0.012, 0.012, 0.06, 10), dark, 0, 0.07, -0.08, Math.PI / 2);
      part(g, C(0.009, 0.009, 0.004, 10), glow(0xff3a5a), 0, 0.07, -0.111, Math.PI / 2);
      part(g, R(0.012, 0.04, 0.08, 0.004), glass(toward(a, 0xffffff, 0.3), 0.7), 0.032, 0.0, -0.08);
      pulse(coil, a, 4);
      pulse(muzzle, a, 3, 0.3);
    } else if (kind === 'saber') {
      // ribbed hilt with an emitter and button; the blade has a white core and a soft glow
      part(g, C(0.022, 0.024, 0.15, 12), metal, 0, -0.02, -0.02, Math.PI / 2);
      for (let i = 0; i < 4; i++) part(g, T(0.024, 0.004, 12), dark, 0, -0.02, 0.03 - i * 0.025);
      part(g, C(0.03, 0.025, 0.035, 12), steel, 0, -0.02, -0.11, Math.PI / 2);
      part(g, R(0.012, 0.016, 0.02, 0.004), glow(a), 0, 0.004, -0.06);
      part(g, S(0.024, 10), steel, 0, -0.02, 0.06);
      const blade = live(grp(g, 0, -0.02, -0.43));
      part(blade, C(0.012, 0.012, 0.6, 10), glow(0xffffff), 0, 0, 0, Math.PI / 2);
      part(blade, C(0.024, 0.024, 0.6, 12), glow(a, 0.85), 0, 0, 0, Math.PI / 2);
      part(blade, C(0.045, 0.045, 0.64, 12), haze(a, 0.35), 0, 0, 0, Math.PI / 2);
      part(blade, S(0.024, 10), glow(a, 0.85), 0, 0, -0.3);
      ticks.push((t) => { const k = 1 + Math.sin(t * 40) * 0.08; blade.scale.set(k, k, 1); });
    } else if (kind === 'wrench') {
      // a big open-end wrench with a rubber grip and a ring end
      part(g, R(0.022, 0.04, 0.26, 0.008), metal, 0, -0.02, -0.1);
      part(g, R(0.032, 0.05, 0.1, 0.012), lit(a), 0, -0.02, 0.0);
      part(g, R(0.024, 0.095, 0.045, 0.01), metal, 0, -0.02, -0.245);
      for (const y of [-0.035, 0.035]) part(g, R(0.024, 0.026, 0.07, 0.008), metal, 0, -0.02 + y, -0.29);
      part(g, T(0.03, 0.011, 16), metal, 0, -0.02, 0.075, 0, Math.PI / 2);
      part(g, B(0.026, 0.006, 0.12), steel, 0, 0.002, -0.12);
    } else if (kind === 'flashlight') {
      // a ribbed torch with a flared head, glowing lens and a beam
      part(g, C(0.028, 0.028, 0.17, 14), dark, 0, -0.02, -0.05, Math.PI / 2);
      for (let i = 0; i < 4; i++) part(g, T(0.029, 0.004, 14), steel, 0, -0.02, 0.02 - i * 0.02);
      part(g, C(0.045, 0.03, 0.05, 16), lit(a), 0, -0.02, -0.16, -Math.PI / 2);
      part(g, T(0.043, 0.005, 16), metal, 0, -0.02, -0.185);
      part(g, C(0.039, 0.039, 0.004, 16), glow(0xfff6c8), 0, -0.02, -0.186, Math.PI / 2);
      part(g, R(0.014, 0.012, 0.024, 0.004), glow(a), 0, 0.01, -0.06);
      part(g, C(0.04, 0.22, 0.8, 16, true), haze(0xfff1a8, 0.15), 0, -0.02, -0.59, Math.PI / 2);
    }
  }
  for (const o of objs) bake(o);
  return { objs, ticks };
}

// ---------------------------------------------------------------- back items
// Back frame: +z points out of the back (up on the dog), +y up the spine (forward on the dog).
export function backItems(robot, kind, a) {
  const objs = [], ticks = [];
  if (!robot.back || kind === 'none') return { objs, ticks, depth: 0 };
  const dog = robot.kind === 'dog';
  const g = new THREE.Group();
  robot.back.add(g);
  objs.push(g);
  const metal = lit(0xb2b8cc), dark = lit(0x23242c), steel = lit(0x6c7290);
  let depth = 0;
  if (kind === 'backpack') {
    // a rounded pack with a flap, a front pocket with a glowing zip, side bottles and straps
    const c = lit(a), c2 = lit(tone(a, 0.72));
    part(g, R(0.24, 0.28, 0.11, 0.03), c, 0, 0, 0.055);
    part(g, R(0.245, 0.09, 0.122, 0.025), c2, 0, 0.1, 0.058);
    part(g, R(0.17, 0.11, 0.045, 0.016), c2, 0, -0.05, 0.12);
    part(g, B(0.15, 0.006, 0.006), glow(toward(a, 0xffffff, 0.5)), 0, 0.006, 0.143);
    part(g, R(0.03, 0.018, 0.012, 0.004), metal, 0.05, 0.006, 0.146);
    for (const s of [-1, 1]) {
      part(g, C(0.024, 0.024, 0.1, 12), glass(0x35e6ff, 0.75), s * 0.135, -0.06, 0.06);
      part(g, C(0.016, 0.016, 0.02, 10), dark, s * 0.135, 0.0, 0.06);
      if (!dog) part(g, R(0.04, 0.02, 0.18, 0.006), dark, s * 0.08, 0.15, -0.04);
    }
    part(g, R(0.06, 0.03, 0.006, 0.004), glow(0xffffff), 0, 0.1, 0.12);
    depth = 0.12;
  } else if (kind === 'spikes') {
    // a row of spikes along the spine, each on a dark plate, tips lighter
    const c = lit(a), tip = shine(toward(a, 0xffffff, 0.4), 0.35);
    [[0.12, 0.05], [0.04, 0.065], [-0.04, 0.065], [-0.12, 0.05]].forEach(([y, h]) => {
      part(g, R(0.07, 0.06, 0.012, 0.004), dark, 0, y, 0.006);
      part(g, C(0.01, 0.03, h * 0.65, 4), c, 0, y, 0.012 + h * 0.32, Math.PI / 2, Math.PI / 4);
      part(g, K(0.01, h * 0.4, 4), tip, 0, y, 0.012 + h * 0.65 + h * 0.2, Math.PI / 2, Math.PI / 4);
    });
    depth = 0.06;
  } else if (kind === 'flag') {
    // a pole with a golden finial and a cloth that waves in strips (standing up on the dog too)
    const base = grp(g);
    if (dog) base.rotation.x = Math.PI / 2;
    part(base, R(0.04, 0.05, 0.03, 0.008), dark, 0.09, 0.0, 0.03);
    part(base, C(0.009, 0.009, 0.62, 8), metal, 0.09, 0.27, 0.04);
    part(base, S(0.018, 10), shine(0xf2c230, 0.3), 0.09, 0.59, 0.04);
    let prev = grp(base, 0.09, 0.5, 0.04);
    const strips = [];
    for (let i = 0; i < 5; i++) {
      const st = live(grp(prev, i ? 0.045 : 0.006, 0, 0));
      part(st, B(0.045, 0.13, 0.008), lit(i % 2 ? tone(a, 0.9) : a), 0.0225, 0, 0);
      part(st, B(0.045, 0.024, 0.01), lit(0xffffff), 0.0225, 0, 0);
      if (i === 2) part(st, S(0.016, 8), glow(0xffffff), 0.0225, 0, 0.006);
      strips.push(st);
      prev = st;
    }
    ticks.push((t) => strips.forEach((s, i) => { s.rotation.y = Math.sin(t * 5 - i * 0.9) * 0.28; }));
  } else if (kind === 'battery') {
    // two big cells in a frame with charge bars filling up, cables into the back
    part(g, R(0.2, 0.27, 0.025, 0.008), dark, 0, 0, 0.012);
    for (const s of [-1, 1]) {
      part(g, C(0.045, 0.045, 0.2, 16), lit(a), s * 0.05, 0, 0.065);
      part(g, C(0.047, 0.047, 0.02, 16), metal, s * 0.05, 0.1, 0.065);
      part(g, C(0.047, 0.047, 0.02, 16), metal, s * 0.05, -0.1, 0.065);
      part(g, C(0.016, 0.016, 0.02, 10), steel, s * 0.05, 0.12, 0.065);
      part(g, R(0.022, 0.15, 0.006, 0.003), lit(0x0b0b10), s * 0.05, 0, 0.11);
      part(g, T(0.04, 0.007, 10, Math.PI), dark, s * 0.05, 0.13, 0.04, 0, Math.PI / 2);
    }
    const bars = [];
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) bars.push(live(part(g, B(0.016, 0.028, 0.004), glow(a), s * 0.05, -0.055 + i * 0.036, 0.114)));
    ticks.push((t) => { const n = Math.floor(t * 2) % 5; bars.forEach((b, i) => { b.visible = (i % 4) < n; }); });
    depth = 0.11;
  } else if (kind === 'cape' && dog) {
    // on the dog: a blanket lifted clear of the handle and lights, flaps down both sides
    part(g, R(0.36, 0.44, 0.018, 0.008), lit(a), 0, -0.02, 0.085);
    part(g, R(0.37, 0.03, 0.022, 0.008), shine(0xf2c230, 0.25), 0, 0.2, 0.087);
    part(g, R(0.08, 0.08, 0.004, 0.02), glow(toward(a, 0xffffff, 0.55)), 0, -0.02, 0.096, 0, 0, Math.PI / 4);
    const flaps = [];
    for (const sx of [-1, 1]) {
      const f = live(grp(g, sx * 0.18, -0.02, 0.085));
      part(f, B(0.016, 0.44, 0.14), lit(a), 0, 0, -0.07);
      part(f, B(0.018, 0.44, 0.02), lit(tone(a, 0.6)), 0, 0, -0.14);
      flaps.push([f, sx]);
    }
    ticks.push((t) => flaps.forEach(([f, sx]) => { f.rotation.y = sx * (0.12 + Math.sin(t * 3 + sx) * 0.05); }));
    depth = 0.1;
  } else if (kind === 'cape') {
    // a cape on a golden clasp, flowing in five strips with a darker hem and an emblem
    part(g, R(0.3, 0.04, 0.05, 0.012), shine(0xf2c230, 0.25), 0, 0.13, 0.035);
    for (const s of [-1, 1]) part(g, C(0.018, 0.018, 0.01, 12), glow(a), s * 0.12, 0.13, 0.062, Math.PI / 2);
    let prev = grp(g, 0, 0.12, 0.05);
    const strips = [];
    for (let i = 0; i < 5; i++) {
      const st = live(grp(prev, 0, i ? -0.12 : 0, 0));
      const w = 0.3 + i * 0.025;
      part(st, B(w, 0.122, 0.016), lit(a), 0, -0.06, 0);
      part(st, B(0.014, 0.122, 0.018), lit(tone(a, 0.65)), w / 2, -0.06, 0);
      part(st, B(0.014, 0.122, 0.018), lit(tone(a, 0.65)), -w / 2, -0.06, 0);
      if (i === 4) part(st, B(w, 0.02, 0.018), lit(tone(a, 0.6)), 0, -0.11, 0);
      if (i === 1) part(st, R(0.08, 0.08, 0.004, 0.02), glow(toward(a, 0xffffff, 0.55)), 0, -0.06, 0.009, 0, 0, Math.PI / 4);
      strips.push(st);
      prev = st;
    }
    ticks.push((t) => strips.forEach((s, i) => { s.rotation.x = -((i ? 0.07 : 0.2) + Math.sin(t * 3 - i * 0.7) * 0.05); }));
    depth = 0.04;
  } else if (kind === 'rotor') {
    // a mast with a motor and three tapered blades, a faint blur disc when spinning
    const mast = new THREE.Group();
    if (dog) mast.rotation.x = Math.PI / 2;
    g.add(mast);
    const z0 = dog ? 0 : 0.05, up = dog ? -0.14 : 0; // on the humanoids the blades clear the head
    part(mast, R(0.06, 0.06, 0.05, 0.01), dark, 0, 0.0, z0);
    part(mast, C(0.012, 0.014, 0.44 + up, 10), metal, 0, 0.25 + up / 2, z0);
    part(mast, C(0.03, 0.03, 0.05, 14), lit(a), 0, 0.47 + up, z0);
    part(mast, T(0.031, 0.004, 14), glow(0xffffff), 0, 0.485 + up, z0, Math.PI / 2);
    const blades = live(grp(mast, 0, 0.51 + up, z0));
    part(blades, C(0.02, 0.02, 0.02, 12), dark, 0, 0, 0);
    for (let i = 0; i < 3; i++) {
      const arm = grp(blades);
      arm.rotation.y = (i / 3) * Math.PI * 2;
      part(arm, R(0.3, 0.008, 0.05, 0.003), lit(0xe4e8f2), 0.16, 0, 0, 0.12).scale.set(1, 1, 1);
      part(arm, B(0.05, 0.01, 0.052), lit(a), 0.29, 0, 0, 0.12);
    }
    part(blades, C(0.33, 0.33, 0.002, 28), haze(0xffffff, 0.06), 0, 0, 0);
    ticks.push((t) => { blades.rotation.y = t * 16; });
  } else if (kind === 'wings') {
    // mechanical wings: three bones with glowing translucent membranes and tip lights
    for (const sx of [-1, 1]) {
      const wing = live(grp(g, sx * 0.06, 0.06, 0.05));
      part(wing, S(0.025, 10), steel, 0, 0, 0);
      [[0.36, 0.5], [0.3, 0.15], [0.24, -0.2]].forEach(([len, ang], i) => {
        const bone = grp(wing);
        bone.rotation.z = sx * ang;
        part(bone, R(len, 0.022, 0.022, 0.008), metal, sx * len / 2, 0, 0);
        part(bone, S(0.012, 8), glow(a), sx * len, 0, 0);
        if (i < 2) {
          const mem = grp(wing);
          mem.rotation.z = sx * (ang - 0.17);
          part(mem, B(len * 0.92, 0.1 * (1 - i * 0.2), 0.004), haze(a, 0.45), sx * len * 0.48, 0, 0);
        }
      });
      ticks.push((t) => { wing.rotation.y = sx * (0.2 + Math.sin(t * 4) * 0.25); });
    }
    depth = 0.05;
  } else if (kind === 'tail' && robot.tail) {
    // a jointed cable tail: alternating segments, joint balls and a glowing tip, wagging
    let seg = grp(robot.tail);
    objs.push(seg);
    const segs = [];
    for (let i = 0; i < 6; i++) {
      const s = live(grp(seg, 0, 0, i ? 0.05 : 0));
      s.rotation.x = -0.28;
      const r = 0.022 - i * 0.002;
      part(s, C(r, r, 0.044, 10), i % 2 ? dark : metal, 0, 0, 0.025, Math.PI / 2);
      part(s, S(r * 1.15, 8), steel, 0, 0, 0);
      segs.push(s);
      seg = s;
    }
    part(seg, S(0.026, 10), glow(a), 0, 0, 0.06);
    part(seg, S(0.045, 10), haze(a, 0.3), 0, 0, 0.06);
    ticks.push((t) => segs.forEach((s, i) => { s.rotation.y = Math.sin(t * 9 - i * 0.5) * 0.22; }));
  } else if (kind === 'saddle') {
    // saddle bags over the dog's sides (back frame: z up, y forward), with a bedroll behind
    part(g, R(0.32, 0.24, 0.02, 0.006), dark, 0, 0, 0.01);
    part(g, R(0.34, 0.03, 0.024, 0.006), lit(a), 0, 0.0, 0.012);
    for (const sx of [-1, 1]) {
      part(g, R(0.05, 0.18, 0.14, 0.016), lit(a), sx * 0.18, 0, -0.07);
      part(g, R(0.056, 0.185, 0.05, 0.014), lit(tone(a, 0.72)), sx * 0.181, 0, -0.012);
      part(g, R(0.012, 0.03, 0.03, 0.004), shine(0xf2c230, 0.3), sx * 0.21, 0, -0.04);
      part(g, R(0.006, 0.12, 0.006, 0.002), glow(toward(a, 0xffffff, 0.5)), sx * 0.206, 0, -0.1);
    }
    part(g, C(0.04, 0.04, 0.26, 14), lit(0x8a5a2a), 0, -0.14, 0.04, 0, 0, Math.PI / 2);
    for (const x of [-0.08, 0.08]) part(g, T(0.042, 0.005, 14), dark, x, -0.14, 0.04, 0, Math.PI / 2);
  } else if (kind === 'rider') {
    // a little Agibot riding the dog: sits astride, holds on with one hand, waves the other
    const r = makeRider(a);
    r.root.rotation.x = dog ? Math.PI / 2 : 0;
    r.root.position.set(0, dog ? 0.02 : 0, dog ? -0.25 : 0.05);
    g.add(r.root);
    ticks.push((t) => {
      r.arms[1].rotation.set(0, 0, 2.5 + Math.sin(t * 8) * 0.4);
      r.root.position.z = (dog ? -0.25 : 0.05) + Math.abs(Math.sin(t * 6)) * 0.01;
    });
  }
  bake(g);
  return { objs, ticks, depth };
}
// set by garage.js (models.js builds the rider)
let makeRider = () => ({ root: new THREE.Group(), arms: [new THREE.Group(), new THREE.Group()] });
export function setRider(f) { makeRider = f; }

// ---------------------------------------------------------------- neck items (dog)
export function neckItems(robot, kind, a) {
  const objs = [];
  if (!robot.neck) return { objs, ticks: [] };
  const g = new THREE.Group();
  robot.neck.add(g);
  objs.push(g);
  const ticks = [];
  if (kind === 'collar') {
    // a studded collar with a golden tag that swings a little
    const m = lit(a);
    part(g, R(0.18, 0.03, 0.055, 0.01), m, 0, 0.077, 0);
    part(g, R(0.18, 0.03, 0.055, 0.01), m, 0, -0.077, 0);
    for (const x of [-0.087, 0.087]) part(g, R(0.03, 0.184, 0.055, 0.01), m, x, 0, 0);
    for (const [x, y] of [[-0.05, 0.094], [0, 0.094], [0.05, 0.094], [-0.104, 0.04], [-0.104, -0.04], [0.104, 0.04], [0.104, -0.04]]) {
      part(g, K(0.009, 0.016, 4), lit(0xd8deec), x, y + (y > 0 ? 0.004 : 0), 0, 0, 0, x === 0 || Math.abs(y) > 0.09 ? 0 : -Math.sign(x) * Math.PI / 2);
    }
    const tag = live(grp(g, 0, -0.094, -0.02));
    part(tag, T(0.01, 0.003, 10), lit(0xb2b8cc), 0, -0.008, 0);
    part(tag, C(0.024, 0.024, 0.006, 16), shine(0xf2c230, 0.35), 0, -0.035, 0, Math.PI / 2);
    part(tag, B(0.02, 0.004, 0.004), glow(0xffffff), 0, -0.035, -0.004);
    ticks.push((t) => { tag.rotation.z = Math.sin(t * 3) * 0.2; });
  } else if (kind === 'bandana') {
    // a bandana knotted round the neck, its triangle hanging under the chin, white dots
    const m = lit(a), w = lit(0xffffff);
    part(g, R(0.18, 0.03, 0.09, 0.01), m, 0, -0.07, -0.01);
    for (const x of [-0.088, 0.088]) part(g, R(0.03, 0.14, 0.09, 0.01), m, x, 0, -0.01);
    part(g, R(0.18, 0.025, 0.09, 0.01), m, 0, 0.075, -0.01);
    const tri = grp(g, 0, -0.085, -0.045);
    tri.rotation.x = 0.15;
    part(tri, C(0.1, 0.1, 0.012, 3), m, 0, -0.03, 0, Math.PI / 2, 0, Math.PI);
    for (const [x, y] of [[-0.035, -0.0], [0.035, 0.0], [0, -0.035], [-0.015, 0.015], [0.018, -0.06]]) part(tri, S(0.007, 6), w, x, y - 0.01, -0.008);
    part(g, R(0.03, 0.03, 0.03, 0.008), m, 0, 0.09, 0.03);
    for (const s of [-1, 1]) part(g, R(0.016, 0.04, 0.012, 0.004), m, s * 0.02, 0.1, 0.05, 0.4, 0, s * 0.5);
  }
  bake(g);
  return { objs, ticks };
}
