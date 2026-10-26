// Day/night cycle, city districts and weather.
import * as THREE from 'three';
import * as TX from './textures.js';
import * as M from './models.js';
import { sfx, setAmbience, setMood } from './audio.js';
import { Backdrop } from './backdrop.js';

// ---------------------------------------------------------------- districts
// The street changes its look every DISTRICT_LEN rows.
export const DISTRICT_LEN = 45;
export const DISTRICTS = [
  {
    id: 'downtown', name: 'ДАУНТАУН', fg: '#35e6ff', bg: '#141436', neonHex: 0x35e6ff,
    facades: [0, 1, 2, 3, 4, 5, 6],
    neon: [0x35e6ff, 0xff4fd8, 0xb46bff],
    awning: [0xe0306a, 0x2b6bff, 0x3dbf6a, 0xffc21a, 0x7b3fe4],
    sidewalk: 0xffffff, fog: 0xb3c9ff,
    props: ['lamp', 'hydrant', 'bin', 'bench', 'mailbox', 'streetTree', 'streetTree', 'vending'],
    plaza: ['kiosk', 'streetTree', 'bench', 'bollards', 'crates', 'cones', 'barrier', 'fountain'],
  },
  {
    id: 'tokyo', name: 'НЕО-ТОКИО', fg: '#ffffff', bg: '#c0283a', neonHex: 0xff3a5a,
    facades: [7, 7, 2, 3, 6],
    neon: [0xff2b4a, 0xff9be0, 0xffd21f],
    awning: [0xc0283a, 0x1a1a1a, 0xff6a2a],
    sidewalk: 0xffe2ea, fog: 0xffc8dc, lanterns: true,
    props: ['lanternPost', 'lanternPost', 'vending', 'vending', 'bench', 'streetTree', 'bin'],
    plaza: ['kiosk', 'lanternPost', 'vending', 'bollards', 'streetTree', 'bench', 'fountain'],
  },
  {
    id: 'eco', name: 'ЭКО-КВАРТАЛ', fg: '#1a3a1a', bg: '#6dffb0', neonHex: 0x6dffb0,
    facades: [8, 8, 4, 5],
    neon: [0x6dffb0, 0xb4ff6d, 0x35e6ff],
    awning: [0x3dbf6a, 0x8ad84a, 0xffffff],
    sidewalk: 0xe4ffec, fog: 0xc4f0e0, gardens: true,
    props: ['streetTree', 'streetTree', 'grassPlanter', 'grassPlanter', 'bench', 'bin'],
    plaza: ['streetTree', 'grassPlanter', 'grassPlanter', 'bench', 'bollards', 'fountain', 'fountain'],
  },
  {
    id: 'industrial', name: 'ПРОМЗОНА', fg: '#1a1a1a', bg: '#ffa21a', neonHex: 0xffa21a,
    facades: [9, 9, 10, 3, 1],
    neon: [0xffa21a, 0xffd21f],
    awning: [0xffa21a, 0x3a3d55, 0xffd21f],
    sidewalk: 0xe8dcc8, fog: 0xe6d2b8,
    props: ['container', 'container', 'pipes', 'cones', 'barrier', 'crates', 'hydrant'],
    plaza: ['container', 'crates', 'cones', 'barrier', 'pipes'],
  },
  {
    id: 'port', name: 'НЕОН-ПОРТ', fg: '#0a1a2a', bg: '#35e6ff', neonHex: 0x35e6ff,
    facades: [10, 9, 2, 0],
    neon: [0x35e6ff, 0x6dffb0, 0xff4fd8],
    awning: [0x2b6bff, 0x35e6ff, 0x1f2028],
    sidewalk: 0xd8e4f0, fog: 0xa8e0e8, port: true,
    props: ['mooring', 'mooring', 'container', 'crates', 'lamp', 'bench', 'bin'],
    plaza: ['mooring', 'container', 'crates', 'bollards', 'fountain'],
  },
];

export const districtIndex = (row) => Math.floor(Math.max(0, row) / DISTRICT_LEN) % DISTRICTS.length;
export const districtAt = (row) => DISTRICTS[districtIndex(row)];
export const isDistrictStart = (row) => row > 0 && row % DISTRICT_LEN === 0;

// ---------------------------------------------------------------- time of day
const CYCLE = 160; // seconds for a full day
// phase keyframes: sky gradient, distant towers, lights and window glow
const KEYS = [
  { t: 0.0, top: '#3d74ee', mid: '#86aaf8', hor: '#b3c9ff', t1: '#a3b8f2', t2: '#8ea4e8', sun: '#fff6ea', si: 1.9, hs: '#e4e8ff', hg: '#46307a', hi: 1.7, glow: 0.6, night: 0 },
  { t: 0.36, top: '#3d74ee', mid: '#86aaf8', hor: '#b3c9ff', t1: '#a3b8f2', t2: '#8ea4e8', sun: '#fff6ea', si: 1.9, hs: '#e4e8ff', hg: '#46307a', hi: 1.7, glow: 0.6, night: 0 },
  { t: 0.46, top: '#3b3a9e', mid: '#c46aa8', hor: '#ffb27a', t1: '#b07aa8', t2: '#8a5a98', sun: '#ffa060', si: 1.4, hs: '#ffc8d8', hg: '#4a2a6a', hi: 1.3, glow: 1.1, night: 0.35 },
  { t: 0.56, top: '#070a24', mid: '#1a1850', hor: '#34286a', t1: '#1c1c48', t2: '#141236', sun: '#8090ff', si: 0.6, hs: '#7880d0', hg: '#2a1850', hi: 1.05, glow: 1.8, night: 1 },
  { t: 0.86, top: '#070a24', mid: '#1a1850', hor: '#34286a', t1: '#1c1c48', t2: '#141236', sun: '#8090ff', si: 0.6, hs: '#7880d0', hg: '#2a1850', hi: 1.05, glow: 1.8, night: 1 },
  { t: 0.94, top: '#4a5ab8', mid: '#b08ad8', hor: '#ffc4d8', t1: '#b0a0d8', t2: '#9080c0', sun: '#ffc8a0', si: 1.3, hs: '#d8d0ff', hg: '#40306a', hi: 1.3, glow: 1.0, night: 0.35 },
  { t: 1.0, top: '#3d74ee', mid: '#86aaf8', hor: '#b3c9ff', t1: '#a3b8f2', t2: '#8ea4e8', sun: '#fff6ea', si: 1.9, hs: '#e4e8ff', hg: '#46307a', hi: 1.7, glow: 0.6, night: 0 },
];
const COLOR_KEYS = ['top', 'mid', 'hor', 't1', 't2', 'sun', 'hs', 'hg'];
const NUM_KEYS = ['si', 'hi', 'glow', 'night'];

const ca = new THREE.Color(), cb = new THREE.Color();
function sample(phase) {
  let i = 0;
  while (KEYS[i + 1].t < phase) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const k = (phase - a.t) / (b.t - a.t);
  const out = {};
  for (const key of COLOR_KEYS) out[key] = ca.set(a[key]).lerp(cb.set(b[key]), k).getHex();
  for (const key of NUM_KEYS) out[key] = a[key] + (b[key] - a[key]) * k;
  return out;
}

const hex = (n) => '#' + n.toString(16).padStart(6, '0');
const grey = new THREE.Color(0x707890);
function wet(c, rain) { return ca.setHex(c).lerp(grey, rain * 0.45).getHex(); }

export class Environment {
  constructor(scene, hemi, sun) {
    this.scene = scene;
    this.hemi = hemi;
    this.sun = sun;
    this.phase = 0.04;
    this.rain = 0;
    this.rainTarget = 0;
    this.rainTimer = 35;
    this.flash = 0;
    this.skyKey = '';
    this.aspect = 1;
    this.horizon = 0.3;
    this.district = DISTRICTS[0];
    this.night = 0;
    this.lastNight = 0;
    this.onToast = () => {};

    this.backdrop = new Backdrop(scene);

    // Glow around the robot at night.
    this.robotLight = new THREE.PointLight(0x9ff3ff, 0, 5, 1.6);
    scene.add(this.robotLight);

    // Rain streaks that follow the camera.
    const N = 700;
    const pos = new Float32Array(N * 6);
    this.drops = [];
    for (let i = 0; i < N; i++) this.drops.push([rnd(-12, 12), rnd(0, 14), rnd(-28, 4)]);
    this.rainGeo = new THREE.BufferGeometry();
    this.rainGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0xc8d8ff, transparent: true, opacity: 0, depthWrite: false });
    this.rainMesh = new THREE.LineSegments(this.rainGeo, this.rainMat);
    this.rainMesh.frustumCulled = false;
    scene.add(this.rainMesh);
  }

  setView(aspect, horizon) {
    this.aspect = aspect;
    this.horizon = horizon;
    this.skyKey = '';
  }

  setDistrict(d) {
    if (d === this.district) return;
    this.district = d;
    this.skyKey = '';
    this.backdrop.setTheme(d.id);
    setMood(d.id, this.night);
  }

  update(dt, camPos, robotPos) {
    this.phase = (this.phase + dt / CYCLE) % 1;
    const s = sample(this.phase);
    this.night = s.night;

    // weather: occasional showers, thunder at night
    this.rainTimer -= dt;
    if (this.rainTimer <= 0) {
      const raining = this.rainTarget > 0;
      this.rainTarget = raining ? 0 : Math.random() < 0.5 ? 1 : 0;
      this.rainTimer = this.rainTarget ? rnd(25, 40) : rnd(40, 80);
      if (this.rainTarget) this.onToast('ДОЖДЬ');
    }
    this.rain += (this.rainTarget - this.rain) * Math.min(1, dt * 0.4);
    if (this.rain > 0.6 && Math.random() < dt * 0.06) { this.flash = 1; setTimeout(() => sfx.thunder(), 300); }
    this.flash = Math.max(0, this.flash - dt * 4);

    // night / day announcements
    if (this.lastNight < 0.5 && s.night >= 0.5) this.onToast('НАСТУПАЕТ НОЧЬ');
    if (this.lastNight > 0.5 && s.night <= 0.5) this.onToast('РАССВЕТ');
    this.lastNight = s.night;

    // lights
    const r = this.rain;
    this.sun.color.setHex(s.sun);
    this.sun.intensity = s.si * (1 - r * 0.45);
    this.hemi.color.setHex(wet(s.hs, r));
    this.hemi.groundColor.setHex(s.hg);
    this.hemi.intensity = s.hi * (1 - r * 0.25) + this.flash * 2.5;
    TX.setWindowGlow(s.glow + r * 0.3);
    this.robotLight.intensity = s.night * 2.2;
    if (robotPos) this.robotLight.position.set(robotPos.x, 1.4, robotPos.z + 0.3);

    // fog: time-of-day horizon tinted by the district
    const fog = ca.setHex(s.hor).lerp(cb.setHex(this.district.fog), 0.3 * (1 - s.night)).getHex();
    this.scene.fog.color.setHex(wet(fog, r));
    this.scene.fog.near = 20 - r * 6;
    this.scene.fog.far = 52 - r * 12;
    // jetpack sky level: the city below sinks into haze
    const hz = this.skyHaze ?? 0;
    if (hz > 0) {
      this.scene.fog.near += (6 - this.scene.fog.near) * hz;
      this.scene.fog.far += (34 - this.scene.fog.far) * hz;
    }
    this.backdrop.update(dt, performance.now() / 1000, camPos, s, this.scene.fog.color.getHex(), s.night * (1 - r * 0.3));

    // sky texture (redrawn only when it visibly changes)
    const key = `${Math.round(this.phase * 120)}|${Math.round(r * 5)}|${this.district.id}|${this.aspect.toFixed(3)}`;
    if (key !== this.skyKey) {
      this.skyKey = key;
      const t = TX.skyTexture(this.aspect, this.horizon, {
        top: hex(wet(s.top, r)), mid: hex(wet(s.mid, r)), hor: hex(this.scene.fog.color.getHex()),
        tower1: hex(wet(s.t1, r)), tower2: hex(wet(s.t2, r)),
        stars: s.night * (1 - r), lights: s.night, clouds: 1 - s.night * 0.6 + r * 0.5,
        cloud: r > 0.3 ? '150,160,190' : s.night > 0.5 ? '90,90,150' : '255,255,255',
      });
      if (this.scene.background) this.scene.background.dispose();
      this.scene.background = t;
    }

    // rain streaks
    this.rainMat.opacity = r * 0.55;
    this.rainMesh.visible = r > 0.02;
    if (this.rainMesh.visible) {
      const a = this.rainGeo.attributes.position.array;
      this.drops.forEach((d, i) => {
        d[1] -= dt * 16;
        if (d[1] < 0) { d[1] = 14; d[0] = rnd(-12, 12); d[2] = rnd(-28, 4); }
        const x = camPos.x + d[0], y = d[1], z = camPos.z + d[2];
        a.set([x, y, z, x + 0.05, y + 0.45, z], i * 6);
      });
      this.rainGeo.attributes.position.needsUpdate = true;
    }

    setAmbience({ rain: r, night: s.night });
    setMood(this.district.id, s.night);
  }
}

function rnd(a, b) { return a + Math.random() * (b - a); }
