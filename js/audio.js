// Synthesized sound: effects with variants and stereo movement, a looping city ambience with
// random distant events, rain, and procedural synthwave music. Nothing to download.
let ctx = null;
let master, sfxBus, musicBus, ambBus;
let muted = false;
let musicOn = true;
try {
  muted = localStorage.getItem('muted') === '1';
  musicOn = localStorage.getItem('music') !== '0';
} catch {}

const MUSIC_VOL = 0.06;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clampPan = (p) => Math.max(-1, Math.min(1, p));

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 1;
    // gentle limiter so stacked effects never clip
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.9;
    sfxBus.connect(master);
    musicBus = ctx.createGain();
    musicBus.gain.value = musicOn ? MUSIC_VOL : 0;
    musicBus.connect(master);
    ambBus = ctx.createGain();
    ambBus.gain.value = 0.5;
    ambBus.connect(master);
    startAmbience();
    startMusic();
  }
  if (ctx.state === 'suspended' && !audioPaused) ctx.resume();
  return ctx;
}

// While the app is hidden the whole audio graph is suspended (no music, no effects).
let audioPaused = false;
export function setAudioPaused(p) {
  audioPaused = p;
  if (!ctx) return;
  if (p) ctx.suspend();
  else if (!muted) ctx.resume();
}

const ready = () => (ctx && !muted && !audioPaused ? ctx : null);

// Destination with optional stereo position (pan) moving to panTo over dur.
function out(c, bus, t, dur, pan, panTo) {
  if (pan == null || !c.createStereoPanner) return bus;
  const p = c.createStereoPanner();
  p.pan.setValueAtTime(clampPan(pan), t);
  if (panTo != null) p.pan.linearRampToValueAtTime(clampPan(panTo), t + dur);
  p.connect(bus);
  return p;
}

// o: { type, vol, slide, delay, bus, at, pan, panTo, attack }
function tone(freq, dur, o = {}) {
  const c = ready();
  if (!c) return;
  const t = o.at ?? c.currentTime + (o.delay ?? 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type ?? 'square';
  osc.frequency.setValueAtTime(freq, t);
  if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
  const vol = o.vol ?? 0.05;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + (o.attack ?? 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(out(c, o.bus ?? sfxBus, t, dur, o.pan, o.panTo));
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

let whiteBuf = null, pinkBuf = null;
function whiteBuffer(c) {
  if (!whiteBuf) {
    whiteBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = whiteBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return whiteBuf;
}
// Pink noise (Paul Kellet's filter): softer and more natural than white noise.
function pinkBuffer(c) {
  if (!pinkBuf) {
    pinkBuf = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
    const d = pinkBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852; b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  }
  return pinkBuf;
}

// o: { vol, cutoff, to (cutoff sweep), type, q, delay, bus, at, pan, panTo, pink, swell }
function noise(dur, o = {}) {
  const c = ready();
  if (!c) return;
  const t = o.at ?? c.currentTime + (o.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = o.pink ? pinkBuffer(c) : whiteBuffer(c);
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'lowpass';
  f.frequency.setValueAtTime(o.cutoff ?? 1000, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  f.Q.value = o.q ?? 1;
  const g = c.createGain();
  const vol = o.vol ?? 0.1;
  if (o.swell) {
    // rises to the middle and fades: something passing by
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + dur * o.swell);
  } else {
    g.gain.setValueAtTime(vol, t);
  }
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out(c, o.bus ?? sfxBus, t, dur, o.pan, o.panTo));
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.02);
}

// Filtered noise whose band sweeps up and back down while panning across: a pass-by.
function whoosh(dur, vol, f0, f1, f2, o = {}) {
  const c = ready();
  if (!c) return;
  const t = c.currentTime + (o.delay ?? 0);
  const src = c.createBufferSource();
  src.buffer = pinkBuffer(c);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = o.q ?? 1;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.45);
  f.frequency.exponentialRampToValueAtTime(f2, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out(c, o.bus ?? sfxBus, t, dur, o.pan, o.panTo));
  src.start(t, Math.random() * 3);
  src.stop(t + dur + 0.05);
}

// ---------------------------------------------------------------- ambience
let cityGain, rainGain, nightGain;
let rainLevel = 0;

function loopNoise(filters) {
  const src = ctx.createBufferSource();
  src.buffer = pinkBuffer(ctx);
  src.loop = true;
  let node = src;
  for (const [type, freq] of filters) {
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    node.connect(f);
    node = f;
  }
  const g = ctx.createGain();
  g.gain.value = 0;
  node.connect(g);
  src.start();
  return g;
}

function startAmbience() {
  cityGain = loopNoise([['lowpass', 320]]);
  cityGain.connect(ambBus);
  // rain: band-limited pink noise with slow gusts, plus separate droplets
  rainGain = loopNoise([['highpass', 500], ['lowpass', 2000]]);
  const gust = ctx.createGain();
  rainGain.connect(gust).connect(ambBus);
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.13;
  const depth = ctx.createGain();
  depth.gain.value = 0.35;
  lfo.connect(depth).connect(gust.gain);
  lfo.start();
  setInterval(() => {
    if (!ready() || rainLevel < 0.05) return;
    noise(rnd(0.01, 0.03), { vol: rnd(0.003, 0.01) * rainLevel, cutoff: rnd(2500, 6000), type: 'bandpass', q: 2, delay: rnd(0, 0.05), bus: ambBus, pan: rnd(-0.8, 0.8) });
  }, 45);
  // night: faint electric hum of the neon
  const o = ctx.createOscillator();
  o.frequency.value = 60;
  nightGain = ctx.createGain();
  nightGain.gain.value = 0;
  o.connect(nightGain).connect(ambBus);
  o.start();
  // distant life of the city
  setInterval(distantEvent, 1000);
}

let nightLevel = 0;
export function setAmbience({ rain = 0, night = 0 }) {
  if (!ctx) return;
  rainLevel = rain;
  nightLevel = night;
  const t = ctx.currentTime;
  cityGain.gain.setTargetAtTime(0.045 * (1 - night * 0.5), t, 0.5);
  rainGain.gain.setTargetAtTime(0.022 * rain, t, 0.8);
  nightGain.gain.setTargetAtTime(0.006 * night, t, 0.5);
}

// Every second there is a chance of something happening far away.
function distantEvent() {
  if (!ready() || Math.random() > 0.16) return;
  const amb = { bus: ambBus };
  const pan = rnd(-0.9, 0.9);
  const day = 1 - nightLevel;
  const events = [
    [3 * day * (moodName === 'eco' ? 3 : 1) * (1 - rainLevel), () => {
      // birds
      const f = rnd(2600, 3800);
      for (let i = 0; i < 3; i++) tone(f * rnd(0.95, 1.1), 0.07, { ...amb, type: 'sine', vol: 0.006, slide: f * 1.3, delay: i * 0.11, pan });
    }],
    [2, () => {
      // distant car horn
      const f = rnd(330, 450);
      tone(f, 0.25, { ...amb, type: 'square', vol: 0.004, pan });
      tone(f * 1.26, 0.25, { ...amb, type: 'square', vol: 0.003, pan });
    }],
    [1 + nightLevel * 2, () => {
      // far away siren
      for (let i = 0; i < 3; i++) tone(650, 0.4, { ...amb, type: 'triangle', vol: 0.005, slide: 900, delay: i * 0.8, pan, panTo: -pan });
    }],
    [2, () => whoosh(2.2, 0.012, 300, 900, 250, { bus: ambBus, pan: -pan, panTo: pan })],
    [moodName === 'tokyo' ? 3 : 0, () => {
      // pedestrian crossing melody somewhere
      for (let i = 0; i < 6; i++) tone(i % 2 ? 2100 : 2600, 0.08, { ...amb, type: 'sine', vol: 0.005, delay: i * 0.18, pan });
    }],
    [moodName === 'industrial' ? 4 : 0.3, () => {
      // hammer on metal
      for (let i = 0; i < 3; i++) {
        tone(rnd(900, 1300), 0.12, { ...amb, type: 'square', vol: 0.003, delay: i * 0.45, pan });
        noise(0.05, { ...amb, vol: 0.01, cutoff: 2000, type: 'bandpass', q: 3, delay: i * 0.45, pan });
      }
    }],
    [1.5, () => {
      // crowd laugh / chatter blip
      const f = rnd(250, 400);
      for (let i = 0; i < 4; i++) tone(f * rnd(0.8, 1.4), 0.08, { ...amb, type: 'triangle', vol: 0.003, slide: f * rnd(0.8, 1.5), delay: i * 0.1, pan });
    }],
  ];
  let sum = 0;
  for (const [w] of events) sum += w;
  let r = Math.random() * sum;
  for (const [w, fn] of events) if ((r -= w) <= 0) { fn(); return; }
}

// ---------------------------------------------------------------- music
// A small procedural composer. Every district has a style (scales, tempo, drum grooves, bass
// lines, arpeggios, lead timbre); a song is a random arrangement of 4-bar sections with freshly
// written motifs, and when it ends a new one is written, so the music keeps changing.
const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  insen: [0, 1, 5, 7, 10],
  hirajoshi: [0, 2, 3, 7, 8],
  penta: [0, 3, 5, 7, 10],
};

// chord progressions as scale degrees (0 = tonic)
const STYLES = {
  downtown: {
    bpm: [108, 118], root: [45, 43, 47], scales: ['minor', 'dorian'], lead: ['square', 'sawtooth'],
    progs: [[0, 5, 2, 6], [0, 3, 4, 4], [5, 3, 0, 4], [0, 6, 5, 4], [0, 2, 5, 4]],
    drums: ['four', 'break', 'four'], bass: ['octave', 'pulse', 'syncop'], arps: ['up', 'updown', 'gallop'], swing: 0,
  },
  tokyo: {
    bpm: [118, 130], root: [47, 45, 50], scales: ['insen', 'hirajoshi', 'minor'], lead: ['triangle', 'square'],
    progs: [[0, 3, 1, 4], [0, 1, 3, 2], [0, 4, 3, 1]],
    drums: ['break', 'four', 'shuffle'], bass: ['syncop', 'octave'], arps: ['updown', 'random', 'down'], swing: 0,
  },
  eco: {
    bpm: [90, 100], root: [48, 50, 53], scales: ['major', 'lydian', 'mixolydian'], lead: ['sine', 'triangle'],
    progs: [[0, 4, 5, 3], [0, 3, 0, 4], [3, 4, 2, 5], [0, 5, 3, 4]],
    drums: ['half', 'soft', 'shuffle'], bass: ['walk', 'dub'], arps: ['up', 'pluck', 'updown'], swing: 0.12,
  },
  industrial: {
    bpm: [100, 112], root: [40, 41, 43], scales: ['phrygian', 'minor'], lead: ['sawtooth', 'square'],
    progs: [[0, 1, 0, 6], [0, 0, 1, 2], [0, 5, 1, 0]],
    drums: ['industrial', 'four', 'break'], bass: ['pulse', 'octave'], arps: ['down', 'gallop'], swing: 0,
  },
  port: {
    bpm: [100, 110], root: [44, 46, 42], scales: ['dorian', 'mixolydian', 'penta'], lead: ['triangle', 'sine'],
    progs: [[0, 3, 4, 3], [0, 6, 3, 4], [0, 4, 6, 3]],
    drums: ['dub', 'half', 'shuffle'], bass: ['dub', 'walk'], arps: ['up', 'pluck'], swing: 0.08,
  },
};

// 16-step grooves: k kick, s snare, h closed hat, o open hat, c clap, m metal perc
const DRUMS = {
  four: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.', o: '..............x.' },
  break: { k: 'x.....x...x.....', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.x.' },
  half: { k: 'x.........x.....', s: '........x.......', h: 'x...x...x...x...' },
  soft: { k: 'x.......x.......', h: '....x.......x...', c: '............x...' },
  shuffle: { k: 'x.....x.x.......', s: '....x.......x...', h: 'x..x..x.x..x..x.' },
  industrial: { k: 'x..x..x.x..x....', s: '....x.......x...', m: '..x...x..x.....x', h: 'x...x...x...x...' },
  dub: { k: 'x.......x.....x.', s: '........x.......', h: '..x...x...x...x.', echo: 1 },
};

const ARRANGEMENTS = [
  ['intro', 'A', 'B', 'A', 'break', 'B'],
  ['intro', 'A', 'A', 'B', 'break', 'A'],
  ['A', 'B', 'break', 'B', 'A'],
  ['intro', 'B', 'A', 'break', 'A', 'B'],
  ['intro', 'A', 'break', 'B', 'B'],
];
const SECTION = {
  intro: { drums: 0, hats: 1, bass: 1, arp: 1, lead: 0, pad: 1 },
  A: { drums: 1, bass: 1, arp: 1, lead: 1, pad: 0 },
  B: { drums: 1, bass: 1, arp: 0, lead: 1, pad: 1 },
  break: { drums: 0, bass: 0, arp: 1, lead: 0, pad: 1 },
};
const RHYTHMS = ['x.x.x...x.x.x...', 'x..x..x.x...x...', 'x...x.x...x.xx..', 'xx..x...x.x.x...', 'x.....x.x..x.x..', 'x..x....x..x.x.x', 'x.xx..x...x.....'];

let moodName = 'downtown';
let calm = 0;
let song = null;
let step = 0;
let nextTime = 0;

// a 2-bar melody: a random rhythm with a walk over scale degrees
function motif() {
  const rhythm = pick(RHYTHMS) + pick(RHYTHMS);
  const notes = [];
  let deg = pick([0, 2, 4, 7]);
  for (let i = 0; i < 32; i++) {
    if (rhythm[i] !== 'x') { notes.push(null); continue; }
    deg = Math.max(-2, Math.min(9, deg + pick([-2, -1, -1, 1, 1, 2, 0, 3])));
    notes.push(deg);
  }
  // end the phrase on a chord tone
  for (let i = 31; i >= 0; i--) if (notes[i] != null) { notes[i] = pick([0, 2, 4]); break; }
  return notes;
}

function newSong(name) {
  const st = STYLES[name] ?? STYLES.downtown;
  const progA = pick(st.progs);
  const others = st.progs.filter((p) => p !== progA);
  return {
    name, st,
    scale: SCALES[pick(st.scales)],
    root: pick(st.root),
    bpm: rnd(st.bpm[0], st.bpm[1]),
    progA, progB: others.length ? pick(others) : progA,
    sections: pick(ARRANGEMENTS),
    drumA: pick(st.drums), drumB: pick(st.drums),
    bassA: pick(st.bass), bassB: pick(st.bass),
    arpA: pick(st.arps), arpB: pick(st.arps),
    motifA: motif(), motifB: motif(),
    lead: pick(st.lead),
    swing: st.swing,
  };
}

function deg2midi(scale, root, d) {
  const n = scale.length;
  const o = Math.floor(d / n);
  return root + scale[((d % n) + n) % n] + 12 * o;
}

function scheduleStep(t) {
  if (!song) song = newSong(moodName);
  let bar = Math.floor(step / 16);
  let s = step % 16;
  // district changed: start a song in the new style on the next bar
  if (s === 0 && song.name !== moodName) { song = newSong(moodName); step = 0; bar = 0; }
  if (Math.floor(bar / 4) >= song.sections.length) { song = newSong(moodName); step = 0; bar = 0; s = 0; }

  const sec = song.sections[Math.floor(bar / 4)];
  const F = SECTION[sec];
  const isB = sec === 'B';
  const beat = 60 / song.bpm / 4;
  const at = t + (s % 2 ? song.swing * beat : 0);
  const m = { bus: musicBus, at };
  const { scale, root } = song;
  const chordDeg = (isB ? song.progB : song.progA)[bar % 4];
  const chord = [0, 2, 4].map((k) => deg2midi(scale, root, chordDeg + k));
  const lastBar = bar % 4 === 3;

  // drums (night keeps only a soft kick)
  const D = DRUMS[isB ? song.drumB : song.drumA];
  const hit = (lane) => D[lane] && D[lane][s] === 'x';
  if (F.drums && calm < 0.7) {
    if (hit('k')) tone(110, 0.18, { ...m, type: 'sine', vol: 0.35, slide: 40 });
    const fill = lastBar && Math.floor(bar / 4) < song.sections.length - 1 && s >= 12;
    if (hit('s') || fill) {
      noise(0.12, { ...m, vol: fill ? 0.06 + (s - 12) * 0.02 : 0.12, cutoff: 1800, type: 'bandpass' });
      tone(185, 0.07, { ...m, type: 'triangle', vol: 0.04 });
      if (D.echo) noise(0.1, { ...m, at: at + beat * 3, vol: 0.04, cutoff: 1500, type: 'bandpass' });
    }
    if (hit('c')) noise(0.08, { ...m, vol: 0.1, cutoff: 1200, type: 'bandpass', q: 2 });
    if (hit('m')) tone(rnd(800, 1300), 0.05, { ...m, vol: 0.02 });
    if (hit('o')) noise(0.15, { ...m, vol: 0.04, cutoff: 6000, type: 'highpass' });
  } else if (F.drums && s % 8 === 0) {
    tone(100, 0.2, { ...m, type: 'sine', vol: 0.2, slide: 40 });
  }
  if ((F.drums || F.hats) && calm < 0.9 && hit('h')) noise(0.03, { ...m, vol: 0.045, cutoff: 7000, type: 'highpass' });

  // bass
  if (F.bass) {
    const r = chord[0] - 12;
    const bassStyle = isB ? song.bassB : song.bassA;
    const play = (n, len, vol = 0.2) => tone(mtof(n), beat * len, { ...m, type: 'triangle', vol });
    if (bassStyle === 'octave' && s % 2 === 0) play(r + (s % 4 ? 12 : 0), 1.8);
    else if (bassStyle === 'pulse' && s % 4 !== 3) play(r, 0.9, 0.16);
    else if (bassStyle === 'syncop' && 'x..x..x...x.x...'[s] === 'x') play(r + (s === 10 ? 7 : 0), 1.6);
    else if (bassStyle === 'walk' && s % 4 === 0) play([r, chord[1] - 12, chord[2] - 12, r + 12][s / 4], 3.5);
    else if (bassStyle === 'dub' && (s === 0 || s === 8)) tone(mtof(r - 12), beat * 7, { ...m, type: 'sine', vol: 0.3, slide: mtof(r - 12) * 0.98 });
  }

  // arpeggio over the chord
  if (F.arp) {
    const tones = [chord[0], chord[1], chord[2], chord[0] + 12];
    const style = isB ? song.arpB : song.arpA;
    let n = null;
    if (style === 'up') n = tones[s % 4];
    else if (style === 'down') n = tones[3 - (s % 4)];
    else if (style === 'updown') n = [0, 1, 2, 3, 2, 1][s % 6] !== undefined ? tones[[0, 1, 2, 3, 2, 1][s % 6]] : null;
    else if (style === 'random') n = pick(tones);
    else if (style === 'gallop') n = 'xx.xx.xx.xx.xx.x'[s] === 'x' ? tones[Math.floor(s / 3) % 4] : null;
    else if (style === 'pluck') n = s % 4 === 2 ? pick(tones) + 12 : null;
    if (n != null && (calm < 0.8 || s % 2 === 0)) {
      tone(mtof(n + 12), beat * 0.9, { ...m, type: song.lead === 'sine' ? 'triangle' : 'square', vol: 0.03 * (1 - calm * 0.4) });
    }
  }

  // lead melody
  if (F.lead && calm < 0.95) {
    const mot = isB ? song.motifB : song.motifA;
    const d = mot[(bar % 2) * 16 + s];
    if (d != null) {
      const n = deg2midi(scale, root + 12, d + (bar % 4 === 2 ? chordDeg % 3 : 0));
      tone(mtof(n), beat * 1.7, { ...m, type: song.lead, vol: (song.lead === 'sine' ? 0.06 : 0.04) * (1 - calm * 0.5), attack: 0.01 });
    }
  }

  // pad
  if ((F.pad || calm > 0.5) && s === 0) {
    for (const n of chord) tone(mtof(n), beat * 15, { ...m, type: 'sine', vol: 0.025 + calm * 0.01, attack: 0.3 });
  }
}

function startMusic() {
  nextTime = ctx.currentTime + 0.1;
  setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    if (nextTime < ctx.currentTime) nextTime = ctx.currentTime + 0.05;
    while (nextTime < ctx.currentTime + 0.15) {
      if (musicOn && !muted) scheduleStep(nextTime);
      nextTime += 60 / (song?.bpm ?? 110) / 4;
      step++;
    }
  }, 30);
}

export function setMood(name, night = 0) {
  moodName = STYLES[name] ? name : 'downtown';
  calm = night;
}

// ---------------------------------------------------------------- effects
let lastChirp = 0;
let coinCombo = 0, lastCoin = 0;

// Struck metal bell of a level crossing: inharmonic partials with a long ring.
function bellStrike(vol, base, pan) {
  [[1, 1, 0.9], [2.76, 0.45, 0.6], [5.4, 0.22, 0.35], [8.93, 0.1, 0.2]].forEach(([k, v, d]) => {
    tone(base * k, d, { type: 'sine', vol: vol * v, pan });
  });
  tone(base * 0.5, 0.25, { type: 'triangle', vol: vol * 0.15, pan });
}

// One wheel hitting a rail joint.
function clack(at, vol, f, pan) {
  noise(0.03, { at, vol, cutoff: f, type: 'bandpass', q: 3, pan });
  tone(95, 0.05, { at, type: 'sine', vol: vol * 0.6, pan });
}

const TRAIN_HORNS = [
  // classic two-tone air horn: long, short, long
  (k) => [[0, 0.5], [0.6, 0.18], [0.85, 0.6]].forEach(([d, l]) => {
    tone(294, l, { type: 'sawtooth', vol: 0.016 * k, delay: d, attack: 0.03 });
    tone(370, l, { type: 'sawtooth', vol: 0.014 * k, delay: d, attack: 0.03 });
  }),
  // three-note chord
  (k) => [294, 370, 440].forEach((f) => tone(f, 1.2, { type: 'sawtooth', vol: 0.011 * k, attack: 0.06, slide: f * 0.97 })),
  // two quick toots
  (k) => [0, 0.32].forEach((d) => {
    tone(330, 0.22, { type: 'square', vol: 0.014 * k, delay: d, attack: 0.02 });
    tone(415, 0.22, { type: 'square', vol: 0.01 * k, delay: d, attack: 0.02 });
  }),
  // modern maglev chime
  (k) => [880, 698, 523].forEach((f, i) => tone(f, 0.6, { type: 'sine', vol: 0.03 * k, delay: i * 0.22 })),
];

// Continuous rotor / emitter hum of the nearest drone; the game sets its level every frame.
const hums = {};
const HUMS = {
  patrol: { f: [180, 186], type: 'sawtooth', cutoff: 1100, trem: 28, vol: 0.07 },
  scanner: { f: [430, 437], type: 'square', cutoff: 1800, trem: 9, vol: 0.035 },
  water: { noise: true, cutoff: 650, trem: 0.45, vol: 0.09 },
  hunter: { f: [96, 99], type: 'sawtooth', cutoff: 650, trem: 24, vol: 0.11 },
};
function humNode(name) {
  if (!hums[name]) {
    const d = HUMS[name];
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = d.cutoff;
    const trem = ctx.createGain();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = d.trem;
    const depth = ctx.createGain();
    depth.gain.value = 0.35;
    lfo.connect(depth).connect(trem.gain);
    lfo.start();
    const g = ctx.createGain();
    g.gain.value = 0;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (d.noise) {
      // lapping water: slow swells of soft band-passed noise
      filter.type = 'bandpass';
      const src = ctx.createBufferSource();
      src.buffer = pinkBuffer(ctx);
      src.loop = true;
      src.connect(filter);
      src.start();
    } else {
      for (const f of d.f) {
        const o = ctx.createOscillator();
        o.type = d.type;
        o.frequency.value = f;
        o.connect(filter);
        o.start();
      }
    }
    filter.connect(trem).connect(g).connect(pan).connect(sfxBus);
    hums[name] = { g, pan, vol: d.vol };
  }
  return hums[name];
}

export const sfx = {
  unlock: () => { if (!muted) ac(); },
  hum: (name, level, pan = 0) => {
    if (!ctx) return;
    const h = humNode(name);
    const t = ctx.currentTime;
    h.g.gain.setTargetAtTime(level * level * h.vol, t, 0.08);
    if (h.pan.pan) h.pan.pan.setTargetAtTime(pan, t, 0.08);
  },
  click: () => { tone(1200, 0.04, { vol: 0.03 }); tone(1800, 0.03, { vol: 0.02, delay: 0.03 }); },

  // robot
  hop: () => {
    const p = rnd(0.92, 1.08);
    pick([
      () => { tone(300 * p, 0.06, { vol: 0.022, slide: 620 * p }); noise(0.02, { vol: 0.03, cutoff: 3000, type: 'highpass' }); },
      () => tone(500 * p, 0.08, { type: 'triangle', vol: 0.04, slide: 900 * p }),
      () => tone(700 * p, 0.05, { type: 'sine', vol: 0.04, slide: 1100 * p }),
    ])();
  },
  land: (surface) => {
    if (surface === 'road') noise(0.06, { vol: 0.05, cutoff: 420 });
    else if (surface === 'metal') { tone(rnd(1100, 1300), 0.06, { vol: 0.012 }); tone(2650, 0.09, { type: 'sine', vol: 0.01 }); }
    else if (surface === 'pad') tone(300, 0.1, { type: 'sine', vol: 0.03, slide: 520 });
    else if (surface === 'boat') { noise(0.05, { vol: 0.06, cutoff: 900, type: 'bandpass', q: 2 }); tone(210, 0.07, { type: 'triangle', vol: 0.03 }); noise(0.25, { vol: 0.02, cutoff: 1200, delay: 0.03 }); }
    else if (surface === 'grass') noise(0.05, { vol: 0.03, cutoff: 1600, type: 'bandpass', q: 0.8 });
    else { noise(0.025, { vol: 0.04, cutoff: 2200, type: 'bandpass', q: 3 }); tone(180, 0.04, { type: 'sine', vol: 0.02 }); }
  },
  bump: () => { noise(0.06, { vol: 0.08, cutoff: 500 }); tone(160, 0.1, { vol: 0.03, slide: 90 }); },
  coin: () => {
    const c = ready();
    if (!c) return;
    coinCombo = c.currentTime - lastCoin < 2.5 ? coinCombo + 1 : 0;
    lastCoin = c.currentTime;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    const n = 76 + scale[Math.min(coinCombo, scale.length - 1)];
    tone(mtof(n), 0.08, { vol: 0.04 });
    tone(mtof(n + 7), 0.16, { vol: 0.04, delay: 0.07 });
    tone(mtof(n + 12), 0.1, { type: 'sine', vol: 0.025, delay: 0.14 });
  },
  crossing: (tokyo) => {
    // talking traffic light on the zebra
    if (tokyo) for (let i = 0; i < 4; i++) tone(i % 2 ? 2100 : 2600, 0.07, { type: 'sine', vol: 0.02, delay: i * 0.15 });
    else for (let i = 0; i < 4; i++) tone(1400, 0.03, { vol: 0.015, delay: i * 0.12 });
  },

  // deaths
  crash: () => {
    noise(0.45, { vol: 0.35, cutoff: 1800 });
    tone(220, 0.3, { type: 'sawtooth', vol: 0.05, slide: 60 });
    for (let i = 0; i < 5; i++) tone(rnd(1500, 3500), 0.05, { vol: 0.015, delay: 0.05 + i * rnd(0.03, 0.07) });
    sfx.powerDown(0.3);
  },
  splash: () => {
    noise(0.6, { vol: 0.3, cutoff: 3000, to: 500, type: 'lowpass' });
    tone(90, 0.25, { type: 'sine', vol: 0.06, slide: 50 });
    for (let i = 0; i < 7; i++) tone(rnd(400, 900), 0.06, { type: 'sine', vol: 0.025, slide: rnd(900, 1600), delay: 0.25 + i * rnd(0.06, 0.12) });
    sfx.powerDown(0.4);
  },
  fall: () => { tone(900, 0.8, { type: 'sine', vol: 0.05, slide: 80 }); noise(0.6, { vol: 0.1, cutoff: 500, delay: 0.6 }); },
  powerDown: (delay = 0) => { tone(700, 0.8, { type: 'sawtooth', vol: 0.022, slide: 50, delay }); tone(1400, 0.5, { type: 'sine', vol: 0.015, slide: 200, delay }); },
  death: () => [12, 7, 3, 0].forEach((n, i) => tone(mtof(64 + n), 0.16, { vol: 0.03, delay: 0.5 + i * 0.12 })),

  // traffic
  horn: (kind, k = 1) => {
    if (kind === 'truck' || kind === 'bus') {
      tone(150, 0.55, { type: 'sawtooth', vol: 0.05 * k, attack: 0.03 });
      tone(190, 0.55, { type: 'sawtooth', vol: 0.04 * k, attack: 0.03 });
    } else if (kind === 'hovercar' || kind === 'hovertruck') {
      for (let i = 0; i < 2; i++) tone(620, 0.14, { type: 'sine', vol: 0.04 * k, slide: 880, delay: i * 0.18 });
    } else if (kind === 'taxi') {
      tone(440, 0.4, { vol: 0.04 * k });
      tone(554, 0.4, { vol: 0.032 * k });
    } else {
      for (let i = 0; i < 2; i++) {
        const f = rnd(380, 460);
        tone(f, 0.13, { vol: 0.025 * k, delay: i * 0.17 });
        tone(f * 1.26, 0.13, { vol: 0.02 * k, delay: i * 0.17 });
      }
    }
  },
  // passing traffic; dir = direction of travel (-1 / 1) for the stereo sweep, voice = per-car pitch
  pass: (kind, k = 1, dir = 1, voice = 1) => {
    const pan = -dir * 0.8, panTo = dir * 0.8;
    if (kind === 'boat') {
      // putt-putt of a small motor and a wash of water
      for (let i = 0; i < 6; i++) tone(48 * voice, 0.06, { type: 'square', vol: 0.02 * k, delay: i * 0.11, pan: pan + (panTo - pan) * i / 6 });
      whoosh(0.9, 0.08 * k, 300, 700, 260, { q: 0.6, pan, panTo });
    } else if (kind === 'hovercar' || kind === 'hovertruck') {
      const f = (kind === 'hovertruck' ? 300 : 520) * voice;
      tone(f, 0.75, { type: 'sine', vol: 0.06 * k, slide: f * 1.7, pan, panTo });
      tone(f * 1.5, 0.6, { type: 'triangle', vol: 0.022 * k, slide: f * 2.4, pan, panTo });
      whoosh(0.6, 0.12 * k, 1200, 3000, 900, { q: 2, pan, panTo });
    } else if (kind === 'truck' || kind === 'bus') {
      tone(55 * voice, 0.9, { type: 'sawtooth', vol: 0.07 * k, slide: 44 * voice, pan, panTo });
      tone(110 * voice, 0.7, { type: 'square', vol: 0.016 * k, slide: 90 * voice, pan, panTo });
      whoosh(0.95, 0.3 * k, 200, 700, 160, { q: 0.8, pan, panTo });
      if (Math.random() < 0.3) noise(0.45, { vol: 0.06 * k, cutoff: 3500, type: 'highpass', delay: 0.4, pan: panTo });
    } else {
      whoosh(0.7, 0.24 * k, 350 * voice, 1300 * voice, 300 * voice, { q: 0.9, pan, panTo });
      tone(100 * voice, 0.55, { type: 'sawtooth', vol: 0.028 * k, slide: 78 * voice, pan, panTo });
    }
  },
  siren: (k = 1) => {
    for (let i = 0; i < 2; i++) {
      tone(720, 0.35, { vol: 0.014 * k, slide: 1050, delay: i * 0.7 });
      tone(1050, 0.35, { vol: 0.014 * k, slide: 720, delay: i * 0.7 + 0.35 });
    }
  },
  // monorail far overhead: barely audible on purpose
  monorail: (k = 1) => whoosh(1.8, 0.012 * k, 250, 600, 200, { q: 0.7 }),

  // trains
  crossingBell: (k = 1, side = 1) => bellStrike(0.06 * k, side > 0 ? 880 : 835, side * 0.45),
  trainHorn: (k = 1) => pick(TRAIN_HORNS)(k),
  // rumble, whine and the rhythmic clatter of wheels over rail joints, with doppler and pan sweep
  trainPass: (k = 1, dir = 1) => {
    const c = ready();
    if (!c) return;
    const t = c.currentTime;
    const pan = -dir, panTo = dir;
    noise(1.6, { vol: 0.14 * k, cutoff: 300, to: 160, swell: 0.4, pink: true, pan: pan * 0.7, panTo: panTo * 0.7 });
    whoosh(1.3, 0.22 * k, 300, 1300, 240, { q: 0.7, pan, panTo });
    tone(900, 1.2, { type: 'sine', vol: 0.008 * k, slide: 520, pan, panTo });
    const n = 14;
    for (let i = 0; i < n; i++) {
      const x = i / (n - 1);                       // 0 -> 1 along the pass
      const near = 1 - Math.abs(x - 0.45) * 1.6;    // loudest when closest
      const f = 2600 - x * 1400;                    // doppler: higher, then lower
      const at = t + x * 1.1;
      const p = pan + (panTo - pan) * x;
      clack(at, 0.06 * k * Math.max(0.15, near), f, p * 0.8);
      clack(at + 0.05, 0.05 * k * Math.max(0.15, near), f * 0.95, p * 0.8);
    }
  },

  // security
  laserCharge: () => { tone(200, 0.85, { type: 'sawtooth', vol: 0.02, slide: 1400 }); for (let i = 0; i < 4; i++) tone(600 + i * 200, 0.05, { type: 'sine', vol: 0.015, delay: i * 0.2 }); },
  laserZap: () => { tone(rnd(1600, 2000), 0.25, { type: 'sawtooth', vol: 0.04, slide: 120 }); noise(0.2, { vol: 0.06, cutoff: 4000, type: 'highpass' }); },
  scanBeep: () => tone(pick([1500, 1600, 1750]), 0.05, { vol: 0.03 }),
  shock: () => { for (let i = 0; i < 6; i++) noise(0.05, { vol: rnd(0.08, 0.15), cutoff: rnd(2500, 5000), type: 'bandpass', q: 4, delay: i * rnd(0.03, 0.06) }); },
  alarm: () => { tone(880, 0.12, { vol: 0.05 }); tone(660, 0.12, { vol: 0.05, delay: 0.13 }); },
  drone: () => tone(300, 0.8, { type: 'sawtooth', vol: 0.03, slide: 900 }),

  // pedestrian "voices": little synthesized syllables
  chirp: (kind = 'hi') => {
    const c = ready();
    if (!c || c.currentTime - lastChirp < 0.25) return;
    lastChirp = c.currentTime;
    const base = rnd(320, 720);
    const shapes = {
      hi: [[1, 1.4], [1.4, 1.2]],
      wow: [[0.8, 1.6], [1.6, 0.9]],
      love: [[1.2, 1.5], [1.5, 1.3], [1.3, 1.6]],
      angry: [[0.7, 0.6], [0.6, 0.5]],
      what: [[1, 0.9], [0.9, 1.5]],
    }[kind] ?? [[1, 1.3]];
    const type = pick(['triangle', 'sine', 'square']);
    shapes.forEach(([a, b], i) => tone(base * a, 0.09, { type, vol: type === 'square' ? 0.02 : 0.05, slide: base * b, delay: i * 0.09 }));
  },
  photo: () => { noise(0.04, { vol: 0.15, cutoff: 5000, type: 'highpass' }); tone(2400, 0.05, { vol: 0.015, delay: 0.05 }); },

  // construction, bridges, people
  creak: (k = 1) => { tone(rnd(70, 90), 0.5, { type: 'sawtooth', vol: 0.025 * k, slide: rnd(55, 65) }); noise(0.4, { vol: 0.02 * k, cutoff: 900, type: 'bandpass', q: 6 }); },
  beamWarn: () => tone(1250, 0.06, { vol: 0.025 }),
  beamFall: (k = 1) => tone(1800, 0.3, { type: 'sine', vol: 0.025 * k, slide: 500 }),
  clang: (k = 1) => {
    [[420, 0.6], [1130, 0.4], [2290, 0.25]].forEach(([f, d]) => tone(f, d, { type: 'square', vol: 0.03 * k, slide: f * 0.97 }));
    noise(0.3, { vol: 0.2 * k, cutoff: 600 });
  },
  bridgeMotor: (k = 1) => { tone(70, 1.0, { type: 'sawtooth', vol: 0.03 * k, slide: 95, attack: 0.1 }); tone(140, 1.0, { type: 'square', vol: 0.008 * k, slide: 190, attack: 0.1 }); },
  clap: () => {
    noise(0.05, { vol: 0.25, cutoff: 2200, type: 'bandpass', q: 1 });
    [0, 4, 7, 12].forEach((n, i) => tone(mtof(72 + n), 0.1, { vol: 0.03, delay: 0.05 + i * 0.05 }));
  },
  cheer: () => { for (let i = 0; i < 6; i++) tone(rnd(500, 900), 0.12, { type: 'triangle', vol: 0.02, slide: rnd(900, 1400), delay: i * 0.06 }); },
  courier: () => { tone(1400, 0.05, { type: 'sine', vol: 0.025 }); tone(1900, 0.06, { type: 'sine', vol: 0.025, delay: 0.07 }); },

  // jingles
  start: () => [0, 4, 7, 12].forEach((n, i) => tone(mtof(64 + n), 0.12, { vol: 0.035, delay: i * 0.07 })),
  newBest: () => [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(mtof(67 + n), 0.14, { vol: 0.035, delay: i * 0.08 })),
  district: () => [0, 7, 12].forEach((n, i) => tone(mtof(72 + n), 0.4, { type: 'sine', vol: 0.04, delay: i * 0.12 })),
  thunder: () => { noise(2.2, { vol: 0.2, cutoff: 140, pink: true }); noise(0.6, { vol: 0.08, cutoff: 500, delay: 0.05 }); },
};

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('muted', m ? '1' : '0'); } catch {}
  if (master) master.gain.value = m ? 0 : 1;
}

export const isMusicOn = () => musicOn;
export function setMusic(on) {
  musicOn = on;
  try { localStorage.setItem('music', on ? '1' : '0'); } catch {}
  if (musicBus) musicBus.gain.value = on ? MUSIC_VOL : 0;
}
