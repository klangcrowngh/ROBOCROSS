// Distant 3D skyline beyond the fog. Every district has its own silhouette; when the district
// changes, the old skyline dissolves into the haze and sinks while the new one rises.
import * as THREE from 'three';
import * as M from './models.js';
import * as TX from './textures.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const ADD = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  color, fog: false, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
});
// shared glow materials for static decoration (one draw call per colour after baking)
const addCache = new Map();
const addc = (color, opacity = 1) => {
  const k = `${color}|${opacity}`;
  if (!addCache.has(k)) addCache.set(k, ADD(color, opacity));
  return addCache.get(k);
};

// distance range, piece count, heights and how much haze swallows the layer
const LAYERS = [
  { z0: 66, z1: 80, n: 24, h0: 12, h1: 30, haze: 0.3, color: 't2' },
  { z0: 86, z1: 102, n: 22, h0: 18, h1: 44, haze: 0.5, color: 't1' },
  { z0: 108, z1: 126, n: 18, h0: 24, h1: 60, haze: 0.7, color: 't1' },
];
const BASE = -4; // bottoms hide behind the fogged street
const THEMES = {
  downtown: { tint: 0x8090c0, neon: [0x35e6ff, 0xff4fd8, 0xb46bff] },
  tokyo: { tint: 0xc06080, neon: [0xff2b4a, 0xff9be0, 0xffd21f] },
  eco: { tint: 0x60b090, neon: [0x6dffb0, 0xb4ff6d, 0x35e6ff] },
  industrial: { tint: 0xb08a60, neon: [0xffa21a, 0xffd21f, 0xff6a2a] },
  port: { tint: 0x5aa8b8, neon: [0x35e6ff, 0x6dffb0, 0xff4fd8] },
};

const ca = new THREE.Color(), cb = new THREE.Color();
const ease = (t) => t * t * (3 - 2 * t);

export class Backdrop {
  constructor(scene) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.win = TX.windowTexture();
    this.sets = {};
    for (const id of Object.keys(THEMES)) this.sets[id] = this.buildSet(id);
    this.target = 'downtown';
    this.sets.downtown.mix = 1;
    this.buildTraffic();
  }

  setTheme(id) {
    if (this.sets[id]) this.target = id;
  }

  // ---------------------------------------------------------------- one district skyline
  buildSet(id) {
    const T = THEMES[id];
    const set = {
      id, mix: 0, group: new THREE.Group(), layers: [], spin: [], beams: [],
      blink: ADD(0xff3040), neon: T.neon.map((c) => ADD(c, 0.5)), tint: T.tint,
    };
    this.root.add(set.group);
    LAYERS.forEach((L, li) => {
      const base = new THREE.MeshBasicMaterial({ fog: false });
      const lights = new THREE.MeshBasicMaterial({ map: this.win, fog: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
      const g = new THREE.Group();
      const ctx = { set, g, base, lights, li };
      for (let i = 0; i < L.n; i++) {
        const x = -66 + (132 * (i + Math.random() * 0.8)) / L.n;
        const z = -rand(L.z0, L.z1);
        this[id](ctx, x, z, rand(L.h0, L.h1));
      }
      if (li === 1) this[id + 'Landmark'](ctx);
      // static parts are merged; animated ones (blades, beams) were added to set.group directly
      M.bake(g);
      g.traverse((o) => { o.castShadow = false; o.receiveShadow = false; });
      set.group.add(g);
      set.layers.push({ base, lights, haze: L.haze, color: L.color });
    });
    set.group.visible = false;
    return set;
  }

  // block tower with windows; returns the top height
  block(c, x, z, w, d, h, y = BASE) {
    M.box(c.g, w, h, d, c.base, x, y + h / 2, z);
    M.box(c.g, w + 0.06, h, d + 0.06, c.lights, x, y + h / 2, z);
    return y + h;
  }

  spire(c, x, z, top, h) {
    M.box(c.g, 0.35, h, 0.35, c.base, x, top + h / 2, z);
    M.box(c.g, 0.8, 0.8, 0.8, c.set.blink, x, top + h, z);
  }

  neonStrip(c, x, z, w, d, h) {
    if (c.li > 1 || Math.random() > 0.3) return;
    M.box(c.g, 0.35, h * 0.75, 0.35, pick(c.set.neon), x + (x < 0 ? w / 2 : -w / 2), BASE + h * 0.5, z + d / 2);
  }

  // ---- downtown: setback skyscrapers
  downtown(c, x, z, h) {
    const w = rand(3, 8), d = rand(3, 7);
    let top = this.block(c, x, z, w, d, h);
    if (Math.random() < 0.55) top = this.block(c, x, z, w * 0.55, d * 0.55, rand(3, 9), top);
    if (Math.random() < 0.5) this.spire(c, x, z, top, rand(3, 9));
    this.neonStrip(c, x, z, w, d, h);
  }

  downtownLandmark(c) {
    const nx = 24, nz = -94;
    M.box(c.g, 1.8, 42, 1.8, c.base, nx, BASE + 21, nz);
    this.block(c, nx, nz, 10, 10, 2.4, BASE + 41.8);
    M.box(c.g, 10.4, 0.4, 10.4, c.set.neon[0], nx, BASE + 41.6, nz);
    M.box(c.g, 6, 1.4, 6, c.base, nx, BASE + 45, nz);
    this.spire(c, nx, nz, BASE + 45.7, 14);
    const bx = -26, bz = -90;
    const top = this.block(c, bx, bz, 10, 8, 48);
    this.spire(c, bx, bz, top, 10);
    this.screen(c, 'logo', 0, bx, BASE + 34, bz + 4.1, 8.4, 8.4);
    this.screen(c, 'word', 1, bx, BASE + 26, bz + 4.1, 9.6, 2.4);
  }

  // ---- Neo-Tokyo: stepped towers with flared roofs and tall vertical signs
  tokyo(c, x, z, h) {
    let w = rand(3, 6.5), d = rand(3, 6);
    let top = BASE;
    const tiers = Math.random() < 0.5 ? 3 : 1;
    for (let i = 0; i < tiers; i++) {
      const th = tiers === 1 ? h : h / tiers * (1.2 - i * 0.2);
      top = this.block(c, x, z, w, d, th, top);
      if (tiers > 1) M.box(c.g, w + 1.2, 0.5, d + 1.2, c.base, x, top, z);
      w *= 0.72; d *= 0.72;
    }
    if (Math.random() < 0.35) M.box(c.g, 0.9, h * 0.5, 0.2, pick(c.set.neon), x + 1.5, BASE + h * 0.55, z + 2);
    if (Math.random() < 0.4) this.spire(c, x, z, top, rand(2, 6));
  }

  tokyoLandmark(c) {
    // red-and-white lattice tower
    const tx = 22, tz = -96;
    let y = BASE;
    [[8, 14], [6, 12], [4, 10], [2.4, 9], [1.2, 8]].forEach(([w, h], i) => {
      const col = i % 2 ? 0xffffff : 0xff3a3a;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) M.box(c.g, 0.4, h, 0.4, addc(col, 0.55), tx + sx * w / 2, y + h / 2, tz + sz * w / 2);
      M.box(c.g, w + 0.6, 0.6, w + 0.6, c.base, tx, y + h, tz);
      y += h;
    });
    this.spire(c, tx, tz, y, 6);
    this.screen(c, 'v', 0, -24, BASE + 30, -88, 2.4, 10);
    this.screen(c, 'tower', 1, -16, BASE + 24, -90, 5, 7.5);
  }

  // ---- eco district: green towers with garden terraces, domes and wind turbines
  eco(c, x, z, h) {
    const r = Math.random();
    if (r < 0.25 && c.li < 2) {
      this.turbine(c, x, z, h * 0.9);
      return;
    }
    const w = rand(3, 7), d = rand(3, 6);
    const top = this.block(c, x, z, w, d, h);
    for (let y = BASE + 4; y < top - 2; y += rand(4, 7)) M.box(c.g, w + 0.8, 0.8, d + 0.8, addc(0x4cbf4f, 0.55), x, y, z);
    if (Math.random() < 0.5) {
      // dome
      [[0.9, 1.2], [0.7, 1], [0.45, 0.8]].reduce((y, [k, hh]) => { M.box(c.g, w * k, hh, d * k, c.base, x, y + hh / 2, z); return y + hh; }, top);
    }
  }

  turbine(c, x, z, h) {
    M.box(c.g, 0.5, h, 0.5, c.base, x, BASE + h / 2, z);
    const hub = new THREE.Group();
    hub.position.set(x, BASE + h, z + 0.4);
    const blade = new THREE.MeshBasicMaterial({ color: 0xe8f0f8, fog: false });
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 7, 0.2), blade);
      b.position.y = 3.5;
      const arm = new THREE.Group();
      arm.rotation.z = (i * Math.PI * 2) / 3;
      arm.add(b);
      hub.add(arm);
    }
    hub.userData.speed = rand(0.6, 1.1);
    c.set.group.add(hub);
    c.set.spin.push(hub);
  }

  ecoLandmark(c) {
    // giant tree tower
    const tx = -22, tz = -94;
    M.box(c.g, 4, 40, 4, c.base, tx, BASE + 20, tz);
    for (const [y, w] of [[30, 18], [37, 14], [43, 9], [48, 5]]) {
      M.box(c.g, w, 3.5, w, addc(0x3fae49, 0.75), tx, BASE + y, tz);
    }
    this.screen(c, 'logo', 2, 24, BASE + 22, -88, 7, 7);
  }

  // ---- industrial: chimneys, cooling towers and warehouses
  industrial(c, x, z, h) {
    const r = Math.random();
    if (r < 0.35) {
      const ch = h * 1.1;
      M.box(c.g, 1.6, ch, 1.6, c.base, x, BASE + ch / 2, z);
      for (let y = BASE + ch - 6; y < BASE + ch; y += 3) M.box(c.g, 1.7, 1.2, 1.7, addc(0xff3a3a, 0.45), x, y, z);
      M.box(c.g, 0.8, 0.8, 0.8, c.set.blink, x, BASE + ch + 0.4, z);
      // smoke
      for (let i = 0; i < 4; i++) M.box(c.g, 2.5 + i, 2, 2.5 + i, addc(0x9a9aa8, 0.12), x + i * 1.2, BASE + ch + 2 + i * 2.2, z);
    } else if (r < 0.55) {
      let y = BASE;
      [[9, 6], [7.5, 5], [7, 4], [7.8, 3]].forEach(([w, hh]) => { y = this.block(c, x, z, w, w, hh, y); });
    } else {
      const w = rand(6, 12);
      const top = this.block(c, x, z, w, rand(4, 7), h * 0.45);
      for (let i = 0; i < 3; i++) M.box(c.g, w / 3 - 0.2, 1.2, 4, c.base, x - w / 3 + i * w / 3, top + 0.6, z);
    }
  }

  industrialLandmark(c) {
    this.screen(c, 'word', 2, 20, BASE + 18, -86, 10, 2.5);
    const top = this.block(c, 20, -88, 6, 6, 20);
    this.spire(c, 20, -88, top, 6);
  }

  // ---- neon port: gantry cranes, container stacks and ships
  port(c, x, z, h) {
    const r = Math.random();
    if (r < 0.3 && c.li < 2) {
      // gantry crane
      const ch = h * 0.8;
      for (const s of [-1, 1]) M.box(c.g, 0.6, ch, 0.6, c.base, x + s * 3, BASE + ch / 2, z);
      M.box(c.g, 12, 1, 1, c.base, x + 2, BASE + ch, z);
      M.box(c.g, 0.5, 0.5, 0.5, c.set.blink, x + 8, BASE + ch + 0.6, z);
      M.box(c.g, 12, 0.2, 0.2, pick(c.set.neon), x + 2, BASE + ch - 0.6, z + 0.5);
    } else if (r < 0.55) {
      // container stacks
      for (let i = 0; i < 4; i++) for (let j = 0; j < randInt(1, 4); j++) {
        M.box(c.g, 2.4, 1.1, 1.2, pick([0xd84a3a, 0x2b6bff, 0x3dbf6a, 0xffa21a, 0xeef0f6]), x + i * 2.5, BASE + 4.6 + j * 1.15, z);
      }
    } else if (r < 0.7) {
      // ship
      M.box(c.g, 16, 3, 3, c.base, x, BASE + 4, z);
      this.block(c, x - 5, z, 3, 2.6, 6, BASE + 5.5);
      M.box(c.g, 16.1, 0.3, 3.05, pick(c.set.neon), x, BASE + 3.2, z);
    } else {
      const w = rand(3, 7), d = rand(3, 6);
      const top = this.block(c, x, z, w, d, h * 0.8);
      if (Math.random() < 0.4) this.spire(c, x, z, top, rand(3, 7));
      this.neonStrip(c, x, z, w, d, h * 0.8);
    }
  }

  portLandmark(c) {
    // lighthouse with a sweeping beam
    const lx = 20, lz = -84;
    let y = BASE;
    for (let i = 0; i < 6; i++) {
      M.box(c.g, 3 - i * 0.25, 4, 3 - i * 0.25, i % 2 ? 0xeef0f6 : 0xd84a3a, lx, y + 2, lz);
      y += 4;
    }
    M.box(c.g, 2, 1.6, 2, addc(0xffe066), lx, y + 0.8, lz);
    const beam = new THREE.Mesh(new THREE.BoxGeometry(40, 0.8, 1.6), ADD(0xfff1a8, 0.25));
    beam.geometry.translate(20, 0, 0);
    beam.position.set(lx, y + 0.8, lz);
    c.set.group.add(beam);
    c.set.beams.push(beam);
    this.screen(c, 'logo', 0, -22, BASE + 26, -90, 7, 7);
  }

  screen(c, kind, i, x, y, z, w, h) {
    const signMat = TX.signMaterial().clone();
    signMat.fog = false;
    const m = M.sign(c.g, w, h, 0.2, kind, i, x, y, z);
    m.material = signMat;
    M.box(c.g, w + 0.6, h + 0.6, 0.1, c.base, x, y, z - 0.15);
  }

  // ---------------------------------------------------------------- flying traffic
  buildTraffic() {
    this.streams = [
      { y: 15, z: -60, dir: 1, speed: 10 },
      { y: 21, z: -72, dir: -1, speed: 13 },
      { y: 28, z: -88, dir: 1, speed: 9 },
    ];
    const per = 34;
    this.dots = [];
    const pos = new Float32Array(this.streams.length * per * 3);
    const col = new Float32Array(this.streams.length * per * 3);
    this.streams.forEach((s, si) => {
      for (let i = 0; i < per; i++) {
        this.dots.push({ s, x: rand(-80, 80), dy: rand(-0.6, 0.6) });
        ca.set(Math.random() < 0.5 ? (s.dir > 0 ? 0xfff1c8 : 0xff4050) : [0x35e6ff, 0xff4fd8][si % 2]);
        col.set([ca.r, ca.g, ca.b], (si * per + i) * 3);
      }
    });
    this.dotGeo = new THREE.BufferGeometry();
    this.dotGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dotGeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.dotMat = new THREE.PointsMaterial({ size: 0.9, vertexColors: true, fog: false, transparent: true, depthWrite: false });
    const pts = new THREE.Points(this.dotGeo, this.dotMat);
    pts.frustumCulled = false;
    this.root.add(pts);
  }

  // ---------------------------------------------------------------- per frame
  update(dt, time, camPos, sample, fogHex, night) {
    this.root.position.set(camPos.x * 0.7, 0, camPos.z);
    for (const set of Object.values(this.sets)) {
      // ~4 s cross-fade: haze swallows the old skyline while it sinks, the new one rises
      set.mix += ((set.id === this.target ? 1 : 0) - set.mix) * Math.min(1, dt * 0.7);
      const m = ease(Math.min(1, Math.max(0, set.mix)));
      set.group.visible = m > 0.01;
      if (!set.group.visible) continue;
      set.group.position.y = (1 - m) * -45;
      for (const L of set.layers) {
        const col = ca.setHex(sample[L.color]).lerp(cb.setHex(set.tint), 0.22 * (1 - night * 0.6));
        const haze = L.haze + (1 - L.haze) * (1 - m) * 0.9;
        L.base.color.setHex(col.lerp(cb.setHex(fogHex), haze).getHex());
        L.lights.opacity = (0.1 + night * 0.85) * (1 - L.haze * 0.45) * m;
      }
      set.blink.opacity = (time % 1.4 < 0.3 ? 1 : 0.15) * m;
      for (const n of set.neon) n.opacity = (0.25 + night * 0.6) * m;
      for (const h of set.spin) h.rotation.z += dt * h.userData.speed;
      for (const b of set.beams) {
        b.rotation.y = time * 0.8;
        b.material.opacity = (0.08 + night * 0.35) * m;
      }
    }
    this.dotMat.opacity = 0.35 + night * 0.65;

    const a = this.dotGeo.attributes.position.array;
    this.dots.forEach((d, i) => {
      d.x += d.s.dir * d.s.speed * dt;
      if (d.x > 80) d.x -= 160; else if (d.x < -80) d.x += 160;
      a[i * 3] = d.x;
      a[i * 3 + 1] = d.s.y + d.dy;
      a[i * 3 + 2] = d.s.z;
    });
    this.dotGeo.attributes.position.needsUpdate = true;
  }
}

function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
