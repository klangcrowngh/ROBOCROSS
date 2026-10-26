// Pedestrians: they stand or stroll along sidewalks and react to the robot.
import * as THREE from 'three';
import * as M from './models.js';
import * as TX from './textures.js';
import { sfx } from './audio.js';

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Reactions when the robot comes close: [bubble, voice]
const GREETINGS = [['hi', 'hi'], ['heart', 'love'], ['!', 'wow'], ['photo', 'hi'], ['note', 'hi'], ['wow', 'wow']];

let HALF = 3;
export function configure(half) { HALF = half; }

// mode: 'stand' or 'walk'; role: null, 'five' (waits for a high five), 'fan' (runs after the
// robot and cheers) or 'courier' (delivery robot rolling along the sidewalk)
export function spawnPerson(lane, x, mode, face = 0, role = null) {
  const m = role === 'courier' ? M.makeCourier() : M.makePerson();
  const p = {
    ...m, mode, x, z: rand(-0.12, 0.12), role,
    dir: Math.random() < 0.5 ? 1 : -1,
    speed: role === 'courier' ? rand(1.1, 1.5) : rand(0.6, 1.0),
    face, faceTarget: face, dodge: 0,
    phase: rand(0, 6), wait: 0, cool: rand(0, 2), jump: 0,
    bubble: null, bubbleT: 0,
  };
  if (mode === 'walk') p.face = p.faceTarget = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  m.root.position.set(x, 0, p.z);
  m.root.rotation.y = p.face;
  lane.group.add(m.root);
  lane.people.push(p);
  if (role === 'five') hold(p, 'hand');
  return p;
}

// Is a cell occupied by a pedestrian (the robot cannot step there)?
export function personAt(lane, x) {
  return lane.people.find((p) => Math.abs(p.x - x) < 0.62);
}

// A bubble that stays until something happens (the raised palm of a high-fiver).
function hold(p, icon) {
  const s = new THREE.Sprite(TX.iconMaterial(icon).clone());
  s.scale.set(0.5, 0.5, 1);
  s.position.set(0, 1.5, 0);
  s.renderOrder = 20;
  p.root.add(s);
  p.held = s;
}

function say(p, icon, voice) {
  if (p.bubble) p.bubble.parent?.remove(p.bubble);
  const s = new THREE.Sprite(TX.iconMaterial(icon).clone());
  s.scale.set(0.5, 0.5, 1);
  s.position.set(0, 1.45, 0);
  s.renderOrder = 20;
  p.root.add(s);
  p.bubble = s;
  p.bubbleT = 1.4;
  p.jump = 1;
  if (voice) sfx.chirp(voice);
}

export function react(p, robotX, robotZLocal, kind) {
  if (kind === 'bump') {
    say(p, pick(['angry', '?']), 'angry');
    p.cool = 3;
  } else if (kind === 'scare') {
    say(p, '!', null);
    p.cool = 3;
  } else {
    const [icon, voice] = pick(GREETINGS);
    say(p, icon, voice);
    if (icon === 'photo') p.flash = 0.15;
    p.cool = rand(5, 9);
  }
  p.faceTarget = Math.atan2(robotX - p.x, robotZLocal - p.z);
}

// Called every frame for each lane. robot: { x, row, alive }
export function updatePeople(lane, dt, robot, time, onFlash, onFive) {
  for (const p of lane.people) {
    const dz = robot.row - lane.row;
    const near = Math.abs(dz) <= 1 && Math.abs(robot.x - p.x) < 1.7;
    p.cool -= dt;

    // high five when the robot steps next to them
    if (p.role === 'five' && p.held && robot.alive && !robot.hop && dz === 0 && Math.abs(robot.x - p.x) < 1.1) {
      p.root.remove(p.held);
      p.held = null;
      say(p, 'heart', 'love');
      p.faceTarget = Math.atan2(robot.x - p.x, -p.z);
      onFive(p);
    }
    if (p.held) p.held.position.y = 1.5 + Math.sin(time * 5) * 0.06;

    // fans run along the sidewalk after the robot, cheering
    if (p.role === 'fan' && robot.alive && Math.abs(dz) <= 2 && Math.abs(robot.x - p.x) < 6) {
      const gap = robot.x - p.x;
      if (Math.abs(gap) > 1.1 && dz === 0) {
        p.x += Math.sign(gap) * Math.min(Math.abs(gap) - 1.1, 2.4 * dt);
        p.phase += dt * 14;
        p.faceTarget = gap > 0 ? Math.PI / 2 : -Math.PI / 2;
      } else {
        p.faceTarget = Math.atan2(gap, -dz - p.z);
        if (p.jump <= 0 && Math.random() < dt * 2) { p.jump = 1; if (Math.random() < 0.3) { say(p, pick(['heart', 'wow', 'note']), null); sfx.cheer(); } }
      }
      const sw = Math.sin(p.phase) * 0.7;
      if (p.legs.length) { p.legs[0].rotation.x = sw; p.legs[1].rotation.x = -sw; }
    }

    if (p.mode === 'walk') {
      if (p.wait > 0) {
        p.wait -= dt;
        if (p.wait <= 0) {
          p.dir = -p.dir;
          p.faceTarget = p.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        }
      } else {
        const next = p.x + p.dir * 0.55;
        const cell = Math.round(next);
        const blockedCell = Math.abs(cell) <= HALF && lane.blocked.has(cell);
        const other = lane.people.find((q) => q !== p && Math.abs(q.x - next) < 0.45 && Math.sign(q.x - p.x) === p.dir);
        if (Math.abs(next) > 9 || blockedCell || other) {
          p.wait = rand(0.2, 0.6);
        } else {
          p.x += p.dir * p.speed * dt;
        }
      }
      const moving = p.wait <= 0;
      p.phase += dt * (moving ? 9 : 0);
      const sw = moving ? Math.sin(p.phase) * 0.6 : 0;
      if (p.legs.length) {
        p.legs[0].rotation.x = sw;
        p.legs[1].rotation.x = -sw;
      }
    }

    // Never block the robot: step out of its way to the edge of the sidewalk.
    const inWay = dz === 0 && Math.abs(robot.x - p.x) < 0.8;
    if (inWay && p.dodge === 0) {
      p.dodge = p.z >= 0 ? 1 : -1;
      if (p.cool <= 0) { say(p, pick(['wow', '!']), 'wow'); p.cool = 3; }
    } else if (!inWay && Math.abs(robot.x - p.x) > 1.3) p.dodge = 0;
    p.zNow = (p.zNow ?? p.z) + ((p.dodge ? p.dodge * 0.42 : p.z) - (p.zNow ?? p.z)) * Math.min(1, dt * 12);

    // greet the robot when it comes close (couriers just beep)
    if (near && robot.alive && p.cool <= 0) {
      if (p.role === 'courier') { sfx.courier(); p.cool = 4; }
      else if (p.role !== 'five' || !p.held) react(p, robot.x, -dz, 'greet');
    }
    // keep looking at the robot while it is near
    if (near && p.mode === 'stand') p.faceTarget = Math.atan2(robot.x - p.x, -dz - p.z);

    // smooth turn
    const d = ((p.faceTarget - p.face + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    p.face += d * Math.min(1, dt * 8);
    p.root.rotation.y = p.face;

    // hop of joy / surprise
    p.jump = Math.max(0, p.jump - dt * 3);
    p.root.position.set(p.x, p.role === 'courier' ? 0 : Math.sin(p.jump * Math.PI) * 0.25, p.zNow);
    p.body.position.y = p.mode === 'walk' && p.wait <= 0 ? Math.abs(Math.sin(p.phase)) * 0.04 : Math.sin(time * 2 + p.phase) * 0.01;

    // speech bubble floats up and fades
    if (p.bubble) {
      p.bubbleT -= dt;
      p.bubble.position.y = 1.45 + (1.4 - p.bubbleT) * 0.2;
      p.bubble.material.opacity = Math.min(1, p.bubbleT * 2);
      if (p.bubbleT <= 0) {
        p.root.remove(p.bubble);
        p.bubble.material.dispose();
        p.bubble = null;
      }
    }
    if (p.flash > 0) {
      onFlash(p);
      p.flash = 0;
    }
  }
}

// Everyone around a crash gets scared.
export function scareAround(lanes, x, row) {
  let any = false;
  for (const lane of lanes.values()) {
    if (Math.abs(lane.row - row) > 3) continue;
    for (const p of lane.people) {
      if (Math.abs(p.x - x) > 5) continue;
      react(p, x, row - lane.row, 'scare');
      any = true;
    }
  }
  if (any) sfx.chirp('wow');
}
